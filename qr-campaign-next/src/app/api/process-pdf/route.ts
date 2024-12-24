import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PDFDocument, rgb } from 'pdf-lib';
import QRCode from 'qrcode';
import type { Database } from '@/types/supabase';

// Configure S3
const s3Client = new S3Client({
  region: process.env.AWS_DEFAULT_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const S3_BUCKET = process.env.AWS_BUCKET_NAME || 'qr-campaign-pdfs';

async function uploadToS3(buffer: Buffer, filename: string) {
  const key = `pdfs/${Date.now()}-${filename}`;
  
  await s3Client.send(new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: 'application/pdf'
  }));
  
  return {
    url: `https://${S3_BUCKET}.s3.${process.env.AWS_DEFAULT_REGION}.amazonaws.com/${key}`,
    key: key
  };
}

async function generateFlyerPDF(pdfBuffer: Buffer, targetUrl: string, qrBounds: { x: number, y: number, width: number, height: number }) {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  
  // Generate QR code as data URL
  const qrDataUrl = await QRCode.toDataURL(targetUrl, {
    margin: 0,
    width: 1000, // High resolution for better quality
    color: {
      dark: '#000000',  // Black QR code
      light: '#FFFFFF'  // White background
    }
  });
  
  // Convert data URL to image bytes
  const qrImageBytes = Buffer.from(qrDataUrl.split(',')[1], 'base64');
  
  // Embed the QR code image
  const qrImage = await pdfDoc.embedPng(qrImageBytes);
  
  // Process each page
  for (let i = 0; i < pdfDoc.getPageCount(); i++) {
    const page = pdfDoc.getPages()[i];
    
    // Draw white rectangle to cover existing QR code
    page.drawRectangle({
      x: qrBounds.x,
      y: qrBounds.y,
      width: qrBounds.width,
      height: qrBounds.height,
      color: rgb(1, 1, 1), // White
    });
    
    // Draw new QR code in same location
    page.drawImage(qrImage, {
      x: qrBounds.x,
      y: qrBounds.y,
      width: qrBounds.width,
      height: qrBounds.height,
    });
  }
  
  return await pdfDoc.save();
}

async function getSignedPdfUrl(key: string) {
  const command = new GetObjectCommand({
    Bucket: S3_BUCKET,
    Key: key
  });
  
  // URL expires in 5 minutes
  return await getSignedUrl(s3Client, command, { expiresIn: 300 });
}

async function mergePDFs(pdfBuffers: Buffer[]) {
  const mergedPdf = await PDFDocument.create();
  
  for (const buffer of pdfBuffers) {
    const pdf = await PDFDocument.load(buffer);
    const pageIndices = Array.from({ length: pdf.getPageCount() }, (_, i) => i);
    const copiedPages = await mergedPdf.copyPages(pdf, pageIndices);
    copiedPages.forEach((page) => {
      mergedPdf.addPage(page);
    });
  }
  
  return await mergedPdf.save();
}

export async function POST(request: Request) {
  try {
    console.log('Starting PDF processing...');
    // Get form data
    const formData = await request.formData();
    console.log('Form data received:', {
      hasFile: !!formData.get('file'),
      baseUrl: formData.get('baseUrl'),
      campaignName: formData.get('campaignName'),
      flyerCount: formData.get('flyerCount'),
      hasQrBounds: !!formData.get('qrBounds')
    });

    const file = formData.get('file') as File;
    const baseUrl = formData.get('baseUrl') as string;
    const rawCampaignName = formData.get('campaignName') as string;
    const targetUrl = formData.get('targetUrl') as string;
    const flyerCount = parseInt(formData.get('flyerCount') as string);
    const qrBounds = JSON.parse(formData.get('qrBounds') as string);

    if (!file || !baseUrl || !rawCampaignName || !targetUrl || !flyerCount || !qrBounds) {
      console.error('Missing fields:', { file: !!file, baseUrl, campaignName: rawCampaignName, targetUrl, flyerCount, qrBounds });
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Validate and format campaign name
    if (rawCampaignName !== rawCampaignName.toLowerCase()) {
      return NextResponse.json({ 
        error: 'Campaign name must be lowercase' 
      }, { status: 400 });
    }

    const campaignName = rawCampaignName.toLowerCase().trim();

    // Validate campaign name format
    if (!/^[a-z0-9-]+$/.test(campaignName)) {
      return NextResponse.json({ 
        error: 'Campaign name must contain only lowercase letters, numbers, and hyphens' 
      }, { status: 400 });
    }

    // Initialize Supabase client with cookies
    console.log('Initializing Supabase client...');
    const cookieStore = cookies();
    const supabase = createRouteHandlerClient<Database>({ cookies: () => cookieStore });

    // Get user from session
    console.log('Getting user session...');
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError) {
      console.error('User authentication error:', userError);
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    if (!user) {
      console.error('No user found in session');
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    console.log('User authenticated:', user.id);

    // Convert file to buffer
    console.log('Converting file to buffer...');
    const pdfBuffer = Buffer.from(await file.arrayBuffer());
    
    // Upload original PDF to S3
    console.log('Uploading original PDF to S3...');
    const original = await uploadToS3(pdfBuffer, 'original.pdf');
    console.log('Original PDF uploaded:', original.url);
    
    // Create campaign
    console.log('Creating campaign...');
    const { data: campaign, error: campaignError } = await supabase
      .from('Campaigns')
      .insert([{
        user: user.id,
        name: campaignName,
        url: targetUrl,
        pdf_url: original.url,
        flyers: flyerCount
      }])
      .select()
      .single();

    if (campaignError) {
      console.error('Campaign creation error:', campaignError);
      console.error('Campaign data:', { user: user.id, name: campaignName, pdf_url: original.url, flyers: flyerCount });
      return NextResponse.json({ error: `Campaign creation failed: ${campaignError.message}` }, { status: 500 });
    }
    console.log('Campaign created:', campaign.id);
    
    // Find highest existing flyer ID for this campaign
    const { data: existingFlyers, error: queryError } = await supabase
      .from('Flyers')
      .select('id')
      .eq('campaign_name', campaignName)
      .order('id', { ascending: false })
      .limit(1);

    if (queryError) {
      console.error('Error querying existing flyers:', queryError);
      return NextResponse.json({ error: 'Failed to query existing flyers' }, { status: 500 });
    }

    const startId = existingFlyers && existingFlyers.length > 0 ? existingFlyers[0].id + 1 : 1;
    
    // Generate flyers
    const flyers = [];
    const flyerPdfBuffers = [];
    
    for (let i = startId; i < startId + flyerCount; i++) {
      // Generate URL using campaign name and flyer id
      const url = `${baseUrl}/r/${campaignName}/${i}`;

      // Create flyer record
      const { data: flyer, error: createError } = await supabase
        .from('Flyers')
        .insert([{
          id: i,
          campaign: campaign.id,
          campaign_name: campaignName,
          url: url,
          redirect_url: targetUrl,
          pdf_url: null
        }])
        .select()
        .single();

      if (createError) throw createError;

      // Generate and upload flyer PDF
      const flyerPdfBytes = await generateFlyerPDF(pdfBuffer, url, qrBounds);
      const flyerPdfBuffer = Buffer.from(flyerPdfBytes);
      flyerPdfBuffers.push(flyerPdfBuffer);
      
      const uploaded = await uploadToS3(flyerPdfBuffer, `flyer-${campaignName}-${i}.pdf`);
      
      // Update flyer with URL and PDF URL
      const { data: updatedFlyer, error: updateError } = await supabase
        .from('Flyers')
        .update({ 
          url: url,
          pdf_url: uploaded.url,
          s3_key: uploaded.key
        })
        .eq('id', i)
        .eq('campaign_name', campaignName)
        .select()
        .single();
        
      if (updateError) throw updateError;

      // Generate signed URL for immediate download
      const signedUrl = await getSignedPdfUrl(uploaded.key);
      flyers.push({
        ...updatedFlyer,
        signed_url: signedUrl
      });
    }

    // Merge all PDFs into one
    const mergedPdfBytes = await mergePDFs(flyerPdfBuffers);
    const mergedPdfBuffer = Buffer.from(mergedPdfBytes);
    
    // Upload merged PDF
    const uploaded = await uploadToS3(mergedPdfBuffer, `campaign-${campaignName}-all-flyers.pdf`);
    const mergedSignedUrl = await getSignedPdfUrl(uploaded.key);

    // Return both individual flyers and merged PDF
    return NextResponse.json({
      campaign,
      flyers,
      mergedPdfUrl: mergedSignedUrl
    });
    
  } catch (error: any) {
    console.error('Fatal error in PDF processing:', error);
    console.error('Error stack:', error.stack);
    return NextResponse.json({ 
      error: error.message,
      stack: error.stack,
      name: error.name 
    }, { status: 500 });
  }
} 