export async function boundedJson(req: Request, maxBytes: number) {
 const reader=req.body?.getReader(); if(!reader) throw new Error('Empty body');
 const chunks:Uint8Array[]=[];let length=0;
 try {while(true){const {done,value}=await reader.read();if(done)break;
 length+=value.length;if(length>maxBytes)throw new Error('Body too large');chunks.push(value);}}
 finally {await reader.cancel();}
 return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
