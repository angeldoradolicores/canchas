#!/usr/bin/env node
/**
 * Comprime las fotos YA subidas (canchas, escuelas, torneos, avatares) que hacen lenta
 * la carga de cancheros.site, y las sirve desde el dominio con caché (R2_PUBLIC_DOMAIN)
 * en vez de pub-*.r2.dev (que Cloudflare limita y no cachea).
 *
 *   Ver qué haría (no cambia nada):  node --env-file=.env.local scripts/optimize-existing-images.mjs
 *   Aplicar los cambios:             node --env-file=.env.local scripts/optimize-existing-images.mjs --apply
 *
 * Seguro y reversible: NO borra los archivos originales. Sube una copia "<nombre>_opt.webp"
 * y actualiza la URL en la base de datos. Los videos, GIF y enlaces externos no se tocan.
 */
import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const APPLY = process.argv.includes('--apply');
const MIN_BYTES = 250 * 1024; // por debajo de esto solo se cambia el dominio
const env = (k) => (process.env[k] || '').trim();

const supabase = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const bucket = env('R2_BUCKET_NAME');
const publicDomain = env('R2_PUBLIC_DOMAIN').replace(/\/$/, '');
const s3 = new S3Client({
  region: 'auto',
  endpoint: env('R2_ENDPOINT') || `https://${env('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: env('R2_ACCESS_KEY_ID'), secretAccessKey: env('R2_SECRET_ACCESS_KEY') },
});
if (!bucket || !publicDomain || !env('SUPABASE_SERVICE_ROLE_KEY') || !env('R2_ACCESS_KEY_ID')) {
  console.error('Faltan variables: SUPABASE_SERVICE_ROLE_KEY, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME o R2_PUBLIC_DOMAIN');
  process.exit(1);
}

// Tablas y columnas con fotos públicas.
const TARGETS = [
  { table: 'pitches', columns: ['image_url', 'media_urls'] },
  { table: 'schools', columns: ['logo_url', 'images'] },
  { table: 'tournaments', columns: ['media_urls'] },
  { table: 'profiles', columns: ['avatar_url'], maxSide: 512 },
];
const PUBLIC_PREFIXES = ['pitchs/', 'pitch-images/', 'schools/', 'school-images/', 'tournaments/', 'avatars/'];
const VIDEO = /\.(mp4|mov|webm|m4v|avi|mkv)(\?|$)/i;

/** Clave del objeto en NUESTRO bucket público, o null si la URL no es nuestra. */
function keyOf(url) {
  if (typeof url !== 'string' || !url) return null;
  try {
    if (url.startsWith('/api/media/')) return decodeURIComponent(url.slice('/api/media/'.length));
    const u = new URL(url);
    const ours = /^pub-[a-z0-9]+\.r2\.dev$/i.test(u.hostname) || url.startsWith(publicDomain + '/');
    if (!ours) return null;
    return decodeURIComponent(u.pathname.replace(/^\/+/, ''));
  } catch { return null; }
}

const done = new Map(); // url original -> url nueva (misma foto usada en varias filas)
const stats = { revisadas: 0, comprimidas: 0, soloDominio: 0, omitidas: 0, errores: 0, antes: 0, despues: 0 };

async function convert(url, maxSide) {
  if (done.has(url)) return done.get(url);
  const key = keyOf(url);
  if (!key || VIDEO.test(key) || key.includes('..') || !PUBLIC_PREFIXES.some((p) => key.startsWith(p))) {
    stats.omitidas++; done.set(url, url); return url;
  }
  stats.revisadas++;
  const cdnUrl = `${publicDomain}/${key.split('/').map(encodeURIComponent).join('/')}`;
  try {
    const res = await fetch(cdnUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const original = Buffer.from(await res.arrayBuffer());
    let next = cdnUrl;
    if (original.length >= MIN_BYTES && !/_opt\.webp$/.test(key)) {
      const img = sharp(original, { limitInputPixels: 120000000, failOn: 'error' });
      const meta = await img.metadata();
      if (['jpeg', 'png', 'webp'].includes(meta.format) && (meta.pages || 1) === 1) {
        const out = await img.rotate().resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 80 }).toBuffer();
        if (out.length < original.length * 0.8) {
          const newKey = key.replace(/\.[a-z0-9]+$/i, '') + '_opt.webp';
          if (APPLY) {
            await s3.send(new PutObjectCommand({
              Bucket: bucket, Key: newKey, Body: out, ContentType: 'image/webp',
              CacheControl: 'public, max-age=31536000, immutable',
            }));
          }
          next = `${publicDomain}/${newKey.split('/').map(encodeURIComponent).join('/')}`;
          stats.comprimidas++; stats.antes += original.length; stats.despues += out.length;
          console.log(`  ${(original.length / 1024).toFixed(0)} KB -> ${(out.length / 1024).toFixed(0)} KB  ${key}`);
        }
      }
    }
    if (next === cdnUrl && next !== url) stats.soloDominio++;
    done.set(url, next);
    return next;
  } catch (e) {
    stats.errores++;
    console.warn(`  ! No se pudo procesar ${key}: ${e.message}`);
    done.set(url, url);
    return url;
  }
}

for (const { table, columns, maxSide = 1600 } of TARGETS) {
  console.log(`\n== ${table}`);
  const { data: rows, error } = await supabase.from(table).select(['id', ...columns].join(','));
  if (error) { console.warn(`  (se omite: ${error.message})`); continue; }
  for (const row of rows) {
    const patch = {};
    for (const col of columns) {
      const value = row[col];
      if (Array.isArray(value)) {
        const mapped = [];
        for (const u of value) mapped.push(await convert(u, maxSide));
        if (mapped.some((u, i) => u !== value[i])) patch[col] = mapped;
      } else if (typeof value === 'string' && value) {
        const mapped = await convert(value, maxSide);
        if (mapped !== value) patch[col] = mapped;
      }
    }
    if (Object.keys(patch).length && APPLY) {
      const { error: upErr } = await supabase.from(table).update(patch).eq('id', row.id);
      if (upErr) { stats.errores++; console.warn(`  ! ${table} ${row.id}: ${upErr.message}`); }
    }
  }
}

console.log('\nResumen', APPLY ? '(APLICADO)' : '(simulación: agrega --apply para guardar)');
console.log(`  Fotos revisadas: ${stats.revisadas}`);
console.log(`  Comprimidas: ${stats.comprimidas}  (${(stats.antes / 1048576).toFixed(1)} MB -> ${(stats.despues / 1048576).toFixed(1)} MB)`);
console.log(`  Solo cambio a dominio con caché: ${stats.soloDominio}`);
console.log(`  Omitidas (videos/externas): ${stats.omitidas}  Errores: ${stats.errores}`);
