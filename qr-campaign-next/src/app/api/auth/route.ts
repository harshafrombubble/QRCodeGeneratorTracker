import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { Database } from '@/types/supabase';

export async function POST(request: Request) {
  const cookieStore = cookies();
  const supabase = createRouteHandlerClient<Database>({ cookies: () => cookieStore });
  
  const { event, session } = await request.json();
  
  if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
    // Set cookie on sign in/out
    await supabase.auth.setSession(session);
  }

  return NextResponse.json({}, { status: 200 });
} 