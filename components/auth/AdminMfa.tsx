'use client';
import {useState} from 'react';
import {createClient} from '@/lib/supabase/client';
export function AdminMfa(){
 const [factor,setFactor]=useState('');const [qr,setQr]=useState('');const [code,setCode]=useState('');const [message,setMessage]=useState('');
 const db=createClient();
 async function start(){
  const {data,error}=await db.auth.mfa.listFactors();
  if(error){setMessage(error.message);return;}
  const existing=data.totp.find((f: {id:string;status:string})=>f.status==='verified');
  if(existing){setFactor(existing.id);return;}
  const result=await db.auth.mfa.enroll({factorType:'totp'});
  if(result.error){setMessage(result.error.message);return;}
  setFactor(result.data.id);setQr(result.data.totp.qr_code);
 }
 async function verify(){
  const {error}=await db.auth.mfa.challengeAndVerify({factorId:factor,code});
  setMessage(error?'Código inválido o vencido':'Segundo factor verificado. Ya puedes revisar solicitudes.');
 }
 return <section className="border p-4 space-y-2"><p>Para aprobar o rechazar, verifica tu segundo factor con una aplicación autenticadora.</p>
 <button onClick={start}>Configurar o verificar autenticador</button>
 {qr && <img src={qr} alt="Escanea el QR con tu aplicación autenticadora" />}
 {factor && <><input aria-label="Código de autenticador" value={code} onChange={e=>setCode(e.target.value)} inputMode="numeric" maxLength={6}/><button onClick={verify}>Verificar código</button></>}
 <p role="status">{message}</p></section>;
}
