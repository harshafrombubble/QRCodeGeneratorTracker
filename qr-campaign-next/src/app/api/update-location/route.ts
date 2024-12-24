import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/utils/supabase-server';

export async function POST(request: Request) {
  try {
    const { flyerId, campaignId, lat, long } = await request.json();

    if (!flyerId || !campaignId || lat === undefined || long === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    console.log('Updating location for flyer:', { flyerId, campaignId, lat, long });

    // Update flyer with location
    const { error: updateError } = await supabase
      .from('Flyers')
      .update({
        lat: lat,
        long: long
      })
      .eq('id', flyerId);

    if (updateError) {
      console.error('Error updating location:', updateError);
      return NextResponse.json({ error: 'Failed to update location' }, { status: 500 });
    }

    console.log('Successfully updated location, creating scan record');

    // Create scan record with location
    const { error: scanError } = await supabase
      .from('Scans')
      .insert([{
        flyer: flyerId,
        campaign: campaignId,
        lat: lat,
        long: long
      }]);

    if (scanError) {
      console.error('Error creating scan record:', scanError);
      return NextResponse.json({ error: 'Failed to create scan record' }, { status: 500 });
    }

    console.log('Successfully created scan record, updating scan count');

    // Update scan count
    const { error: countError } = await supabase.rpc('increment_scans', {
      campaign_id: campaignId,
      flyer_id: flyerId
    });

    if (countError) {
      console.error('Error updating scan count:', countError);
      return NextResponse.json({ error: 'Failed to update scan count' }, { status: 500 });
    }

    console.log('Successfully updated scan count');
    return NextResponse.json({ success: true });
    
  } catch (error: any) {
    console.error('Error in update-location:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
} 