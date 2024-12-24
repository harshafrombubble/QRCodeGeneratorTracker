import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/utils/supabase-server';

export async function POST(request: Request) {
  try {
    const { flyerId, campaignName, lat, long } = await request.json();

    if (!flyerId || !campaignName || lat === undefined || long === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    console.log('Updating location for flyer:', { flyerId, campaignName, lat, long });

    // Get flyer details first to get campaign ID
    const { data: flyer, error: flyerError } = await supabase
      .from('Flyers')
      .select('campaign, scans, redirect_url')
      .eq('id', flyerId)
      .eq('campaign_name', campaignName)
      .single();

    if (flyerError) {
      console.error('Error getting flyer:', flyerError);
      return NextResponse.json({ error: 'Flyer not found' }, { status: 404 });
    }

    // Get total scan count for campaign
    const { count: totalScans, error: countError } = await supabase
      .from('Scans')
      .select('*', { count: 'exact', head: true })
      .eq('campaign', flyer.campaign);

    if (countError) {
      console.error('Error getting scan count:', countError);
      return NextResponse.json({ error: 'Failed to get scan count' }, { status: 500 });
    }

    // Update flyer with location and scan count
    const { error: updateError } = await supabase
      .from('Flyers')
      .update({
        lat: lat,
        long: long,
        scans: (flyer.scans || 0) + 1,
        posted_at: new Date().toISOString()
      })
      .eq('id', flyerId)
      .eq('campaign_name', campaignName);

    if (updateError) {
      console.error('Error updating location:', updateError);
      return NextResponse.json({ error: 'Failed to update location' }, { status: 500 });
    }

    console.log('Successfully updated location, creating scan record');

    // Create scan record
    const { error: scanError } = await supabase
      .from('Scans')
      .insert([{
        flyer: flyerId,
        campaign: flyer.campaign,
        redirect_url: flyer.redirect_url
      }]);

    if (scanError) {
      console.error('Error creating scan record:', scanError);
      return NextResponse.json({ error: 'Failed to create scan record' }, { status: 500 });
    }

    console.log('Successfully created scan record, updating campaign scan count');

    // Update campaign with accurate total scan count
    const { error: campaignUpdateError } = await supabase
      .from('Campaigns')
      .update({ scans: (totalScans || 0) + 1 })
      .eq('id', flyer.campaign);

    if (campaignUpdateError) {
      console.error('Error updating campaign scan count:', campaignUpdateError);
      return NextResponse.json({ error: 'Failed to update campaign scan count' }, { status: 500 });
    }

    console.log('Successfully updated scan counts');
    return NextResponse.json({ success: true });
    
  } catch (error: any) {
    console.error('Error in update-location:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
} 