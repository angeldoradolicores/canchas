import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const rawEvoUrl = process.env.EVOLUTION_API_URL || 'http://127.0.0.1:8080';
const evoUrl = rawEvoUrl.replace('localhost', '127.0.0.1');
const evoApiKey = process.env.EVOLUTION_API_KEY || process.env.EVOLUTION_GLOBAL_APIKEY || 'TusClavesSecretasDeEvolution123';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

/**
 * Normaliza cualquier número de teléfono al formato internacional requerido por WhatsApp (ej: 573001234567).
 */
export function formatWhatsAppPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  if (phone.includes('@g.us')) return phone;
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
 * Notifica al cliente y al dueño cuando un cliente sube un comprobante de pago.
 */
export async function notifyBookingSubmitted(bookingId: string) {
  try {
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

    // Buscar todas las reservas del mismo comprobante (mismo momento)
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

      if (siblings && siblings.length > 0) siblingBookings = siblings;
    } else if (b.user_id && b.created_at) {
      const bTime = new Date(b.created_at).getTime();
      const { data: siblings } = await supabase
        .from('bookings')
        .select(`
          id, customer_name, customer_phone, start_time, end_time, payment_proof_url, total_price, deposit_amount, created_at,
          pitches!inner (id, name, price_per_hour, booking_percentage, custom_pricing)
        `)
        .eq('user_id', b.user_id)
        .gte('created_at', new Date(bTime - 120000).toISOString())
        .lte('created_at', new Date(bTime + 120000).toISOString())
        .order('start_time', { ascending: true });

      if (siblings && siblings.length > 0) siblingBookings = siblings;
    }

    siblingBookings.sort((a, c) => new Date(a.start_time).getTime() - new Date(c.start_time).getTime());

    const pitchNames = Array.from(new Set(siblingBookings.map((s: any) => s.pitches?.name).filter(Boolean)));
    const pitchNameCombined = pitchNames.join(' + ') || pitch.name;

    // Fecha corta: "viernes 3"
    const startDate = new Date(b.start_time);
    const fechaCorta = startDate.toLocaleDateString('es-CO', {
      timeZone: 'America/Bogota', weekday: 'long', day: 'numeric'
    });

    // Horas: solo rangos cortos "6:00 pm - 7:00 pm, 7:00 pm - 8:00 pm"
    const horasStr = siblingBookings.map((s: any) => {
      const start = new Date(s.start_time).toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', hour12: true });
      const end = new Date(s.end_time).toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', hour12: true });
      return `${start} - ${end}`;
    }).join(', ');

    const customer_name = b.customer_name || 'Jugador';
    const customer_phone = b.customer_phone;
    const company_name = company.name;
    const payment_proof_url = b.payment_proof_url;

    // ── A) MENSAJE AL CLIENTE: corto y humano ──
    if (customer_phone) {
      const customerMsg =
        `✅ Recibimos tu comprobante\n\n` +
        `⚽ ${pitchNameCombined} — ${company_name}\n` +
        `📅 ${fechaCorta} a las ${horasStr}\n\n` +
        `El dueño lo está revisando, te avisamos en cuanto confirme 🙌\n` +
        `👉 ${APP_URL}/reservations`;

      await sendEvolutionWhatsAppText(instanceName, customer_phone, customerMsg);
    }

    // ── B) MENSAJE AL DUEÑO: con el comprobante adjunto ──
    let finalOwnerPhone = ownerPhone;
    try {
      const groupRes = await fetch(`${evoUrl}/group/fetchAllGroups/${instanceName}?getParticipants=false`, {
        headers: { apikey: evoApiKey }
      });
      if (groupRes.ok) {
        const groups = await groupRes.json();
        const comprobantesGroup = groups.find((g: any) => g.subject && g.subject.toLowerCase() === 'comprobantes');
        if (comprobantesGroup?.id) {
          finalOwnerPhone = comprobantesGroup.id;
        } else {
          const evoRes = await fetch(`${evoUrl}/instance/fetchInstances?instanceName=${instanceName}`, {
            headers: { apikey: evoApiKey }
          });
          if (evoRes.ok) {
            const instances = await evoRes.json();
            if (instances?.length > 0 && instances[0].ownerJid) {
              finalOwnerPhone = instances[0].ownerJid.replace('@s.whatsapp.net', '');
            }
          }
        }
      }
    } catch (e) {
      console.warn('Could not fetch instance groups or ownerJid', e);
    }

    if (finalOwnerPhone) {
      const ownerMsg =
        `🔔 Nueva reserva pendiente\n\n` +
        `👤 ${customer_name}${customer_phone ? ` | 📱 ${customer_phone}` : ''}\n` +
        `⚽ ${pitchNameCombined}\n` +
        `📅 ${fechaCorta} — ${horasStr}\n\n` +
        `👉 ${APP_URL}/dashboard/bookings`;

      await sendEvolutionWhatsAppText(instanceName, finalOwnerPhone, ownerMsg);

      // Adjuntar imagen del comprobante al dueño
      if (payment_proof_url && (payment_proof_url.includes('payment-proofs') || /\.(jpg|jpeg|png|webp)/.test(payment_proof_url))) {
        await sendEvolutionWhatsAppMedia(
          instanceName,
          finalOwnerPhone,
          payment_proof_url,
          `🧾 Comprobante de ${customer_name}`
        );
      }
    }
  } catch (err) {
    console.error('[notifyBookingSubmitted] Error:', err);
  }
}

/**
 * Notifica al cliente cuando el dueño aprueba o cancela la reserva.
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

    const fechaCorta = start.toLocaleDateString('es-CO', {
      timeZone: 'America/Bogota', weekday: 'long', day: 'numeric'
    });
    const horaStr =
      `${start.toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', hour12: true })} - ` +
      `${end.toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', hour12: true })}`;

    if (newStatus === 'confirmed') {
      const pitchId = (pitch as any).id || '';
      const ticketMsg =
        `🎉 ¡Tu reserva está confirmada!\n\n` +
        `⚽ ${pitch.name} — ${company.name}\n` +
        `📅 ${fechaCorta} a las ${horaStr}\n\n` +
        `Preséntate al complejo y muestra este mensaje ✅\n` +
        `👉 ${APP_URL}/reservations`;

      await sendEvolutionWhatsAppText(instanceName, b.customer_phone, ticketMsg);
    } else {
      const cancelMsg =
        `❌ Tu reserva en *${company.name}* fue cancelada\n\n` +
        `⚽ ${pitch.name} — ${fechaCorta}\n\n` +
        `Si tienes dudas, escríbenos directamente.`;

      await sendEvolutionWhatsAppText(instanceName, b.customer_phone, cancelMsg);
    }
  } catch (err) {
    console.error('[notifyBookingStatusChange] Error:', err);
  }
}
