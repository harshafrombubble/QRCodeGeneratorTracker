import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PDFDocument, rgb } from 'pdf-lib';
import QRCode from 'qrcode';
import CryptoJS from 'crypto-js';
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
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY!;

function encryptIds(campaignId: string, flyerId: string) {
  const data = JSON.stringify({ c: campaignId, f: flyerId });
  return CryptoJS.AES.encrypt(data, ENCRYPTION_KEY).toString()
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

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

async function generateFlyerPDF(pdfBuffer: Buffer, flyerId: string, targetUrl: string, qrBounds: { x: number, y: number, width: number, height: number }) {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  
  // Generate QR code with transparent background
  const qrBuffer = await QRCode.toBuffer(targetUrl, {
    width: 200,
    margin: 0,
    color: {
      dark: '#000000',  // Black QR code
      light: '#FFFFFF'  // White background
    }
  });
  
  const qrImage = await pdfDoc.embedPng(qrBuffer);
  
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
    // Get form data
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const baseUrl = formData.get('baseUrl') as string;
    const targetUrl = formData.get('targetUrl') as string;
    const campaignName = formData.get('campaignName') as string;
    const flyerCount = parseInt(formData.get('flyerCount') as string);
    const qrBounds = JSON.parse(formData.get('qrBounds') as string);

    if (!file || !baseUrl || !targetUrl || !campaignName || !flyerCount || !qrBounds) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Initialize Supabase client with cookies
    const cookieStore = cookies();
    const supabase = createRouteHandlerClient<Database>({ cookies: () => cookieStore });

    // Get user from session
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Convert file to buffer
    const pdfBuffer = Buffer.from(await file.arrayBuffer());
    
    // Upload original PDF to S3
    const original = await uploadToS3(pdfBuffer, 'original.pdf');
    
    // Create campaign
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
      throw campaignError;
    }
    
    // Generate flyers
    const flyers = [];
    const flyerPdfBuffers = [];
    
    for (let i = 0; i < flyerCount; i++) {
      // Create flyer record
      const { data: flyer, error: createError } = await supabase
        .from('Flyers')
        .insert([{
          campaign: campaign.id,
          pdf_url: null
        }])
        .select()
        .single();

      if (createError) throw createError;

      // Generate encrypted URL and update flyer
      const encryptedId = encryptIds(campaign.id, flyer.id);
      const url = `${baseUrl}/r/${encryptedId}`;

      // Generate and upload flyer PDF
      const flyerPdfBytes = await generateFlyerPDF(pdfBuffer, flyer.id, url, qrBounds);
      const flyerPdfBuffer = Buffer.from(flyerPdfBytes);
      flyerPdfBuffers.push(flyerPdfBuffer);
      
      const uploaded = await uploadToS3(flyerPdfBuffer, `flyer-${flyer.id}.pdf`);
      
      // Update flyer with URL and PDF URL
      const { data: updatedFlyer, error: updateError } = await supabase
        .from('Flyers')
        .update({ 
          url: url,
          pdf_url: uploaded.url,
          s3_key: uploaded.key
        })
        .eq('id', flyer.id)
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
    const uploaded = await uploadToS3(mergedPdfBuffer, `campaign-${campaign.id}-all-flyers.pdf`);
    const mergedSignedUrl = await getSignedPdfUrl(uploaded.key);

    // Return both individual flyers and merged PDF
    return NextResponse.json({
      campaign,
      flyers,
      mergedPdfUrl: mergedSignedUrl,
      pdfBlob: mergedPdfBytes
    });
    
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
} 