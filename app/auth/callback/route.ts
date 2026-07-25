import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const forwardTo = new URL(next, origin);
      return NextResponse.redirect(forwardTo);
    }
  }

  // If code exchange fails, redirect to login with error parameter
  return NextResponse.redirect(new URL('/login?error=auth-code-exchange-failed', origin));
}
