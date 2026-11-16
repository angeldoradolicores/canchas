const {test}=require('node:test');
const assert=require('node:assert/strict');
const ts=require('typescript');
const fs=require('node:fs');
const Module=require('node:module');
const sharp=require('sharp');
const filename=require('node:path').resolve('lib/receipt-security.ts');
const mod=new Module(filename,module);
mod.filename=filename;mod.paths=module.paths;
mod._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,filename);
const {sanitizeReceipt}=mod.exports;
test('rechaza cabecera JPEG sin imagen',async()=>{
 await assert.rejects(()=>sanitizeReceipt(Buffer.from([255,216,255,0,0])));
});
test('rechaza SVG aunque sea una imagen decodificable',async()=>{
 await assert.rejects(()=>sanitizeReceipt(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>')));
});
test('recodifica PNG válido a JPEG y elimina datos anexados',async()=>{
 const png=await sharp({create:{width:30,height:30,channels:3,background:'white'}}).png().toBuffer();
 const result=await sanitizeReceipt(Buffer.concat([png,Buffer.from('UNTRUSTED_PAYLOAD')]));
 assert.equal((await sharp(result).metadata()).format,'jpeg');
 assert.equal(result.includes(Buffer.from('UNTRUSTED_PAYLOAD')),false);
});
test('rechaza archivo mayor de 5 MB',async()=>{
 await assert.rejects(()=>sanitizeReceipt(Buffer.alloc(5*1024*1024+1)));
});
test('rechaza demasiados píxeles',async()=>{
 const png=await sharp({create:{width:5000,height:5000,channels:3,background:'white'}}).png().toBuffer();
 await assert.rejects(()=>sanitizeReceipt(png));
});
