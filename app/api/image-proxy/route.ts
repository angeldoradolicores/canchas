import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  if (!url) {
    return NextResponse.json({ error: 'URL requerida' }, { status: 400 });
  }

  try {
    const parsed = new URL(url);
    // Permitir solo protocolos http y https
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return NextResponse.json({ error: 'Protocolo inválido' }, { status: 400 });
    }

    // ── BLINDAJE ANTI-SSRF (Bloquear acceso a metadatos de AWS y red interna) ──
    const hostname = parsed.hostname.toLowerCase();
    const isPrivate =
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === '169.254.169.254' || // AWS EC2 Metadata
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname) ||
      hostname.endsWith('.internal') ||
      hostname.endsWith('.local');

    if (isPrivate) {
      return NextResponse.json({ error: 'Acceso denegado a recursos internos' }, { status: 403 });
    }

    const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!response.ok) {
      return NextResponse.json({ error: 'No se pudo obtener la imagen' }, { status: response.status });
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) {
      return NextResponse.json({ error: 'El recurso solicitado no es una imagen' }, { status: 400 });
    }

    const buffer = await response.arrayBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=43200',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err: any) {
    console.error('[image-proxy error]', err);
    return NextResponse.json({ error: 'Error procesando la imagen' }, { status: 500 });
  }
}
