import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import type { Database } from '@/types/supabase';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: { campaign: string } }
) {
  const { campaign } = params;

  // Set up SSE headers
  const headers = new Headers({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  // Initialize Supabase client
  const cookieStore = cookies();
  const supabase = createRouteHandlerClient<Database>({ 
    cookies: () => cookieStore 
  });

  // Start polling for updates
  const interval = setInterval(async () => {
    try {
      const { data: flyers, error } = await supabase
        .from('Flyers')
        .select('id')
        .eq('campaign_name', campaign)
        .not('pdf_url', 'is', null);

      if (error) throw error;

      const processed = flyers?.length || 0;
      
      // Send progress update
      const data = JSON.stringify({ processed });
      writer.write(new TextEncoder().encode(`data: ${data}\n\n`));

    } catch (error) {
      console.error('Error fetching progress:', error);
      clearInterval(interval);
      writer.close();
    }
  }, 1000); // Poll every second

  // Clean up when client disconnects
  request.signal.addEventListener('abort', () => {
    clearInterval(interval);
    writer.close();
  });

  return new Response(stream.readable, { headers });
} 