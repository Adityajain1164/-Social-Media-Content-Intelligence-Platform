import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';

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

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const campaigns = await prisma.campaign.findMany({
      where: { userId: user.id },
      include: {
        runs: {
          orderBy: { startedAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(campaigns);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to fetch campaigns' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { topic, frequency, tonePersona, timezone } = body;

    if (!topic || !frequency) {
      return NextResponse.json({ error: 'Missing topic or frequency' }, { status: 400 });
    }

    if (!['daily', '3x_week', 'weekly'].includes(frequency)) {
      return NextResponse.json({ error: 'Invalid frequency. Expected daily, 3x_week, or weekly.' }, { status: 400 });
    }

    const computedNextRunAt = getNextRunAt(frequency);
    const resolvedTimezone = timezone || 'UTC';

    const campaign = await prisma.campaign.create({
      data: {
        userId: user.id,
        topic,
        frequency,
        tonePersona: tonePersona || null,
        timezone: resolvedTimezone,
        nextRunAt: computedNextRunAt,
        status: 'active',
      },
    });

    return NextResponse.json(campaign, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to create campaign' }, { status: 500 });
  }
}
