import { createServerSupabaseClient } from '@/utils/supabase-server';
import { NextResponse } from 'next/server';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createServerSupabaseClient();
    const campaignId = params.id;

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
          s3_key
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