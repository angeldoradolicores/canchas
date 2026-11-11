/**
 * image-upload-validator.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Validador de seguridad para subida de imágenes y videos.
 *
 * Protecciones incluidas:
 *  1. Verificación de magic bytes (firma binaria real del archivo)
 *  2. MIME-type whitelist estricta (no se confía en lo que declara el cliente)
 *  3. Extensión segura derivada de los bytes, NO del nombre original
 *  4. Límite de tamaño configurable
 *  5. Protección contra path traversal en nombres de archivo
 *  6. Rechazo explícito de SVG (puede contener scripts XSS)
 *
 * USO:
 *   const result = validateImageUpload(buffer, { maxBytes: 5 * 1024 * 1024, allowVideo: false });
 *   if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
 *   // Usar result.contentType y result.ext (derivados de bytes reales)
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type AllowedImageType = 'jpeg' | 'png' | 'webp' | 'gif';
export type AllowedVideoType = 'mp4' | 'webm' | 'mov';
export type AllowedMediaType = AllowedImageType | AllowedVideoType;

export interface ImageValidationResult {
  ok: true;
  contentType: string;
  ext: AllowedMediaType;
  isVideo: boolean;
}

export interface ImageValidationError {
  ok: false;
  error: string;
}

export type ImageValidationOutcome = ImageValidationResult | ImageValidationError;

export interface ValidateOptions {
  /** Tamaño máximo en bytes. Por defecto 5 MB. */
  maxBytes?: number;
  /** Permitir videos además de imágenes. Por defecto false. */
  allowVideo?: boolean;
  /** Si es true, rechaza GIF (útil para avatares / comprobantes). Por defecto false. */
  rejectGif?: boolean;
}

// ─── Firmas mágicas (magic bytes) ───────────────────────────────────────────

type MagicEntry = {
  contentType: string;
  ext: AllowedMediaType;
  isVideo: boolean;
  /**
   * Checks es un array de predicados. Se acepta el archivo si AL MENOS UNO pasa.
   * Cada predicado recibe el buffer completo y devuelve true si coincide.
   */
  checks: Array<(buf: Buffer) => boolean>;
};

const MAGIC_SIGNATURES: MagicEntry[] = [
  // JPEG: FF D8 FF
  {
    contentType: 'image/jpeg',
    ext: 'jpeg',
    isVideo: false,
    checks: [(b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  },
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  {
    contentType: 'image/png',
    ext: 'png',
    isVideo: false,
    checks: [
      (b) =>
        b[0] === 0x89 &&
        b[1] === 0x50 &&
        b[2] === 0x4e &&
        b[3] === 0x47 &&
        b[4] === 0x0d &&
        b[5] === 0x0a &&
        b[6] === 0x1a &&
        b[7] === 0x0a,
    ],
  },
  // WebP: RIFF ????  WEBP
  {
    contentType: 'image/webp',
    ext: 'webp',
    isVideo: false,
    checks: [
      (b) =>
        b[0] === 0x52 && // R
        b[1] === 0x49 && // I
        b[2] === 0x46 && // F
        b[3] === 0x46 && // F
        b[8] === 0x57 && // W
        b[9] === 0x45 && // E
        b[10] === 0x42 && // B
        b[11] === 0x50,  // P
    ],
  },
  // GIF: 47 49 46 38 (GIF8)
  {
    contentType: 'image/gif',
    ext: 'gif',
    isVideo: false,
    checks: [
      (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38,
    ],
  },
  // MP4: ftyp a varias posiciones (offset 4–7 = 'ftyp')
  {
    contentType: 'video/mp4',
    ext: 'mp4',
    isVideo: true,
    checks: [
      (b) =>
        b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70,
    ],
  },
  // WebM: 1A 45 DF A3
  {
    contentType: 'video/webm',
    ext: 'webm',
    isVideo: true,
    checks: [
      (b) => b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3,
    ],
  },
  // QuickTime MOV: 'ftyp' en offset 4 con marca qt  o  'moov' sin ftyp
  {
    contentType: 'video/quicktime',
    ext: 'mov',
    isVideo: true,
    checks: [
      // Muchos MOV también tienen ftyp en offset 4
      (b) =>
        b[4] === 0x66 &&
        b[5] === 0x74 &&
        b[6] === 0x79 &&
        b[7] === 0x70 &&
        b[8] === 0x71 && // qt
        b[9] === 0x74,
      // MOV sin ftyp: comienzan con 'moov' o 'wide'
      (b) =>
        (b[4] === 0x6d && b[5] === 0x6f && b[6] === 0x6f && b[7] === 0x76) ||
        (b[4] === 0x77 && b[5] === 0x69 && b[6] === 0x64 && b[7] === 0x65),
    ],
  },
];

// ─── Función principal ───────────────────────────────────────────────────────

/**
 * Valida un buffer de archivo para subidas de imágenes (o videos si se configura).
 *
 * @param buffer    - Buffer completo del archivo leído del servidor
 * @param options   - Opciones de validación
 * @returns         ImageValidationOutcome — { ok: true, contentType, ext, isVideo } o { ok: false, error }
 */
export function validateImageUpload(
  buffer: Buffer,
  options: ValidateOptions = {}
): ImageValidationOutcome {
  const {
    maxBytes = 5 * 1024 * 1024, // 5 MB por defecto
    allowVideo = false,
    rejectGif = false,
  } = options;

  // 1. Verificar que el buffer no esté vacío
  if (!buffer || buffer.length === 0) {
    return { ok: false, error: 'El archivo está vacío.' };
  }

  // 2. Límite de tamaño
  if (buffer.length > maxBytes) {
    const mb = Math.round(maxBytes / (1024 * 1024));
    return { ok: false, error: `El archivo supera el límite de ${mb} MB.` };
  }

  // 3. Verificar magic bytes reales (el cliente no puede falsificar esto)
  for (const entry of MAGIC_SIGNATURES) {
    // Saltar videos si no están permitidos
    if (entry.isVideo && !allowVideo) continue;
    // Saltar GIF si se rechaza
    if (entry.ext === 'gif' && rejectGif) continue;

    const matched = entry.checks.some((check) => {
      try {
        return check(buffer);
      } catch {
        return false;
      }
    });

    if (matched) {
      return {
        ok: true,
        contentType: entry.contentType,
        ext: entry.ext,
        isVideo: entry.isVideo,
      };
    }
  }

  // 4. No coincidió ninguna firma → rechazar
  const allowed = allowVideo
    ? 'JPG, PNG, WebP, GIF, MP4, WebM o MOV'
    : rejectGif
    ? 'JPG, PNG o WebP'
    : 'JPG, PNG, WebP o GIF';

  return {
    ok: false,
    error: `Tipo de archivo no permitido. Solo se aceptan imágenes ${allowed}. Asegúrate de subir un archivo de imagen real (no un archivo renombrado).`,
  };
}

// ─── Utilidades para nombre de archivo seguro ────────────────────────────────

/**
 * Genera un nombre de archivo seguro sin caracteres peligrosos.
 * Elimina path traversal, null bytes, y caracteres especiales.
 *
 * @param userId   - ID del usuario (para prefijo de ruta)
 * @param ext      - Extensión validada (derivada de magic bytes, no del cliente)
 * @returns        Ruta segura: "userId/timestamp_random.ext"
 */
export function safeUploadPath(userId: string, ext: string): string {
  // Limpiar el userId: solo alfanuméricos y guiones
  const safeUserId = userId.replace(/[^a-zA-Z0-9\-_]/g, '').substring(0, 36) || 'unknown';
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  return `${safeUserId}/${timestamp}_${random}.${ext}`;
}

