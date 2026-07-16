import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { decrypt } from '@/lib/encryption';

// Helper to compute next run time
function getNextRunAt(frequency: string): Date {
  const now = new Date();
  switch (frequency) {
    case 'daily':
      return new Date(now.getTime() + 24 * 60 * 60 * 1000);
    case '3x_week':
      return new Date(now.getTime() + 56 * 60 * 60 * 1000);
    case 'weekly':
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    default:
      return new Date(now.getTime() + 24 * 60 * 60 * 1000);
  }
}

export async function POST(request: Request) {
  try {
    // 1. Secure endpoint using CRON_SECRET
    const authHeader = request.headers.get('Authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const now = new Date();

    // 2. Fetch active campaigns due for a run
    // Guard: exclude campaigns that already have a run in 'queued' or 'running' status
    const dueCampaigns = await prisma.campaign.findMany({
      where: {
        status: 'active',
        nextRunAt: { lte: now },
        runs: {
          none: {
            status: { in: ['queued', 'running'] },
          },
        },
      },
      include: {
        runs: {
          take: 1,
          orderBy: { startedAt: 'desc' },
        },
      },
    });

    const results = [];

    // Resolve base application URL for callback
    const host = request.headers.get('host') || 'localhost:3000';
    const proto = request.headers.get('x-forwarded-proto') || 'http';
    const appUrl = process.env.APP_URL || `${proto}://${host}`;

    for (const campaign of dueCampaigns) {
      // Find the user's connected LinkedIn account
      const account = await prisma.linkedInAccount.findUnique({
        where: { userId: campaign.userId },
      });

      // Compute the next run time to advance the schedule
      const nextScheduledRun = getNextRunAt(campaign.frequency);

      // Check if LinkedIn connection exists and is not expired
      if (!account || account.expiresAt.getTime() <= Date.now()) {
        const errorMsg = !account
          ? 'LinkedIn account not connected'
          : 'LinkedIn token expired — reconnect required';

        // Log failed run
        await prisma.campaignRun.create({
          data: {
            campaignId: campaign.id,
            status: 'failed',
            startedAt: new Date(),
            finishedAt: new Date(),
            error: errorMsg,
          },
        });

        // Advance nextRunAt to avoid retrying on every cron tick
        await prisma.campaign.update({
          where: { id: campaign.id },
          data: { nextRunAt: nextScheduledRun },
        });

        results.push({ campaignId: campaign.id, status: 'skipped', reason: errorMsg });
        continue;
      }

      // Decrypt token
      let decryptedToken: string;
      try {
        decryptedToken = decrypt(account.accessToken);
      } catch (err: any) {
        const errorMsg = 'Failed to decrypt access token';
        await prisma.campaignRun.create({
          data: {
            campaignId: campaign.id,
            status: 'failed',
            startedAt: new Date(),
            finishedAt: new Date(),
            error: `${errorMsg}: ${err.message}`,
          },
        });

        await prisma.campaign.update({
          where: { id: campaign.id },
          data: { nextRunAt: nextScheduledRun },
        });

        results.push({ campaignId: campaign.id, status: 'skipped', reason: errorMsg });
        continue;
      }

      // Query previously posted articles from the last 30 days
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const postedArticles = await prisma.postedArticle.findMany({
        where: {
          campaignId: campaign.id,
          postDate: { gte: thirtyDaysAgo },
        },
        select: {
          hashId: true,
          articleTitle: true,
          postDate: true,
        },
      });
      const previouslyPostedArticles = postedArticles.map((art) => ({
        hash_id: art.hashId,
        title: art.articleTitle,
        post_date: art.postDate.toISOString(),
      }));

      // Create a new CampaignRun row in 'queued' status
      const run = await prisma.campaignRun.create({
        data: {
          campaignId: campaign.id,
          status: 'queued',
          startedAt: new Date(),
        },
      });

      // Prepare n8n trigger webhook payload
      const payload = {
        campaign_id: campaign.id,
        user_id: campaign.userId,
        topic: campaign.topic,
        tone_persona: campaign.tonePersona || null,
        linkedin_urn: account.linkedinUrn,
        linkedin_access_token: decryptedToken,
        previously_posted_articles: previouslyPostedArticles,
        callback_url: `${appUrl}/api/internal/n8n-callback`,
        callback_secret: process.env.N8N_CALLBACK_SECRET,
      };

      try {
        const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL;
        const n8nWebhookSecret = process.env.N8N_WEBHOOK_SECRET;

        if (!n8nWebhookUrl) {
          throw new Error('N8N_WEBHOOK_URL is not configured.');
        }

        // Trigger n8n
        const response = await fetch(n8nWebhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${n8nWebhookSecret || ''}`,
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`n8n webhook returned non-2xx status: ${response.status}. Response: ${errorText}`);
        }

        // Success: Update run to 'running' and advance campaign schedule immediately
        await prisma.$transaction([
          prisma.campaignRun.update({
            where: { id: run.id },
            data: { status: 'running' },
          }),
          prisma.campaign.update({
            where: { id: campaign.id },
            data: { nextRunAt: nextScheduledRun },
          }),
        ]);

        results.push({ campaignId: campaign.id, status: 'triggered', runId: run.id });
      } catch (err: any) {
        const errorMsg = err.message || 'Network error triggering n8n';

        // Failure: Update run status to failed and advance campaign schedule to prevent loops
        await prisma.$transaction([
          prisma.campaignRun.update({
            where: { id: run.id },
            data: {
              status: 'failed',
              finishedAt: new Date(),
              error: `Failed to trigger n8n: ${errorMsg}`,
            },
          }),
          prisma.campaign.update({
            where: { id: campaign.id },
            data: { nextRunAt: nextScheduledRun },
          }),
        ]);

        results.push({ campaignId: campaign.id, status: 'failed', reason: errorMsg });
      }
    }

    return NextResponse.json({
      message: 'Campaign processing cron execution completed.',
      processedCount: dueCampaigns.length,
      results,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'An error occurred during campaign scheduling.' },
      { status: 500 }
    );
  }
}

// GET is also supported to allow trigger via simple webhooks / browsers if CRON_SECRET matches
export async function GET(request: Request) {
  return POST(request);
}
