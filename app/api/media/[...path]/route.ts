import { NextRequest, NextResponse } from 'next/server';
import { getR2Client } from '@/lib/storage/r2';
import { GetObjectCommand } from '@aws-sdk/client-s3';

export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params;
    const key = (path || []).join('/');
    if (!key) {
      return new NextResponse('Not found', { status: 404 });
    }

    const client = getR2Client();
    const bucket = process.env.R2_BUCKET_NAME || '';

    if (!client || !bucket) {
      return new NextResponse('Storage service not configured', { status: 503 });
    }

    const response = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );

    if (!response.Body) {
      return new NextResponse('File body not found', { status: 404 });
    }

    const contentType = response.ContentType || 'application/octet-stream';
    const stream = response.Body as any;

    return new NextResponse(stream, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        ...(response.ContentLength ? { 'Content-Length': String(response.ContentLength) } : {}),
      },
    });
  } catch (error: any) {
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
      return new NextResponse('File not found', { status: 404 });
    }
    console.error('[Media Stream Error]', error);
    return new NextResponse('Error loading media', { status: 500 });
  }
}
