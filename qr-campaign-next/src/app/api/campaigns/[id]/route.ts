import { createServerSupabaseClient } from '@/utils/supabase-server';
import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import type { Database } from '@/types/supabase';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createServerSupabaseClient();
    const campaignId = id;

    // Get campaign with flyers
    const { data: campaign, error: campaignError } = await supabase
      .from('Campaigns')
      .select(`
        *,
        Flyers (
          id,
          created_at,
          posted_at,
          scans,
          lat,
          long,
          url,
          pdf_url,
          s3_key,
          redirect_url,
          flyerId,
          campaign_name,
          campaign
        )
      `)
      .eq('id', campaignId)
      .single();

    if (campaignError) {
      console.error('Error fetching campaign:', campaignError);
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    // Get all scans for the campaign
    const { data: scans, error: scansError } = await supabase
      .from('Scans')
      .select('*')
      .eq('campaign', campaignId)
      .order('scan_time', { ascending: false });

    if (scansError) {
      console.error('Error fetching scans:', scansError);
      return NextResponse.json({ error: 'Failed to fetch scan data' }, { status: 500 });
    }

    return NextResponse.json({ 
      ...campaign,
      scan_data: scans 
    });
    
  } catch (error: any) {
    console.error('Error in campaign route:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
} 

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    // Initialize Supabase client
    const cookieStore = cookies();
    const supabase = createRouteHandlerClient<Database>({ 
      cookies: () => cookieStore 
    });

    // Get authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Verify campaign belongs to user
    const { data: campaign, error: campaignError } = await supabase
      .from('Campaigns')
      .select('user')
      .eq('id', id)
      .single();

    if (campaignError || !campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    if (campaign.user !== user.id) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    // Delete all flyers for this campaign
    const { error: flyersError } = await supabase
      .from('Flyers')
      .delete()
      .eq('campaign', id);

    if (flyersError) {
      throw flyersError;
    }

    // Delete the campaign
    const { error: deleteError } = await supabase
      .from('Campaigns')
      .delete()
      .eq('id', id);

    if (deleteError) {
      throw deleteError;
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error deleting campaign:', error);
    return NextResponse.json(
      { error: 'Failed to delete campaign' }, 
      { status: 500 }
    );
  }
} 