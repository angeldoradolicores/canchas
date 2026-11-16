import sharp from 'sharp';
export async function sanitizeReceipt(buffer: Buffer): Promise<Buffer> {
 if (!buffer.length || buffer.length > 5 * 1024 * 1024) throw new Error('Imagen demasiado grande o vacía');
 const image = sharp(buffer, {limitInputPixels: 20000000, failOn: 'warning'});
 const meta = await image.metadata();
 if (!['jpeg','png','webp'].includes(meta.format || '') || (meta.pages || 1) !== 1)
   throw new Error('Solo JPG, PNG o WebP estáticos');
 // 1400x2400 conserva legible el texto de capturas de pantalla y pesa ~3-4 veces menos que antes.
 const clean = await image.rotate().resize({width:1400,height:2400,fit:'inside',withoutEnlargement:true}).jpeg({quality:80,mozjpeg:true}).toBuffer();
 if (clean.length > 5 * 1024 * 1024) throw new Error('Imagen demasiado grande');
 return clean;
}

/**
 * Imagen pública de promoción: solo JPG/PNG/WebP estáticos, re-codificada a WebP.
 * Re-codificar elimina metadatos (EXIF/GPS) y cualquier contenido no visual.
 */
export async function sanitizePromotionImage(buffer: Buffer): Promise<Buffer> {
 if (!buffer.length || buffer.length > 5 * 1024 * 1024) throw new Error('Imagen demasiado grande o vacía');
 const image = sharp(buffer, {limitInputPixels: 20000000, failOn: 'warning'});
 const meta = await image.metadata();
 if (!['jpeg','png','webp'].includes(meta.format || '') || (meta.pages || 1) !== 1)
   throw new Error('Solo JPG, PNG o WebP estáticos');
 const clean = await image.rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).webp({quality:82}).toBuffer();
 if (clean.length > 3 * 1024 * 1024) throw new Error('Imagen demasiado grande');
 return clean;
}

/**
 * Fotos públicas (canchas, escuelas, torneos, avatares): las fotos de celular llegan
 * de 3-10 MB y hacían lenta la carga de la app. Se re-codifican a WebP de máximo
 * 1600 px (≈150-400 KB), se corrige la orientación y se eliminan metadatos (GPS).
 * Devuelve null si el formato no aplica (GIF, video) para conservar el original.
 */
export async function optimizePublicImage(buffer: Buffer, maxSide = 1600): Promise<Buffer | null> {
 try {
   const image = sharp(buffer, {limitInputPixels: 120000000, failOn: 'error'});
   const meta = await image.metadata();
   if (!['jpeg','png','webp'].includes(meta.format || '') || (meta.pages || 1) !== 1) return null;
   return await image.rotate().resize({width:maxSide,height:maxSide,fit:'inside',withoutEnlargement:true}).webp({quality:80}).toBuffer();
 } catch {
   return null;
 }
}
