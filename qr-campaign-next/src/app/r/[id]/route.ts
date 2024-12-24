import { createServerSupabaseClient } from '@/utils/supabase-server';
import { NextResponse } from 'next/server';
import CryptoJS from 'crypto-js';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY!;

function decryptIds(encrypted: string) {
  try {
    const sanitized = encrypted
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    const decrypted = CryptoJS.AES.decrypt(sanitized, ENCRYPTION_KEY).toString(CryptoJS.enc.Utf8);
    return JSON.parse(decrypted);
  } catch (error) {
    console.error('Error decrypting:', error);
    return null;
  }
}

export async function GET(
  request: Request,
  { params }: { params: { id: Promise<string> } }
) {
  try {
    const supabase = createServerSupabaseClient();
    
    // Decrypt the ID to get campaign and flyer IDs
    const encryptedId = await params.id;
    const ids = decryptIds(encryptedId);
    if (!ids) {
      return NextResponse.json({ error: 'Invalid ID format' }, { status: 400 });
    }

    // Get campaign URL and check if flyer exists
    const { data: campaign, error: campaignError } = await supabase
      .from('Campaigns')
      .select('url')
      .eq('id', ids.c)
      .single();

    if (campaignError || !campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    // Get the flyer to check if it's the first scan and if location is already set
    const { data: flyer, error: flyerError } = await supabase
      .from('Flyers')
      .select('scans, lat, long')
      .eq('id', ids.f)
      .single();

    if (flyerError) {
      console.error('Error getting flyer:', flyerError);
      return NextResponse.json({ error: 'Flyer not found' }, { status: 404 });
    }

    // Create scan record
    const { error: scanError } = await supabase
      .from('Scans')
      .insert([{
        flyer: ids.f,
        campaign: ids.c
      }]);

    if (scanError) {
      console.error('Error creating scan record:', scanError);
    }

    // If it's the first scan (scans = 0) and location isn't set, show the location prompt
    if (flyer.scans === 0 && (!flyer.lat || !flyer.long)) {
      const locationPromptUrl = new URL('/location-prompt', request.url);
      locationPromptUrl.searchParams.set('flyerId', ids.f);
      locationPromptUrl.searchParams.set('campaignId', ids.c);
      locationPromptUrl.searchParams.set('redirectUrl', campaign.url);
      return NextResponse.redirect(locationPromptUrl);
    }

    // Update scan counts using RPC function
    const { error: countError } = await supabase.rpc('increment_scans', {
      campaign_id: ids.c,
      flyer_id: ids.f
    });

    if (countError) {
      console.error('Error updating scan counts:', countError);
    }

    // Redirect to campaign URL
    return NextResponse.redirect(campaign.url);
    
  } catch (error: any) {
    console.error('Redirect error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 