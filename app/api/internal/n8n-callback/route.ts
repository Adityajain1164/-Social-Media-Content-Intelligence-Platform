import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

export async function POST(request: Request) {
  try {
    // 1. Secure the endpoint using N8N_CALLBACK_SECRET
    const authHeader = request.headers.get('Authorization');
    const callbackSecret = process.env.N8N_CALLBACK_SECRET;

    if (!callbackSecret || authHeader !== `Bearer ${callbackSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await request.json();
    const { campaign_id, status, finished_at } = payload;

    if (!campaign_id || !status) {
      return NextResponse.json(
        { error: 'Missing required payload fields: campaign_id or status' },
        { status: 400 }
      );
    }

    // Verify campaign exists
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaign_id },
    });

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    // Find the most recent CampaignRun for this campaign that is not already completed
    const latestRun = await prisma.campaignRun.findFirst({
      where: {
        campaignId: campaign_id,
        status: { in: ['queued', 'running'] },
      },
      orderBy: { startedAt: 'desc' },
    });

    const runId = latestRun?.id;
    const finishedAtDate = finished_at ? new Date(finished_at) : new Date();

    if (status === 'success') {
      const { pdf_url, linkedin_post_url, selected_articles } = payload;

      // Update database inside a transaction
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        // 1. Update CampaignRun
        if (runId) {
          await tx.campaignRun.update({
            where: { id: runId },
            data: {
              status: 'success',
              finishedAt: finishedAtDate,
              pdfUrl: pdf_url || null,
              linkedinPostUrl: linkedin_post_url || null,
            },
          });
        } else {
          // If no running run was found, create a new completed one
          await tx.campaignRun.create({
            data: {
              campaignId: campaign_id,
              status: 'success',
              startedAt: finishedAtDate,
              finishedAt: finishedAtDate,
              pdfUrl: pdf_url || null,
              linkedinPostUrl: linkedin_post_url || null,
            },
          });
        }

        // 2. Insert deduplication entries into PostedArticle
        if (selected_articles && Array.isArray(selected_articles)) {
          await tx.postedArticle.createMany({
            data: selected_articles.map((art: any) => ({
              campaignId: campaign_id,
              hashId: art.hash_id || '',
              articleTitle: art.title || '',
              postDate: finishedAtDate,
            })),
          });
        }
      });

      return NextResponse.json({ message: 'Success callback processed.' }, { status: 200 });
    } else if (status === 'failed') {
      const { error } = payload;

      // Update database
      if (runId) {
        await prisma.campaignRun.update({
          where: { id: runId },
          data: {
            status: 'failed',
            finishedAt: finishedAtDate,
            error: error || 'Unknown error during campaign execution',
          },
        });
      } else {
        await prisma.campaignRun.create({
          data: {
            campaignId: campaign_id,
            status: 'failed',
            startedAt: finishedAtDate,
            finishedAt: finishedAtDate,
            error: error || 'Unknown error during campaign execution',
          },
        });
      }

      return NextResponse.json({ message: 'Failure callback processed.' }, { status: 200 });
    } else {
      return NextResponse.json({ error: `Invalid status: ${status}` }, { status: 400 });
    }
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'An error occurred during callback processing.' },
      { status: 500 }
    );
  }
}
