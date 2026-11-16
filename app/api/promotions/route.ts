import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {z} from 'zod';
import {getAuthenticatedUser,verifyCompanyOwnership} from '@/lib/auth-guard';
import {boundedJson} from '@/lib/bounded-json';
import {checkRateLimit,createRateLimitErrorResponse} from '@/lib/rate-limit';
const uuid=z.string().uuid();
const campaign=z.object({company_id:uuid,title:z.string().trim().min(3).max(120),
 required_bookings:z.number().int().min(1).max(1000),gift_hours:z.number().int().min(1).max(24),
 redeem_days:z.number().int().min(1).max(365),weekdays:z.array(z.number().int().min(0).max(6)).min(1).max(7),
 ends_at:z.string().datetime()}).strict();
function db(){return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!);}
export async function GET(req:NextRequest){
 try{
 const service=db();const user=await getAuthenticatedUser(req);
 const company=req.nextUrl.searchParams.get('company_id');
 if(company && !uuid.safeParse(company).success)return NextResponse.json({error:'Complejo inválido'},{status:400});
 let query=service.from('complex_promotions').select('id,company_id,title,required_bookings,gift_hours,redeem_days,weekdays,starts_at,ends_at,active').eq('active',true).gt('ends_at',new Date().toISOString());
 if(company)query=query.eq('company_id',company);
 const {data:promotions,error}=await query.limit(100);
 if(error)throw error;
 const {data:rewards,error:rewardError}=user ? await service.from('promotion_rewards')
 .select('*, complex_promotions(title,company_id,weekdays,required_bookings,companies(name))')
 .eq('user_id',user.id).gt('remaining',0).gt('expires_at',new Date().toISOString()).order('earned_at',{ascending:false}).limit(100) : {data:[],error:null};
 if(rewardError)throw rewardError;
 const {data:companies}=user ? await service.from('companies').select('id,name').eq('owner_id',user.id):{data:[]};
 return NextResponse.json({promotions,rewards,companies},{headers:{'Cache-Control':'private, no-store'}});
 }catch{return NextResponse.json({error:'No se pudieron consultar las promociones'},{status:500});}
}
export async function POST(req:NextRequest){
 try{
 const user=await getAuthenticatedUser(req);if(!user)return NextResponse.json({error:'Inicia sesión'},{status:401});
 if(req.headers.get('origin')!==req.nextUrl.origin)return NextResponse.json({error:'Origen inválido'},{status:403});
 const limit=checkRateLimit(req,{limit:15,windowSeconds:60,keyPrefix:'promotions',identifier:user.id});
 if(!limit.success)return createRateLimitErrorResponse(limit);
 const body=await boundedJson(req,6000);const service=db();
 if(body.action==='redeem'){
  const parsed=z.object({action:z.literal('redeem'),reward_id:uuid,booking_ids:z.array(uuid).min(1).max(24)}).strict().safeParse(body);
  if(!parsed.success)return NextResponse.json({error:'Datos inválidos'},{status:400});
  const {data,error}=await service.rpc('redeem_complex_reward',{p_reward:parsed.data.reward_id,p_user:user.id,p_ids:parsed.data.booking_ids});
  if(error)return NextResponse.json({error:'El regalo no está disponible para esas horas, días o fechas. Revisa su vigencia.'},{status:409});
  return NextResponse.json({success:true,data:(data||[]).map(({lock_token,...b}:any)=>b)});
 }
 if(body.action==='stop'){
  const parsed=z.object({action:z.literal('stop'),id:uuid}).strict().safeParse(body);
  if(!parsed.success)return NextResponse.json({error:'Datos inválidos'},{status:400});
  const {data:p}=await service.from('complex_promotions').select('company_id').eq('id',parsed.data.id).single();
  if(!p || !await verifyCompanyOwnership(user.id,p.company_id))return NextResponse.json({error:'No autorizado'},{status:403});
  const {error}=await service.from('complex_promotions').update({active:false}).eq('id',parsed.data.id);
  if(error)throw error;return NextResponse.json({success:true});
 }
 const parsed=campaign.safeParse(body);
 if(!parsed.success || new Date(parsed.data.ends_at).getTime()<=Date.now())return NextResponse.json({error:'Revisa los datos y la fecha de finalización'},{status:400});
 if(!await verifyCompanyOwnership(user.id,parsed.data.company_id))return NextResponse.json({error:'Solo el dueño aprobado puede crear promociones'},{status:403});
 const {error:expiryError}=await service.from('complex_promotions').update({active:false}).eq('company_id',parsed.data.company_id).eq('active',true).lte('ends_at',new Date().toISOString());
 if(expiryError)throw expiryError;
 const {error}=await service.from('complex_promotions').insert({...parsed.data,created_by:user.id});
 if(error)return NextResponse.json({error:'No se pudo crear. Finaliza la promoción anterior antes de publicar otra.'},{status:409});
 return NextResponse.json({success:true});
 }catch{return NextResponse.json({error:'No se pudo procesar la promoción'},{status:400});}
}
