import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const accountId = process.env.R2_ACCOUNT_ID || 'b42477dc02e02fdc91da8d79aa376868';
const accessKeyId = process.env.R2_ACCESS_KEY_ID || '';
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || '';
const bucketName = process.env.R2_BUCKET_NAME || '';
const publicDomain = (process.env.R2_PUBLIC_DOMAIN || '').replace(/\/$/, '');

let s3ClientInstance: S3Client | null = null;

export function isR2Configured(): boolean {
  return Boolean(accessKeyId && secretAccessKey && bucketName);
}

export function getR2Client(): S3Client | null {
  if (!isR2Configured()) {
    return null;
  }

  if (!s3ClientInstance) {
    s3ClientInstance = new S3Client({
      region: 'auto',
      endpoint: process.env.R2_ENDPOINT || `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  return s3ClientInstance;
}

export interface UploadOptions {
  buffer: Buffer;
  key: string;
  contentType: string;
  isPrivate?: boolean;
}

/**
 * Sube un archivo a Cloudflare R2
 * - Archivos públicos (canchas, escuelas, torneos): retorna URL del CDN público de Cloudflare.
 * - Archivos privados (comprobantes de pago): no se exponen públicamente, se retorna presigned URL temporal (15 mins) o ruta segura.
 */
export async function uploadToR2({ buffer, key, contentType, isPrivate = false }: UploadOptions): Promise<{ url: string; key: string }> {
  const client = getR2Client();
  if (!client) {
    throw new Error('Cloudflare R2 no está configurado (faltan R2_ACCESS_KEY_ID o R2_SECRET_ACCESS_KEY).');
  }

  const cleanKey = key.replace(/^\/+/, '');

  await client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: cleanKey,
      Body: buffer,
      ContentType: contentType,
      // Metadatos de seguridad y caché
      CacheControl: isPrivate ? 'private, no-store' : 'public, max-age=31536000, immutable',
    })
  );

  if (isPrivate) {
    // Para comprobantes privados: generar URL firmada segura con expiración de 7 días (604800 segundos)
    // Esto garantiza máxima privacidad sin enlaces públicos eternos, y tiempo suficiente para que el dueño y bot de WhatsApp lo verifiquen
    const presignedUrl = await getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: bucketName,
        Key: cleanKey,
      }),
      { expiresIn: 604800 }
    );
    return { url: presignedUrl, key: cleanKey };
  }

  // Para archivos públicos (canchas, escuelas, torneos)
  const url = publicDomain ? `${publicDomain}/${cleanKey}` : `/api/media/${cleanKey}`;
  return { url, key: cleanKey };
}

/**
 * Genera una URL firmada temporal para acceder a archivos privados (ej: comprobantes de pago)
 */
export async function getPresignedR2Url(key: string, expiresInSeconds = 900): Promise<string> {
  const client = getR2Client();
  if (!client) {
    throw new Error('Cloudflare R2 no configurado.');
  }

  const cleanKey = key.replace(/^\/+/, '');
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucketName,
      Key: cleanKey,
    }),
    { expiresIn: expiresInSeconds }
  );
}

/**
 * Elimina un objeto de Cloudflare R2
 */
export async function deleteFromR2(key: string): Promise<boolean> {
  const client = getR2Client();
  if (!client) return false;

  try {
    const cleanKey = key.replace(/^\/+/, '');
    await client.send(
      new DeleteObjectCommand({
        Bucket: bucketName,
        Key: cleanKey,
      })
    );
    return true;
  } catch (err) {
    console.warn('[R2 Delete error]', err);
    return false;
  }
}
