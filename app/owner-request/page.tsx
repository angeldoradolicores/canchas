'use client';
import { AdminMfa } from '@/components/auth/AdminMfa';
import { useEffect, useState } from 'react';
export default function OwnerRequestPage(){
 const [page,setPage]=useState(0);
 const [data,setData]=useState<any[]>([]);
 const [admin,setAdmin]=useState(false);
 const [message,setMessage]=useState('');
 const [busy,setBusy]=useState(false);
 async function refresh(){
  const res=await fetch('/api/owner-requests?page='+page); const json=await res.json();
  if(!res.ok){setMessage(json.error);return;}
  setData(json.data);setAdmin(json.admin);
  if(json.mfaRequired)setMessage('Verifica tu segundo factor para ver las solicitudes y luego recarga la página.');
 }
 useEffect(()=>{void refresh();},[page]);
 async function send(body:object,method='POST'){
  setBusy(true);setMessage('');
  try{
   const res=await fetch('/api/owner-requests',{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
   const json=await res.json();setMessage(res.ok?'Solicitud procesada':json.error);
   await refresh();
  }catch{setMessage('Error de conexión');}finally{setBusy(false);}
 }
 return <main className="max-w-2xl mx-auto p-6 space-y-5">
  <h1 className="text-2xl font-bold">{admin?'Solicitudes de complejos':'Solicitar administración de un complejo'}</h1>
  <p>Tu cuenta seguirá siendo de jugador hasta que un superadministrador verifique y apruebe tu solicitud. La evidencia debe permitir comprobar tu relación con el complejo.</p>
  {admin && <AdminMfa/>}
  <p role="status">{message}</p>
  {!admin && (data.length===0 || data[0]?.status==='rejected') && <form className="space-y-4" onSubmit={e=>{e.preventDefault();void send(Object.fromEntries(new FormData(e.currentTarget)));}}>
   {Object.entries({full_name:'Nombre completo',company_name:'Nombre del complejo',phone:'Celular con indicativo',address:'Dirección del complejo',evidence:'Evidencia: enlace oficial y explicación de tu relación con el complejo'}).map(([name,label])=><label className="block" key={name}>{label}<input className="block border rounded p-2 w-full" name={name} required maxLength={name==='evidence'?2000: name==='phone'?16: name==='address'?300:100}/></label>)}
   <button disabled={busy} className="btn-primary">Enviar solicitud</button>
  </form>}
  {data.map(r=><article className="border rounded p-4 space-y-2" key={r.user_id}>
   <h2 className="font-bold">{r.company_name}</h2><p>{r.full_name} · {r.phone}</p><p>{r.address}</p><p className="break-words">{r.evidence}</p>
   <p>Estado: {r.status==='pending'?'Pendiente':r.status==='approved'?'Aprobada':'Rechazada'}</p>
   {admin && r.status==='pending' && <div className="flex gap-4"><button disabled={busy} onClick={()=>send({user_id:r.user_id,approve:true},'PATCH')}>Aprobar dueño</button><button disabled={busy} onClick={()=>send({user_id:r.user_id,approve:false},'PATCH')}>Rechazar</button></div>}
  </article>)}
  {admin && <div><button disabled={!page} onClick={()=>setPage(page-1)}>Anterior</button><button disabled={data.length<50} onClick={()=>setPage(page+1)}>Siguiente</button></div>}
  <a href="/">Volver al inicio</a>
 </main>;
}
