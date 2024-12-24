import { NextResponse } from 'next/server';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createServerSupabaseClient } from '@/utils/supabase-server';

// Configure S3
const s3Client = new S3Client({
  region: process.env.AWS_DEFAULT_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const S3_BUCKET = process.env.AWS_BUCKET_NAME || 'qr-campaign-pdfs';

export async function POST(request: Request) {
  try {
    const { s3Key } = await request.json();
    
    if (!s3Key) {
      return NextResponse.json({ error: 'Missing s3Key' }, { status: 400 });
    }

    const command = new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: s3Key
    });
    
    // URL expires in 5 minutes
    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });

    return NextResponse.json({ signedUrl });
  } catch (error: any) {
    console.error('Error generating signed URL:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
} 