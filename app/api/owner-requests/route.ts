import { boundedJson } from '@/lib/bounded-json';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { getAuthenticatedUser } from '@/lib/auth-guard';
import { checkRateLimit, createRateLimitErrorResponse } from '@/lib/rate-limit';

const schema = z.object({
 full_name: z.string().trim().min(2).max(100),
 company_name: z.string().trim().min(2).max(150),
 phone: z.string().regex(/^[0-9+]{10,16}$/),
 address: z.string().trim().min(5).max(300),
 evidence: z.string().trim().min(10).max(2000),
}).strict();
async function handle(req: NextRequest) {
 try {
  const user = await getAuthenticatedUser(req);
  if (!user) return NextResponse.json({error:'Inicia sesión'}, {status:401});
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const admin = user.app_metadata?.role === 'superadmin';
  // Los datos personales de los solicitantes y la aprobación exigen segundo factor (aal2).
  async function hasMfa() {
   const jar=await cookies();
   const sessionClient=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>jar.getAll(),setAll:()=>{}}});
   const {data:claims,error:claimsError}=await sessionClient.auth.getClaims();
   return !claimsError && claims?.claims.sub===user!.id && claims?.claims.aal==='aal2';
  }
  if(req.method === 'GET') {
   if(admin && !await hasMfa())
    return NextResponse.json({data:[],admin,mfaRequired:true},{headers:{'Cache-Control':'private, no-store'}});
   let query = db.from('owner_requests').select('*').order('created_at', {ascending:true});
   if(!admin) query=query.eq('user_id',user.id);
   else query=query.eq('status','pending');
   const page=Math.max(0,Math.min(100000,Number(req.nextUrl.searchParams.get('page'))||0));
   query=query.range(page*50,page*50+49);
   const {data,error}=await query;
   if(error) throw error;
   return NextResponse.json({data,admin},{headers:{'Cache-Control':'private, no-store'}});
  }
  if(req.headers.get('origin') !== req.nextUrl.origin)
   return NextResponse.json({error:'Origen no autorizado'}, {status:403});
  const rl=checkRateLimit(req,{limit:10,windowSeconds:60,keyPrefix:'owner-requests',identifier:user.id});
  if(!rl.success) return createRateLimitErrorResponse(rl);
  const body=await boundedJson(req,8000);
  if(req.method==='PATCH') {
   if(!admin) return NextResponse.json({error:'Solo superadministradores'}, {status:403});
   if(!await hasMfa())
    return NextResponse.json({error:'Verifica tu segundo factor antes de revisar solicitudes'}, {status:403});
   const parsed=z.object({user_id:z.string().uuid(),approve:z.boolean()}).strict().safeParse(body);
   if(!parsed.success) return NextResponse.json({error:'Datos inválidos'}, {status:400});
   const {error}=await db.rpc('review_owner_request',{p_user:parsed.data.user_id,p_reviewer:user.id,p_approve:parsed.data.approve});
   if(error) return NextResponse.json({error:'No se pudo resolver la solicitud pendiente'}, {status:409});
  } else {
   const parsed=schema.safeParse(body);
   if(!parsed.success) return NextResponse.json({error:'Completa todos los datos y una evidencia de al menos 10 caracteres'}, {status:400});
   const {error}=await db.rpc('resubmit_owner_request',{p_user:user.id,p_data:parsed.data});
   if(error) return NextResponse.json({error:'Ya existe una solicitud o no pudo guardarse'}, {status:409});
  }
  return NextResponse.json({success:true});
 } catch {return NextResponse.json({error:'No se pudo procesar la solicitud'}, {status:500});}
}
export const GET=handle;
export const POST=handle;
export const PATCH=handle;
