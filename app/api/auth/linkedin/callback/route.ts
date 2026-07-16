import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { encrypt } from '@/lib/encryption';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');

  const cookieStore = await cookies();
  const storedState = cookieStore.get('linkedin_oauth_state')?.value;

  // 1. Verify state (CSRF Protection)
  if (!state || !storedState || state !== storedState) {
    return NextResponse.json(
      { error: 'CSRF verification failed. State mismatch or expired.' },
      { status: 400 }
    );
  }

  // Clear state cookie immediately after validation
  cookieStore.delete('linkedin_oauth_state');

  if (!code) {
    return NextResponse.json(
      { error: 'Authorization code is missing.' },
      { status: 400 }
    );
  }

  // 2. Authenticate the current logged-in user via Supabase
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: 'Unauthorized. User session not found.' },
      { status: 401 }
    );
  }

  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: 'LINKEDIN_CLIENT_ID or LINKEDIN_CLIENT_SECRET is not configured.' },
      { status: 500 }
    );
  }

  const redirectUri = 'http://localhost:3000/api/auth/linkedin/callback';

  try {
    // 3. Exchange authorization code for tokens
    const tokenResponse = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      return NextResponse.json(
        { error: `Failed to exchange token: ${errorText}` },
        { status: 500 }
      );
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token || null;
    const expiresIn = tokenData.expires_in;

    if (!accessToken) {
      return NextResponse.json(
        { error: 'Access token not returned by LinkedIn.' },
        { status: 500 }
      );
    }

    // 4. Fetch the member's profile URN from the OIDC /userinfo endpoint
    const profileResponse = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!profileResponse.ok) {
      const profileError = await profileResponse.text();
      return NextResponse.json(
        { error: `Failed to retrieve LinkedIn profile: ${profileError}` },
        { status: 500 }
      );
    }

    const profileData = await profileResponse.json();
    const sub = profileData.sub;

    if (!sub) {
      return NextResponse.json(
        { error: 'LinkedIn URN (sub) not found in profile response.' },
        { status: 500 }
      );
    }

    const linkedinUrn = `urn:li:person:${sub}`;

    // 5. Encrypt tokens before storing in the database
    const encryptedAccessToken = encrypt(accessToken);
    const encryptedRefreshToken = refreshToken ? encrypt(refreshToken) : null;
    
    // Compute token expiry timestamp
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    // 6. Upsert LinkedIn Account linked to the logged-in user
    await prisma.linkedInAccount.upsert({
      where: { userId: user.id },
      update: {
        linkedinUrn,
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        expiresAt,
      },
      create: {
        userId: user.id,
        linkedinUrn,
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        expiresAt,
      },
    });

    // 7. Redirect back to the dashboard
    return NextResponse.redirect(new URL('/dashboard', request.url));
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'An unexpected error occurred during the callback.' },
      { status: 500 }
    );
  }
}
