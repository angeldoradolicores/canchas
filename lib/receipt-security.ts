import sharp from 'sharp';
export async function sanitizeReceipt(buffer: Buffer): Promise<Buffer> {
 if (!buffer.length || buffer.length > 5 * 1024 * 1024) throw new Error('Imagen demasiado grande o vacía');
 const image = sharp(buffer, {limitInputPixels: 20000000, failOn: 'warning'});
 const meta = await image.metadata();
 if (!['jpeg','png','webp'].includes(meta.format || '') || (meta.pages || 1) !== 1)
   throw new Error('Solo JPG, PNG o WebP estáticos');
 const clean = await image.rotate().resize({width:2400,height:2400,fit:'inside',withoutEnlargement:true}).jpeg({quality:90}).toBuffer();
 if (clean.length > 5 * 1024 * 1024) throw new Error('Imagen demasiado grande');
 return clean;
}
