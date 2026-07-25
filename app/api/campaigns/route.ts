import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { getNextRunAt } from '@/lib/scheduler';

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

    const computedNextRunAt = new Date(); // first run fires on next scheduler tick, regardless of frequency
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
