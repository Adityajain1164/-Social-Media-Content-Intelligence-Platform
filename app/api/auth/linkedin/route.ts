import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import crypto from 'crypto';

export async function GET() {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;

  // Basic check for credentials
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: 'LINKEDIN_CLIENT_ID or LINKEDIN_CLIENT_SECRET is not configured.' },
      { status: 500 }
    );
  }

  // Generate random state to prevent CSRF
  const state = crypto.randomBytes(16).toString('hex');

  // Set the state in an HTTP-only secure cookie
  const cookieStore = await cookies();
  cookieStore.set('linkedin_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 300, // 5 minutes
  });

  const redirectUri = 'http://localhost:3000/api/auth/linkedin/callback';
  const scope = encodeURIComponent('openid profile w_member_social');

  const authorizeUrl = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&scope=${scope}`;

  return NextResponse.redirect(authorizeUrl);
}
