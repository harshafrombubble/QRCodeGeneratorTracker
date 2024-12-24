import { createServerSupabaseClient } from '@/utils/supabase-server';
import { NextResponse } from 'next/server';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ campaign_name: string; id: string }> }
) {
  try {
    const supabase = createServerSupabaseClient();
    const { campaign_name, id } = await params;
    
    // Convert id to number since it's stored as smallint in the database
    const flyerId = parseInt(id);
    if (isNaN(flyerId)) {
      return NextResponse.json({ error: 'Invalid flyer ID format' }, { status: 400 });
    }

    // Get the flyer to check if it exists and if it's the first scan
    const { data: flyer, error: flyerError } = await supabase
      .from('Flyers')
      .select('scans, lat, long, campaign, redirect_url')
      .eq('id', flyerId)
      .eq('campaign_name', campaign_name)
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
    }

    // If it's the first scan and location isn't set, show the location prompt
    if (flyer.scans === 0 && (!flyer.lat || !flyer.long)) {
      const locationPromptUrl = new URL('/location-prompt', request.url);
      locationPromptUrl.searchParams.set('flyerId', flyerId.toString());
      locationPromptUrl.searchParams.set('campaignName', campaign_name);
      locationPromptUrl.searchParams.set('redirectUrl', flyer.redirect_url);
      return NextResponse.redirect(locationPromptUrl);
    }

    // Update flyer scan count
    const { error: updateError } = await supabase
      .from('Flyers')
      .update({ scans: (flyer.scans || 0) + 1 })
      .eq('id', flyerId)
      .eq('campaign_name', campaign_name);

    if (updateError) {
      console.error('Error updating flyer scan count:', updateError);
    }

    // Update campaign with accurate total scan count
    const { error: campaignUpdateError } = await supabase
      .from('Campaigns')
      .update({ scans: (totalScans || 0) + 1 })
      .eq('id', flyer.campaign);

    if (campaignUpdateError) {
      console.error('Error updating campaign scan count:', campaignUpdateError);
    }

    // Redirect to flyer's redirect URL
    return NextResponse.redirect(flyer.redirect_url);
    
  } catch (error: any) {
    console.error('Redirect error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 