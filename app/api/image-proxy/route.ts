import { NextRequest, NextResponse } from 'next/server';
import { BlockList, isIP } from 'node:net';
import { lookup as dnsLookup } from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { validateImageUpload } from '@/lib/image-upload-validator';
import { checkRateLimit, createRateLimitErrorResponse } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_REDIRECTS = 3;

// ── Lista blanca de orígenes de imágenes permitidos ──────────────────────────
// Solo se proxean imágenes de dominios que la app usa de verdad. Cualquier otro
// host (IPs internas, nombres de servicios Docker, metadatos cloud) es rechazado.
const ALLOWED_HOST_SUFFIXES = (
  process.env.IMAGE_PROXY_ALLOWED_HOSTS ||
  'supabase.co,r2.dev,r2.cloudflarestorage.com,images.unsplash.com,googleusercontent.com,ggpht.com,maps.googleapis.com,maps.gstatic.com'
)
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

// ── Rangos de IP bloqueados (loopback, privados, link-local, metadatos, etc.) ─
const blocked = new BlockList();
const V4: [string, number][] = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4],
];
const V6: [string, number][] = [
  ['::', 128], ['::1', 128], ['::ffff:0:0', 96], ['64:ff9b::', 96],
  ['100::', 64], ['2001:db8::', 32], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8],
];
for (const [net, prefix] of V4) blocked.addSubnet(net, prefix, 'ipv4');
for (const [net, prefix] of V6) blocked.addSubnet(net, prefix, 'ipv6');

function isBlockedIp(ip: string): boolean {
  const fam = isIP(ip);
  if (fam === 4) return blocked.check(ip, 'ipv4');
  if (fam === 6) {
    const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
    if (mapped) return blocked.check(mapped[1], 'ipv4');
    return blocked.check(ip, 'ipv6');
  }
  return true; // no es una IP válida → bloquear
}

function isAllowedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '');
  if (isIP(h)) return false; // nunca IPs literales
  if (!h.includes('.')) return false; // nunca nombres de una sola etiqueta (Docker/LAN)
  return ALLOWED_HOST_SUFFIXES.some((s) => h === s || h.endsWith('.' + s));
}

// Resolver DNS que valida TODAS las IPs y fija la usada para conectar (anti DNS-rebinding)
const safeLookup: typeof dnsLookup = ((hostname: string, options: any, cb: any) => {
  const callback = typeof options === 'function' ? options : cb;
  dnsLookup(hostname, { all: true, verbatim: true }, (err, addrs) => {
    if (err) return callback(err);
    const list = addrs as { address: string; family: number }[];
    if (!list.length || list.some((a) => isBlockedIp(a.address))) {
      return callback(Object.assign(new Error('Destino bloqueado'), { code: 'EBLOCKED' }));
    }
    if (options && typeof options === 'object' && options.all) return callback(null, list);
    callback(null, list[0].address, list[0].family);
  });
}) as any;

function fetchOnce(
  target: URL,
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body?: Buffer }> {
  return new Promise((resolve, reject) => {
    const mod = target.protocol === 'https:' ? https : http;
    const req = mod.request(
      target,
      {
        method: 'GET',
        lookup: safeLookup,
        timeout: 6000,
        headers: { 'User-Agent': 'CanchasImageProxy/1.0', Accept: 'image/*' },
      },
      (res) => {
        const status = res.statusCode || 0;
        if (status >= 300 && status < 400) {
          res.resume();
          return resolve({ status, headers: res.headers });
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (c: Buffer) => {
          size += c.length;
          if (size > MAX_BYTES) {
            req.destroy(new Error('Demasiado grande'));
            return;
          }
          chunks.push(c);
        });
        res.on('end', () => resolve({ status, headers: res.headers, body: Buffer.concat(chunks) }));
        res.on('error', reject);
      },
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end();
  });
}

export async function GET(req: NextRequest) {
  const rl = checkRateLimit(req, { limit: 30, windowSeconds: 60, keyPrefix: 'api:image-proxy' });
  if (!rl.success) return createRateLimitErrorResponse(rl);

  const raw = req.nextUrl.searchParams.get('url');
  if (!raw || raw.length > 2048) {
    return NextResponse.json({ error: 'URL inválida' }, { status: 400 });
  }

  try {
    let target: URL;
    try {
      target = new URL(raw);
    } catch {
      return NextResponse.json({ error: 'URL inválida' }, { status: 400 });
    }

    for (let i = 0; i <= MAX_REDIRECTS; i++) {
      // Solo HTTPS, sin credenciales embebidas, puerto estándar y host permitido
      if (target.protocol !== 'https:') {
        return NextResponse.json({ error: 'Solo se permiten URLs https' }, { status: 400 });
      }
      if (target.username || target.password) {
        return NextResponse.json({ error: 'URL inválida' }, { status: 400 });
      }
      if (target.port && target.port !== '443') {
        return NextResponse.json({ error: 'Puerto no permitido' }, { status: 400 });
      }
      if (!isAllowedHost(target.hostname)) {
        return NextResponse.json({ error: 'Host no permitido' }, { status: 403 });
      }

      let res;
      try {
        res = await fetchOnce(target);
      } catch {
        // Incluye EBLOCKED (IP interna), timeout, DNS, etc. Respuesta genérica.
        return NextResponse.json({ error: 'No se pudo obtener la imagen' }, { status: 502 });
      }

      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.location;
        if (!loc) break;
        try {
          target = new URL(loc, target); // se revalida al inicio de la siguiente vuelta
        } catch {
          return NextResponse.json({ error: 'Redirección inválida' }, { status: 400 });
        }
        continue;
      }

      // No reflejamos el status remoto (evita usar el proxy como escáner de puertos)
      if (res.status !== 200 || !res.body) {
        return NextResponse.json({ error: 'No se pudo obtener la imagen' }, { status: 502 });
      }

      // Validación real por magic bytes: no confiamos en el Content-Type remoto
      const validation = validateImageUpload(res.body, {
        allowVideo: false,
        maxBytes: MAX_BYTES,
        rejectGif: false,
      });
      if (!validation.ok) {
        return NextResponse.json(
          { error: 'El recurso remoto no es una imagen válida.' },
          { status: 400 },
        );
      }

      return new NextResponse(new Uint8Array(res.body), {
        status: 200,
        headers: {
          'Content-Type': validation.contentType,
          'Cache-Control': 'public, max-age=86400, stale-while-revalidate=43200',
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'none'; img-src 'self'; sandbox",
        },
      });
    }

    return NextResponse.json({ error: 'Demasiadas redirecciones' }, { status: 400 });
  } catch (err: any) {
    console.error('[image-proxy error]', err?.message || err);
    return NextResponse.json({ error: 'No se pudo obtener la imagen' }, { status: 502 });
  }
}
