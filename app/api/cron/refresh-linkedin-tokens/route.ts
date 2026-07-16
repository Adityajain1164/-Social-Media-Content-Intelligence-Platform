import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { decrypt, encrypt } from '@/lib/encryption';

export async function GET(request: Request) {
  // 1. Secure the endpoint using CRON_SECRET
  const authHeader = request.headers.get('Authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: 'LINKEDIN_CLIENT_ID or LINKEDIN_CLIENT_SECRET is not configured.' },
      { status: 500 }
    );
  }

  // Find accounts expiring in the next 24 hours (or already expired)
  const targetDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const expiringAccounts = await prisma.linkedInAccount.findMany({
    where: {
      expiresAt: {
        lte: targetDate,
      },
    },
  });

  let refreshedCount = 0;
  let failedCount = 0;
  const errors: Array<{ userId: string; error: string }> = [];

  for (const account of expiringAccounts) {
    if (!account.refreshToken) {
      errors.push({ userId: account.userId, error: 'No refresh token available.' });
      failedCount++;
      continue;
    }

    try {
      // Decrypt stored refresh token
      const decryptedRefreshToken = decrypt(account.refreshToken);

      // Call LinkedIn API to refresh access token
      const refreshResponse = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: decryptedRefreshToken,
          client_id: clientId,
          client_secret: clientSecret,
        }),
      });

      if (!refreshResponse.ok) {
        const errorText = await refreshResponse.text();
        errors.push({ userId: account.userId, error: `LinkedIn response error: ${errorText}` });
        failedCount++;
        continue;
      }

      const refreshData = await refreshResponse.json();
      const newAccessToken = refreshData.access_token;
      const newRefreshToken = refreshData.refresh_token || null; // Might be rotated
      const expiresIn = refreshData.expires_in;

      if (!newAccessToken) {
        errors.push({ userId: account.userId, error: 'Access token not returned by LinkedIn.' });
        failedCount++;
        continue;
      }

      // Encrypt and update
      const encryptedAccessToken = encrypt(newAccessToken);
      const encryptedRefreshToken = newRefreshToken ? encrypt(newRefreshToken) : account.refreshToken;
      const newExpiresAt = new Date(Date.now() + expiresIn * 1000);

      await prisma.linkedInAccount.update({
        where: { id: account.id },
        data: {
          accessToken: encryptedAccessToken,
          refreshToken: encryptedRefreshToken,
          expiresAt: newExpiresAt,
        },
      });

      refreshedCount++;
    } catch (err: any) {
      errors.push({ userId: account.userId, error: err.message || 'Unknown error' });
      failedCount++;
    }
  }

  return NextResponse.json({
    message: 'Cron job execution completed.',
    refreshed: refreshedCount,
    failed: failedCount,
    details: errors,
  });
}
