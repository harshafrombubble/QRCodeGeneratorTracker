import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import type { Database } from '@/types/supabase';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { url } = await request.json();
    const { id } = params;

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient<Database>({ cookies: () => cookieStore });

    // Get user from session
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Update campaign URL
    const { error: campaignError } = await supabase
      .from('Campaigns')
      .update({ url: url })
      .eq('id', id)
      .eq('user', user.id);

    if (campaignError) {
      console.error('Error updating campaign URL:', campaignError);
      return NextResponse.json({ error: 'Failed to update campaign URL' }, { status: 500 });
    }

    // Update all flyers for this campaign
    const { error: flyersError } = await supabase
      .from('Flyers')
      .update({ redirect_url: url })
      .eq('campaign', id);

    if (flyersError) {
      console.error('Error updating flyers redirect URL:', flyersError);
      return NextResponse.json({ error: 'Failed to update flyers redirect URL' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
    
  } catch (error: any) {
    console.error('Error in update-url:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
} 