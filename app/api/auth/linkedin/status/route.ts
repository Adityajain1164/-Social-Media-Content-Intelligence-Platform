import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const account = await prisma.linkedInAccount.findUnique({
      where: { userId: user.id },
    });

    if (!account) {
      return NextResponse.json({
        connected: false,
        expired: false,
        linkedinUrn: null,
      });
    }

    const isExpired = account.expiresAt.getTime() <= Date.now();

    return NextResponse.json({
      connected: true,
      expired: isExpired,
      linkedinUrn: account.linkedinUrn,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to fetch LinkedIn status' },
      { status: 500 }
    );
  }
}
