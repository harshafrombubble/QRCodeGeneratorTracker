import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl as getS3SignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Database } from '@/types/supabase';
import JSZip from 'jszip';

// Configure S3
const s3Client = new S3Client({
  region: process.env.AWS_DEFAULT_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const S3_BUCKET = process.env.AWS_BUCKET_NAME || 'qr-campaign-pdfs';
const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://127.0.0.1:8000';

async function uploadToS3(buffer: Buffer, filename: string, contentType = 'application/pdf') {
  const key = `pdfs/${Date.now()}-${filename}`;
  
  await s3Client.send(new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType
  }));
  
  return {
    url: `https://${S3_BUCKET}.s3.${process.env.AWS_DEFAULT_REGION}.amazonaws.com/${key}`,
    key: key
  };
}

async function getSignedUrl(key: string) {
  const command = new GetObjectCommand({
    Bucket: S3_BUCKET,
    Key: key
  });
  
  // URL expires in 5 minutes
  return await getS3SignedUrl(s3Client, command, { expiresIn: 300 });
}

export async function POST(request: Request) {
  try {
    console.log('Starting file processing...');
    // Get form data
    const formData = await request.formData();
    console.log('Form data received:', {
      hasFile: !!formData.get('file'),
      baseUrl: formData.get('baseUrl'),
      campaignName: formData.get('campaignName'),
      flyerCount: formData.get('flyerCount'),
      targetUrl: formData.get('targetUrl')
    });

    const file = formData.get('file') as File;
    const baseUrl = formData.get('baseUrl') as string;
    const rawCampaignName = formData.get('campaignName') as string;
    const targetUrl = formData.get('targetUrl') as string;
    const flyerCount = parseInt(formData.get('flyerCount') as string);

    if (!file || !baseUrl || !rawCampaignName || !targetUrl || !flyerCount) {
      console.error('Missing fields:', { file: !!file, baseUrl, campaignName: rawCampaignName, targetUrl, flyerCount });
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
    const supabase = createRouteHandlerClient<Database>({ 
      cookies: () => cookieStore 
    });

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
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    
    // Upload original file to S3
    console.log('Uploading original file to S3...');
    const original = await uploadToS3(fileBuffer, file.name, file.type);
    console.log('Original file uploaded:', original.url);
    
    // Create campaign
    console.log('Creating campaign...');
    const { data: campaign, error: campaignError } = await supabase
      .from('Campaigns')
      .insert({
        user: user.id,
        name: campaignName,
        url: targetUrl,
        pdf_url: original.url,
        flyers: flyerCount
      })
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
    
    // Create a zip file
    const zip = new JSZip();
    const flyers = [];
    
    for (let i = startId; i < startId + flyerCount; i++) {
      // Generate URL using campaign name and flyer id
      const url = `${baseUrl}/r/${campaignName}/${i}`;

      // Create flyer record
      const { data: flyer, error: createError } = await supabase
        .from('Flyers')
        .insert({
          id: i,
          campaign: campaign.id,
          campaign_name: campaignName,
          url: url,
          redirect_url: targetUrl,
          pdf_url: null
        })
        .select()
        .single();

      if (createError) throw createError;

      // Call Python API to process the file
      const pythonFormData = new FormData();
      
      // Convert File to Blob to ensure it's properly sent
      const fileBlob = new Blob([await file.arrayBuffer()], { type: file.type });
      pythonFormData.append('file', fileBlob, file.name);
      pythonFormData.append('target_url', url);

      console.log('Calling Python API:', `${PYTHON_API_URL}/process-file`, {
        fileName: file.name,
        fileType: file.type,
        targetUrl: url,
        formData: {
          file: `[Blob ${fileBlob.size} bytes]`,
          target_url: url
        }
      });

      try {
        const pythonResponse = await fetch(`${PYTHON_API_URL}/process-file`, {
          method: 'POST',
          body: pythonFormData
        });

        if (!pythonResponse.ok) {
          const errorText = await pythonResponse.text();
          let parsedError;
          try {
            parsedError = JSON.parse(errorText);
          } catch {
            parsedError = errorText;
          }
          
          console.error('Python API error response:', {
            status: pythonResponse.status,
            statusText: pythonResponse.statusText,
            error: parsedError,
            requestData: {
              url: `${PYTHON_API_URL}/process-file`,
              file: file.name,
              target_url: url
            }
          });
          throw new Error(`Failed to process file: ${errorText}`);
        }

        console.log('Python API processed file successfully');
        const processedFileBuffer = Buffer.from(await pythonResponse.arrayBuffer());
        
        // Add file to zip
        const extension = file.name.substring(file.name.lastIndexOf('.'));
        const fileName = `flyer-${campaignName}-${i}${extension}`;
        zip.file(fileName, processedFileBuffer);
        
        // Upload processed file to S3
        const uploaded = await uploadToS3(processedFileBuffer, fileName, file.type);
        
        // Update flyer with URL and file URL
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
        const signedUrl = await getSignedUrl(uploaded.key);
        if (updatedFlyer) {
          flyers.push({
            ...updatedFlyer,
            signed_url: signedUrl
          });
        }
      } catch (error) {
        console.error(`Error processing flyer ${i}:`, error);
        throw error;
      }
    }

    // Generate zip file
    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
    
    // Upload zip file to S3
    const zipFileName = `campaign-${campaignName}-all-files.zip`;
    const uploadedZip = await uploadToS3(zipBuffer, zipFileName, 'application/zip');
    const zipSignedUrl = await getSignedUrl(uploadedZip.key);

    // Return flyers with signed URLs and zip file URL
    return NextResponse.json({
      campaign,
      flyers,
      zipUrl: zipSignedUrl
    });
    
  } catch (error: any) {
    console.error('Fatal error in file processing:', error);
    console.error('Error stack:', error.stack);
    return NextResponse.json({ 
      error: error.message,
      stack: error.stack,
      name: error.name 
    }, { status: 500 });
  }
} 