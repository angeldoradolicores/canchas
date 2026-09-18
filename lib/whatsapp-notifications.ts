import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const rawEvoUrl = process.env.EVOLUTION_API_URL || 'http://127.0.0.1:8080';
const evoUrl = rawEvoUrl.replace('localhost', '127.0.0.1');
const evoApiKey = process.env.EVOLUTION_API_KEY || process.env.EVOLUTION_GLOBAL_APIKEY || 'TusClavesSecretasDeEvolution123';

/**
 * Normaliza cualquier número de teléfono al formato internacional requerido por WhatsApp (ej: 573001234567).
 */
export function formatWhatsAppPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  if (phone.includes('@g.us')) return phone; // Permitir IDs de grupo
  const clean = phone.replace(/\D/g, '');
  if (!clean) return '';
  if (clean.startsWith('57') && clean.length >= 12) return clean;
  if (clean.length === 10) return `57${clean}`;
  return clean;
}

/**
 * Envía un mensaje de texto vía Evolution API.
 */
export async function sendEvolutionWhatsAppText(instanceName: string, toPhone: string, text: string): Promise<boolean> {
  const formattedNumber = formatWhatsAppPhone(toPhone);
  if (!formattedNumber || !instanceName) return false;

  try {
    const res = await fetch(`${evoUrl}/message/sendText/${instanceName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: evoApiKey,
      },
      body: JSON.stringify({
        number: formattedNumber,
        options: {
          delay: 1200,
          presence: 'composing',
          linkPreview: true,
        },
        text: text,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn(`[WhatsApp] Error enviando texto a ${formattedNumber}:`, res.status, errText);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[WhatsApp] Excepción al enviar texto:', err);
    return false;
  }
}

/**
 * Envía un archivo/imagen de comprobante vía Evolution API.
 */
export async function sendEvolutionWhatsAppMedia(
  instanceName: string,
  toPhone: string,
  mediaUrl: string,
  caption: string
): Promise<boolean> {
  const formattedNumber = formatWhatsAppPhone(toPhone);
  if (!formattedNumber || !instanceName || !mediaUrl) return false;

  try {
    const res = await fetch(`${evoUrl}/message/sendMedia/${instanceName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: evoApiKey,
      },
      body: JSON.stringify({
        number: formattedNumber,
        mediatype: 'image',
        caption: caption,
        media: mediaUrl,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn(`[WhatsApp] Error enviando media a ${formattedNumber}:`, res.status, errText);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[WhatsApp] Excepción al enviar media:', err);
    return false;
  }
}

/**
 * Notifica al cliente y al dueño cuando un cliente sube un comprobante de pago desde la web.
 */
export async function notifyBookingSubmitted(bookingId: string) {
  try {
    // 1. Obtener datos de la reserva principal y complejo
    const { data: b, error: bErr } = await supabase
      .from('bookings')
      .select(`
        id, customer_name, customer_phone, start_time, end_time, payment_proof_url, total_price, deposit_amount, created_at, user_id,
        pitches!inner (
          id, name, price_per_hour, booking_percentage, custom_pricing,
          companies!inner (
            id, name, owner_phone, whatsapp_instance_name, owner_id
          )
        )
      `)
      .eq('id', bookingId)
      .maybeSingle();

    if (bErr || !b) {
      console.warn('[WhatsApp Notification] No se encontró la reserva con id:', bookingId);
      return;
    }

    const pitch = (b as any).pitches;
    const company = pitch?.companies;
    let ownerPhone = company?.owner_phone;
    if (company?.owner_id) {
      const { data: prof } = await supabase.from('profiles').select('phone').eq('id', company.owner_id).maybeSingle();
      if (prof?.phone) ownerPhone = prof.phone;
    }

    const instanceName = company?.whatsapp_instance_name;
    if (!instanceName) {
      console.warn('[WhatsApp Notification] La empresa no tiene whatsapp_instance_name configurado.');
      return;
    }

    // 2. Buscar todas las reservas que se hicieron EN ESE MISMO MOMENTO
    let siblingBookings: any[] = [b];
    if (b.payment_proof_url) {
      const { data: siblings } = await supabase
        .from('bookings')
        .select(`
          id, customer_name, customer_phone, start_time, end_time, payment_proof_url, total_price, deposit_amount, created_at,
          pitches!inner (
            id, name, price_per_hour, booking_percentage, custom_pricing
          )
        `)
        .eq('payment_proof_url', b.payment_proof_url)
        .order('start_time', { ascending: true });

      if (siblings && siblings.length > 0) {
        siblingBookings = siblings;
      }
    } else if (b.user_id && b.created_at) {
      const bTime = new Date(b.created_at).getTime();
      const minTime = new Date(bTime - 120000).toISOString();
      const maxTime = new Date(bTime + 120000).toISOString();
      const { data: siblings } = await supabase
        .from('bookings')
        .select(`
          id, customer_name, customer_phone, start_time, end_time, payment_proof_url, total_price, deposit_amount, created_at,
          pitches!inner (
            id, name, price_per_hour, booking_percentage, custom_pricing
          )
        `)
        .eq('user_id', b.user_id)
        .gte('created_at', minTime)
        .lte('created_at', maxTime)
        .order('start_time', { ascending: true });

      if (siblings && siblings.length > 0) {
        siblingBookings = siblings;
      }
    }

    // Ordenar cronológicamente
    siblingBookings.sort((a, c) => new Date(a.start_time).getTime() - new Date(c.start_time).getTime());

    const pitchNames = Array.from(new Set(siblingBookings.map((s: any) => s.pitches?.name).filter(Boolean)));
    const pitchNameCombined = pitchNames.join(' + ') || pitch.name;

    const startDate = new Date(b.start_time);
    const dateStr = startDate.toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric' });

    const timeSlotsLines = siblingBookings.map((s: any) => {
      const start = new Date(s.start_time);
      const end = new Date(s.end_time);
      const t = `${start.toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' })} a ${end.toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' })}`;
      return pitchNames.length > 1 ? `• ${s.pitches?.name}: ${t}` : `• ${t}`;
    }).join('\n');

    const totalVal = siblingBookings.reduce((sum, s) => sum + Number(s.total_price || s.pitches?.price_per_hour || 0), 0);
    const totalDeposit = siblingBookings.reduce((sum, s) => {
      if (s.deposit_amount) return sum + Number(s.deposit_amount);
      const pct = s.pitches?.booking_percentage || 50;
      return sum + Math.round((Number(s.pitches?.price_per_hour || 0) * pct) / 100);
    }, 0);

    const short_id = b.id.slice(0, 6);
    const customer_name = b.customer_name || 'Jugador';
    const customer_phone = b.customer_phone;
    const company_name = company.name;
    const payment_proof_url = b.payment_proof_url;

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    // A) NOTIFICAR AL CLIENTE (Un solo mensaje con todas las canchas y horas del momento)
    if (customer_phone) {
      const customerMsg =
        `⚽ *¡Hola ${customer_name}!* Hemos recibido tu comprobante de pago para *${pitchNameCombined}* (${company_name}).\n\n` +
        `📅 *Fecha:* ${dateStr}\n` +
        `⏰ *Horarios reservados:*\n${timeSlotsLines}\n\n` +
        `💰 *Valor Total:* $${totalVal.toLocaleString('es-CO')} COP\n` +
        `💵 *Abono:* $${totalDeposit.toLocaleString('es-CO')} COP\n` +
        `🎫 *Referencia:* #${short_id}\n\n` +
        `⏳ Tu reserva está actualmente *en espera de revisión y aprobación* por parte de la administración del complejo.\n` +
        `Te enviaremos tu ticket oficial de reserva en cuanto sea aprobada. ¡Gracias por preferirnos!`;

      await sendEvolutionWhatsAppText(instanceName, customer_phone, customerMsg);
    }

    // B) NOTIFICAR AL DUEÑO (O GRUPO COMPROBANTES)
    let finalOwnerPhone = ownerPhone;
    try {
      const groupRes = await fetch(`${evoUrl}/group/fetchAllGroups/${instanceName}?getParticipants=false`, {
        headers: { apikey: evoApiKey }
      });
      if (groupRes.ok) {
        const groups = await groupRes.json();
        const comprobantesGroup = groups.find((g: any) => g.subject && g.subject.toLowerCase() === 'comprobantes');
        if (comprobantesGroup && comprobantesGroup.id) {
          finalOwnerPhone = comprobantesGroup.id;
        } else {
          const evoRes = await fetch(`${evoUrl}/instance/fetchInstances?instanceName=${instanceName}`, {
            headers: { apikey: evoApiKey }
          });
          if (evoRes.ok) {
            const instances = await evoRes.json();
            if (instances && instances.length > 0 && instances[0].ownerJid) {
              finalOwnerPhone = instances[0].ownerJid.replace('@s.whatsapp.net', '');
            }
          }
        }
      }
    } catch (e) {
      console.warn('Could not fetch instance groups or ownerJid', e);
    }

    if (finalOwnerPhone) {
      const filteredDashboardUrl = `${appUrl}/dashboard/bookings?search=${encodeURIComponent(customer_name)}&status=pending`;

      const ownerMsg =
        `🚨 *¡NUEVA SOLICITUD DE RESERVA!* 🚨\n\n` +
        `📌 *Complejo:* ${company_name}\n` +
        `⚽ *Cancha(s):* ${pitchNameCombined}\n` +
        `👤 *Cliente:* ${customer_name}\n` +
        `📱 *Teléfono:* ${customer_phone || 'No registrado'}\n` +
        `📅 *Fecha:* ${dateStr}\n` +
        `⏰ *Horarios solicitados:*\n${timeSlotsLines}\n\n` +
        `💰 *Valor Total:* $${totalVal.toLocaleString('es-CO')} COP\n` +
        `💵 *Abono reportado:* $${totalDeposit.toLocaleString('es-CO')} COP\n` +
        `🎟️ *Código:* *${short_id}*\n\n` +
        `🧾 *Comprobante:* ${payment_proof_url || 'No adjunto'}\n\n` +
        `🔗 *Ver en tu panel:* ${filteredDashboardUrl}\n\n` +
        `💬 *Para responder rápido desde aquí, escribe:*\n` +
        `👉 *aprobar ${short_id}* (para confirmar y enviar ticket al cliente)\n` +
        `👉 *cancelar ${short_id}* (para cancelar)`;

      await sendEvolutionWhatsAppText(instanceName, finalOwnerPhone, ownerMsg);

      // Si hay imagen del comprobante, enviarla como medio al dueño
      if (payment_proof_url && (payment_proof_url.includes('.jpg') || payment_proof_url.includes('.png') || payment_proof_url.includes('.jpeg') || payment_proof_url.includes('payment-proofs'))) {
        await sendEvolutionWhatsAppMedia(
          instanceName,
          finalOwnerPhone,
          payment_proof_url,
          `🧾 Comprobante de ${customer_name} (Ref: #${short_id})`
        );
      }
    }
  } catch (err) {
    console.error('[notifyBookingSubmitted] Error:', err);
  }
}

/**
 * Notifica al cliente cuando el dueño aprueba o cancela la reserva (desde la web o por WhatsApp).
 */
export async function notifyBookingStatusChange(bookingId: string, newStatus: 'confirmed' | 'cancelled') {
  try {
    const { data: b } = await supabase
      .from('bookings')
      .select(`
        id, customer_name, customer_phone, start_time, end_time,
        pitches!inner (
          id, name,
          companies!inner (
            name, whatsapp_instance_name
          )
        )
      `)
      .eq('id', bookingId)
      .single();

    if (!b || !b.customer_phone) return;

    const pitch = (b as any).pitches;
    const company = pitch?.companies;
    const instanceName = company?.whatsapp_instance_name;
    if (!instanceName) return;

    const start = new Date(b.start_time);
    const end = new Date(b.end_time);
    const dateStr = start.toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = `${start.toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' })} a ${end.toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' })}`;
    const shortId = b.id.slice(0, 6);

    if (newStatus === 'confirmed') {
      const pitchId = (pitch as any).id || '';
      const pitchUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/cancha/${pitchId}`;
      const ticketMsg =
        `⚽ *¡Partido confirmado!*\n\n` +
        `📍 ${pitch.name}\n` +
        `📅 Fecha: ${dateStr}\n` +
        `🕐 Hora: ${timeStr}\n` +
        `🎫 Ref: *#${shortId}*\n\n` +
        `Ver cancha y ubicación:\n${pitchUrl}\n\n` +
        `¡Allá nos vemos! 🏆`;

      await sendEvolutionWhatsAppText(instanceName, b.customer_phone, ticketMsg);
    } else {
      const cancelMsg =
        `⚠️ Tu reserva (Ref: *#${shortId}*) en *${company.name}* no pudo confirmarse.\n\n` +
        `Si realizaste un pago, contáctate con la administración del complejo.`;

      await sendEvolutionWhatsAppText(instanceName, b.customer_phone, cancelMsg);
    }
  } catch (err) {
    console.error('[notifyBookingStatusChange] Error:', err);
  }
}
