import { createClient } from '@supabase/supabase-js';
import { buildGoogleMapsUrl } from './pitch-location';


const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const rawEvoUrl = process.env.EVOLUTION_API_URL || 'http://127.0.0.1:8080';
const evoUrl = rawEvoUrl.replace('localhost', '127.0.0.1');
const evoApiKey = process.env.EVOLUTION_API_KEY || process.env.EVOLUTION_GLOBAL_APIKEY || 'TusClavesSecretasDeEvolution123';

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://cancheros.site').replace(/\/$/, '');
const OWNER_DEFAULT_PHONE = '573006577286';

// Instancia central oficial conectada al número 3006577286
export const CENTRAL_WHATSAPP_INSTANCE = process.env.CENTRAL_WHATSAPP_INSTANCE || 'Cancheros';

// Memoria caché para deduplicar eventos muy rápidos (ej: cuando el dueño aprueba varias horas continuas)
const recentNotifications = new Map<string, number>();

function isDuplicate(key: string, ttlMs = 15000): boolean {
  const now = Date.now();
  const lastTime = recentNotifications.get(key);
  if (lastTime && now - lastTime < ttlMs) {
    return true;
  }
  recentNotifications.set(key, now);
  // Limpieza simple
  if (recentNotifications.size > 200) {
    for (const [k, t] of recentNotifications.entries()) {
      if (now - t > ttlMs) recentNotifications.delete(k);
    }
  }
  return false;
}

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
 * Envía un mensaje de texto vía Evolution API de forma instantánea.
 */
export async function sendEvolutionWhatsAppText(instanceName: string, toPhone: string, text: string): Promise<boolean> {
  const formattedNumber = formatWhatsAppPhone(toPhone);
  if (!formattedNumber || !instanceName) return false;

  const tryInstances = [instanceName];
  if (instanceName.toLowerCase() !== instanceName) tryInstances.push(instanceName.toLowerCase());
  if (instanceName.toUpperCase() !== instanceName) tryInstances.push(instanceName.charAt(0).toUpperCase() + instanceName.slice(1));

  for (const inst of [...new Set(tryInstances)]) {
    try {
      const res = await fetch(`${evoUrl}/message/sendText/${inst}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: evoApiKey,
        },
        body: JSON.stringify({
          number: formattedNumber,
          options: {
            delay: 0,
            presence: 'available',
            linkPreview: false,
          },
          text: text,
        }),
      });

      if (res.ok) return true;
      const errText = await res.text().catch(() => '');
      console.warn(`[WhatsApp] Error enviando texto con instancia ${inst} a ${formattedNumber}:`, res.status, errText);
    } catch (err) {
      console.error(`[WhatsApp] Excepción al enviar texto con ${inst}:`, err);
    }
  }
  return false;
}

/**
 * Envía un archivo/imagen de comprobante vía Evolution API de forma instantánea.
 */
export async function sendEvolutionWhatsAppMedia(
  instanceName: string,
  toPhone: string,
  mediaUrl: string,
  caption: string
): Promise<boolean> {
  const formattedNumber = formatWhatsAppPhone(toPhone);
  if (!formattedNumber || !instanceName || !mediaUrl) return false;

  const tryInstances = [instanceName];
  if (instanceName.toLowerCase() !== instanceName) tryInstances.push(instanceName.toLowerCase());
  if (instanceName.toUpperCase() !== instanceName) tryInstances.push(instanceName.charAt(0).toUpperCase() + instanceName.slice(1));

  for (const inst of [...new Set(tryInstances)]) {
    try {
      const res = await fetch(`${evoUrl}/message/sendMedia/${inst}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: evoApiKey,
        },
        body: JSON.stringify({
          number: formattedNumber,
          mediatype: 'image',
          mimetype: 'image/jpeg',
          caption: caption,
          media: mediaUrl,
          fileName: 'comprobante.jpg',
          options: {
            delay: 0,
            presence: 'available',
          },
        }),
      });

      if (res.ok) return true;
      const errText = await res.text().catch(() => '');
      console.warn(`[WhatsApp] Error enviando media con instancia ${inst} a ${formattedNumber}:`, res.status, errText);
    } catch (err) {
      console.error(`[WhatsApp] Excepción al enviar media con ${inst}:`, err);
    }
  }
  return false;
}

/**
 * Notifica al cliente y al dueño cuando un cliente sube un comprobante de pago.
 * - Al CLIENTE: se envía desde la instancia de la cancha (o fallback a Cancheros).
 * - Al DUEÑO: se envía SIEMPRE desde la instancia central 'Cancheros' (3006577286),
 *   evitando que sea un automensaje y garantizando que suene/notifique en el celular del dueño.
 */
export async function notifyBookingSubmitted(bookingId: string) {
  try {
    // 1. Obtener la reserva y sus datos de cancha y empresa
    const { data: b, error: bErr } = await supabase
      .from('bookings')
      .select(`
        id, customer_name, customer_phone, start_time, end_time, payment_proof_url, created_at, user_id,
        pitches!inner (
          id, name, price_per_hour, booking_percentage, custom_pricing, type, contact_phone,
          companies!inner (
            id, name, address, zone, owner_phone, whatsapp_instance_name, whatsapp_connected_phone, owner_id
          )
        )
      `)
      .eq('id', bookingId)
      .maybeSingle();

    if (bErr || !b) {
      console.warn('[WhatsApp Notification] No se encontró la reserva con id:', bookingId, bErr);
      return;
    }

    const pitch = (b as any).pitches;
    const company = pitch?.companies;

    // Remitente para el cliente: ÚNICA Y EXCLUSIVAMENTE la instancia propia de esa cancha
    const customerSenderInstance = company?.whatsapp_instance_name;

    // Remitente para el dueño: SIEMPRE desde la instancia central 'Cancheros' (3006577286)
    const ownerSenderInstance = CENTRAL_WHATSAPP_INSTANCE;

    // 2. Buscar reservas hermanas (mismo comprobante o misma compra)
    let siblingBookings: any[] = [b];
    if (b.payment_proof_url) {
      const { data: siblings } = await supabase
        .from('bookings')
        .select(`
          id, customer_name, customer_phone, start_time, end_time, payment_proof_url, created_at,
          pitches!inner (
            id, name, price_per_hour, booking_percentage, custom_pricing, type
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
          id, customer_name, customer_phone, start_time, end_time, payment_proof_url, created_at,
          pitches!inner (
            id, name, price_per_hour, booking_percentage, custom_pricing, type
          )
        `)
        .eq('user_id', b.user_id)
        .gte('created_at', new Date(bTime - 120000).toISOString())
        .lte('created_at', new Date(bTime + 120000).toISOString())
        .order('start_time', { ascending: true });

      if (siblings && siblings.length > 0) siblingBookings = siblings;
    }

    siblingBookings.sort((a, c) => new Date(a.start_time).getTime() - new Date(c.start_time).getTime());

    // Deduplicación para no enviar múltiples alertas si se actualizan varias horas a la vez
    const leaderId = siblingBookings[0]?.id || b.id;
    if (b.id !== leaderId && isDuplicate(`submitted_group_${b.payment_proof_url || leaderId}`)) {
      return;
    }
    isDuplicate(`submitted_group_${b.payment_proof_url || leaderId}`);

    const pitchNames = Array.from(new Set(siblingBookings.map((s: any) => s.pitches?.name).filter(Boolean)));
    const pitchNameCombined = pitchNames.join(' + ') || pitch.name || 'Cancha';

    // Formatear fecha y horas en zona de Colombia
    const startDate = new Date(b.start_time);
    const fechaCorta = startDate.toLocaleDateString('es-CO', {
      timeZone: 'America/Bogota', weekday: 'long', day: 'numeric', month: 'long'
    });

    const horasList = siblingBookings.map((s: any) => {
      const start = new Date(s.start_time).toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', hour12: true });
      const end = new Date(s.end_time).toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', hour12: true });
      return `${start} - ${end}`;
    });
    const horasStr = horasList.join(', ');

    const customer_name = b.customer_name || 'Jugador';
    const customer_phone = b.customer_phone;
    const company_name = company?.name || 'Complejo Deportivo';
    const payment_proof_url = b.payment_proof_url;
    const shortId = (b.id ? b.id.slice(0, 8) : 'REF').toUpperCase();

    // ── A) MENSAJE AL CLIENTE: confirmación de recepción de comprobante ──
    const customerMsg =
      `*¡Recibimos tu comprobante!*\n\n` +
      // `${company_name}\n` +
      // `${pitchNameCombined}\n` +
      // `*Fecha:* ${fechaCorta}\n` +
      // `*Horario:* ${horasStr}\n\n` +
      `Tu reserva quedó en revisión. El dueño está validando tu comprobante y te notificaremos apenas sea aprobada 🙌`;

    // ── B) RESOLVER DESTINATARIOS DEL DUEÑO (PRIORIZANDO SU TELÉFONO PERSONAL) ──
    const targetOwnerPhones = new Set<string>();

    // 1. Teléfono de contacto del dueño en la empresa (prioridad absoluta)
    if (company?.owner_phone) {
      targetOwnerPhones.add(formatWhatsAppPhone(company.owner_phone));
    }

    // 2. Teléfono de contacto configurado en la cancha
    if (pitch?.contact_phone) {
      targetOwnerPhones.add(formatWhatsAppPhone(pitch.contact_phone));
    }

    // 3. Teléfono de WhatsApp conectado a la empresa
    if (company?.whatsapp_connected_phone) {
      targetOwnerPhones.add(formatWhatsAppPhone(company.whatsapp_connected_phone));
    }

    // 4. Si no está en company, buscar el teléfono en su perfil de usuario
    if (targetOwnerPhones.size === 0 && company?.owner_id) {
      const { data: prof } = await supabase.from('profiles').select('phone').eq('id', company.owner_id).maybeSingle();
      if (prof?.phone) {
        targetOwnerPhones.add(formatWhatsAppPhone(prof.phone));
      }
    }

    // 5. Fallback de soporte administrativo por defecto si no hay otro número
    if (targetOwnerPhones.size === 0 && OWNER_DEFAULT_PHONE) {
      targetOwnerPhones.add(formatWhatsAppPhone(OWNER_DEFAULT_PHONE));
    }

    // ── C) MENSAJE AL DUEÑO: aviso de reserva pendiente + link al dashboard ──
    const ownerMsg =
      `🔔 *¡Nuevo comprobante de pago recibido!*\n\n` +
      `🏟️ *${company_name}*\n` +
      `${pitchNameCombined}\n` +
      `*Cliente:* ${customer_name}${customer_phone ? ` (📱 ${customer_phone})` : ''}\n` +
      `📅 *Fecha:* ${fechaCorta}\n` +
      `⏰ *Horario:* ${horasStr}\n\n` +
      `*Revisar y aprobar en tu panel:*\n` +
      `👉 ${APP_URL}/dashboard/bookings`;

    // ── D) DISPARO PARALELO E INMEDIATO (SIN ESPERAS SECUENCIALES) ──
    const sendTasks: Promise<any>[] = [];

    // Notificar al cliente ÚNICAMENTE desde la instancia de su propia cancha
    if (customer_phone && customerSenderInstance) {
      sendTasks.push(
        sendEvolutionWhatsAppText(customerSenderInstance, customer_phone, customerMsg).catch(err =>
          console.error('[WhatsApp Notification] Error enviando a cliente desde instancia de la cancha:', err)
        )
      );
    }

    // Notificar al dueño SIEMPRE desde la instancia central Cancheros (3006577286) con la imagen del comprobante
    for (const phone of targetOwnerPhones) {
      if (!phone) continue;
      sendTasks.push(
        (async () => {
          let sent = false;
          if (payment_proof_url) {
            // Envía la foto del comprobante directamente con todos los datos en el pie de foto
            sent = await sendEvolutionWhatsAppMedia(
              ownerSenderInstance,
              phone,
              payment_proof_url,
              ownerMsg
            );
          }
          // Si no había comprobante o falló el envío multimedia, enviar como texto para no perder la alerta
          if (!sent) {
            await sendEvolutionWhatsAppText(ownerSenderInstance, phone, ownerMsg);
          }
        })().catch(err =>
          console.error(`[WhatsApp Notification] Error enviando a dueño ${phone} desde Cancheros:`, err)
        )
      );
    }

    await Promise.allSettled(sendTasks);
  } catch (err) {
    console.error('[notifyBookingSubmitted] Error:', err);
  }
}

/**
 * Notifica al cliente cuando el dueño aprueba o cancela la reserva.
 * Si es confirmada, envía el Ticket Digital formateado tipo entrada física/digital.
 */
export async function notifyBookingStatusChange(bookingId: string, newStatus: 'confirmed' | 'cancelled') {
  try {
    const { data: b, error } = await supabase
      .from('bookings')
      .select(`
        id, customer_name, customer_phone, start_time, end_time, payment_proof_url, created_at, user_id,
        pitches!inner (
          id, name, type, price_per_hour,
          companies!inner (
            id, name, address, zone, whatsapp_instance_name, lat, lng, place_id, place_name
          )
        )
      `)
      .eq('id', bookingId)
      .single();

    if (error || !b || !b.customer_phone) return;

    const pitch = (b as any).pitches;
    const company = pitch?.companies;
    const instanceName = company?.whatsapp_instance_name;
    if (!instanceName) return;

    // Buscar si hay horas hermanas para incluirlas todas en un solo ticket
    let siblingBookings: any[] = [b];
    if (b.payment_proof_url) {
      const { data: siblings } = await supabase
        .from('bookings')
        .select(`id, start_time, end_time, pitches(name)`)
        .eq('payment_proof_url', b.payment_proof_url)
        .order('start_time', { ascending: true });
      if (siblings && siblings.length > 0) siblingBookings = siblings;
    } else if (b.customer_phone && b.created_at) {
      const bTime = new Date(b.created_at).getTime();
      const { data: siblings } = await supabase
        .from('bookings')
        .select(`id, start_time, end_time, pitches(name)`)
        .eq('customer_phone', b.customer_phone)
        .gte('created_at', new Date(bTime - 120000).toISOString())
        .lte('created_at', new Date(bTime + 120000).toISOString())
        .order('start_time', { ascending: true });
      if (siblings && siblings.length > 0) siblingBookings = siblings;
    }

    siblingBookings.sort((a, c) => new Date(a.start_time).getTime() - new Date(c.start_time).getTime());

    // Deduplicación para no enviar múltiples tickets al cliente en reservas de varias horas
    const leaderId = siblingBookings[0]?.id || b.id;
    const dedupKey = `status_${newStatus}_${b.payment_proof_url || leaderId}_${b.customer_phone}`;
    if (isDuplicate(dedupKey, 15000)) {
      return;
    }

    const start = new Date(b.start_time);
    const fechaLarga = start.toLocaleDateString('es-CO', {
      timeZone: 'America/Bogota', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });

    const horasList = siblingBookings.map((s: any) => {
      const sStart = new Date(s.start_time).toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', hour12: true });
      const sEnd = new Date(s.end_time).toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', hour12: true });
      return `${sStart} - ${sEnd}`;
    });
    const horasStr = horasList.join(', ');

    const pitchNames = Array.from(new Set(siblingBookings.map((s: any) => s.pitches?.name).filter(Boolean))).join(' + ') || pitch.name;
    const shortId = (b.id ? b.id.slice(0, 8) : 'REF').toUpperCase();
    const address = company.address ? `${company.address}${company.zone ? `, ${company.zone}` : ''}` : 'Pasto, Nariño';
    // Construir link de Google Maps: usa place_id (pin exacto) → coordenadas → dirección texto
    const mapsUrl = buildGoogleMapsUrl({
      placeId: company.place_id || null,
      placeName: company.place_name || company.name || null,
      address: company.address || null,
      city: 'Pasto',
      lat: company.lat || null,
      lng: company.lng || null,
    });
    if (newStatus === 'confirmed') {
      // ── TICKET DIGITAL DE RESERVA (Diseño visual y estructurado) ──
      const ticketMsg =
        `✅ *RESERVA CONFIRMADA*\n\n` +
        `${company.name.toUpperCase()}\n` +
        `${pitchNames.toUpperCase()}\n` +
        `📅 *FECHA:* ${fechaLarga}\n` +
        `⏰ *HORARIO:* ${horasStr}\n` +
        // `📍 *DIRECCIÓN:* ${address}\n` +
        `📍 *VER EN MAPS:* ${mapsUrl}\n`;

      await sendEvolutionWhatsAppText(instanceName, b.customer_phone, ticketMsg);
    } else {
      // ── RESERVA CANCELADA ──
      const cancelMsg =
        `❌ *RESERVA DECLINADA / CANCELADA*\n\n` +
        `${company.name}\n` +
        `${pitchNames}\n` +
        `📅 *FECHA:* ${fechaLarga}\n` +
        `⏰ *HORARIO:* ${horasStr}\n\n` +
        `Tu solicitud de reserva no pudo ser confirmada por el complejo. Si realizaste un pago o tienes dudas, comunícate directamente con la administración de la cancha.`;

      await sendEvolutionWhatsAppText(instanceName, b.customer_phone, cancelMsg);
    }
  } catch (err) {
    console.error('[notifyBookingStatusChange] Error:', err);
  }
}
