begin;
create function public.canonical_receipt(p text) returns text language sql immutable as $$
 select case when strpos(p,'/storage/v1/object/public/payment-proofs/')>0
 then '/api/receipts/supabase/' || split_part(split_part(p,'/storage/v1/object/public/payment-proofs/',2),'?',1)
 else p end;
$$;
-- Normalizar referencias antiguas antes de utilizar el bucket privado.
update public.bookings set payment_proof_url=public.canonical_receipt(payment_proof_url)
 where payment_proof_url like '%/storage/v1/object/public/payment-proofs/%' and payment_proof_url not like '%###remaining:%';
update public.bookings set remaining_payment_proof_url=public.canonical_receipt(remaining_payment_proof_url)
 where remaining_payment_proof_url like '%/storage/v1/object/public/payment-proofs/%';
update public.bookings b set payment_history=(
 select jsonb_agg(case when e ? 'proofUrl' then jsonb_set(e,'{proofUrl}',coalesce(to_jsonb(public.canonical_receipt(e->>'proofUrl')),'null'::jsonb)) else e end)
 from jsonb_array_elements(b.payment_history) e)
 where jsonb_typeof(b.payment_history)='array' and jsonb_array_length(b.payment_history)>0;
create function public.receipt_bookings(p_path text)
returns table(id uuid,user_id uuid,pitch_id uuid)
language sql security definer set search_path=public as $$
 select b.id,b.user_id,b.pitch_id from public.bookings b
 where auth.role()='service_role' and (
 split_part(b.payment_proof_url,'###remaining:',1)=p_path
 or b.remaining_payment_proof_url=p_path
 or (case when jsonb_typeof(b.payment_history)='array' then b.payment_history else '[]'::jsonb end)
 @> jsonb_build_array(jsonb_build_object('proofUrl',p_path))
 );
$$;
revoke all on function public.receipt_bookings(text) from public,anon,authenticated;
grant execute on function public.receipt_bookings(text) to service_role;
commit;
