'use client';
import {useEffect,useState} from 'react';
import {dayNames} from './ComplexPromotions';
export function RewardPicker({companyId,value,onChange}:{companyId:string;value:string;onChange:(id:string)=>void}){
 const [items,setItems]=useState<any[]>([]);
 useEffect(()=>{let active=true;fetch('/api/promotions?company_id='+encodeURIComponent(companyId)).then(r=>r.json()).then(j=>{if(active)setItems((j.rewards||[]).filter((r:any)=>r.complex_promotions?.company_id===companyId));}).catch(()=>{});return()=>{active=false;};},[companyId]);
 if(!items.length)return null;
 return <section className="p-4 rounded-2xl border border-emerald-500 bg-emerald-500/10 space-y-2">
 <label className="font-bold block">🎁 Usa tus horas gratis<select value={value} onChange={e=>onChange(e.target.value)} className="mt-2 p-3 rounded-xl border bg-background w-full">
 <option value="">Pagar normalmente y seguir acumulando</option>{items.map(r=><option key={r.id} value={r.id}>{r.remaining} horas · {r.complex_promotions.title}</option>)}</select></label>
 {value&&items.filter(r=>r.id===value).map(r=><p className="text-sm" key={r.id}>Válido: {r.complex_promotions.weekdays.map((d:number)=>dayNames[d]).join(', ')}. Juega antes del {new Date(r.expires_at).toLocaleString('es-CO',{timeZone:'America/Bogota'})}. Todas las horas seleccionadas deben caber en el regalo. No necesitas transferir ni adjuntar comprobante.</p>)}
 </section>;
}
