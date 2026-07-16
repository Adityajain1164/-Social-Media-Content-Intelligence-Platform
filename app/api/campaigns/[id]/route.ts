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

interface Params {
  params: Promise<{
    id: string;
  }>;
}

export async function PATCH(request: Request, { params }: Params) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    // 1. Verify ownership
    const campaign = await prisma.campaign.findUnique({
      where: { id },
    });

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    if (campaign.userId !== user.id) {
      return NextResponse.json({ error: 'Forbidden. You do not own this campaign.' }, { status: 403 });
    }

    const body = await request.json();
    const { topic, frequency, tonePersona, status, nextRunAt } = body;

    const updateData: any = {};

    if (topic !== undefined) updateData.topic = topic;
    if (tonePersona !== undefined) updateData.tonePersona = tonePersona;
    
    if (status !== undefined) {
      if (!['active', 'paused'].includes(status)) {
        return NextResponse.json({ error: 'Status must be active or paused.' }, { status: 400 });
      }
      updateData.status = status;
    }

    if (frequency !== undefined) {
      if (!['daily', '3x_week', 'weekly'].includes(frequency)) {
        return NextResponse.json({ error: 'Invalid frequency.' }, { status: 400 });
      }
      updateData.frequency = frequency;
      // Recompute nextRunAt if frequency changes
      if (frequency !== campaign.frequency) {
        updateData.nextRunAt = getNextRunAt(frequency);
      }
    }

    // Allow manual nextRunAt overrides if provided (useful for scheduling testing)
    if (nextRunAt !== undefined) {
      updateData.nextRunAt = new Date(nextRunAt);
    }

    const updatedCampaign = await prisma.campaign.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(updatedCampaign);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to update campaign' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    // 1. Verify ownership
    const campaign = await prisma.campaign.findUnique({
      where: { id },
    });

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    if (campaign.userId !== user.id) {
      return NextResponse.json({ error: 'Forbidden. You do not own this campaign.' }, { status: 403 });
    }

    // 2. Perform cascade delete (runs and posted articles deleted via Prisma onDelete: Cascade rules)
    await prisma.campaign.delete({
      where: { id },
    });

    return NextResponse.json({ message: 'Campaign deleted successfully' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to delete campaign' }, { status: 500 });
  }
}
