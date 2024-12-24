import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { flyerId, newUrl } = await request.json();

    if (!flyerId || !newUrl) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Get the flyer first to get its campaign_name
    const { data: flyer, error: flyerError } = await supabase
      .from('Flyers')
      .select('campaign_name')
      .eq('flyerId', flyerId)
      .single();

    if (flyerError) {
      console.error('Error getting flyer:', flyerError);
      return NextResponse.json({ error: 'Failed to find flyer' }, { status: 404 });
    }

    // Update the flyer's redirect URL
    const { error: updateError } = await supabase
      .from('Flyers')
      .update({ redirect_url: newUrl })
      .eq('flyerId', flyerId);

    if (updateError) {
      console.error('Error updating redirect URL:', updateError);
      return NextResponse.json({ error: 'Failed to update redirect URL' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error in update-redirect-url:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
} 