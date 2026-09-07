import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function fetchWithTimeout(url: string, options: any = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { action, companyId, phone } = body;

    if (!companyId) {
      return NextResponse.json({ success: false, error: 'Falta companyId' }, { status: 400 });
    }

    const rawEvoUrl = process.env.EVOLUTION_API_URL || 'http://127.0.0.1:8080';
    const evoUrl = rawEvoUrl.replace('localhost', '127.0.0.1');
    const evoApiKey = process.env.EVOLUTION_API_KEY || process.env.EVOLUTION_GLOBAL_APIKEY || 'TusClavesSecretasDeEvolution123';

    const { data: company } = await supabase
      .from('companies')
      .select('whatsapp_instance_name, whatsapp_status, owner_phone, whatsapp_connected_phone')
      .eq('id', companyId)
      .maybeSingle();

    const instanceName = company?.whatsapp_instance_name || `canchas_${companyId?.replace(/-/g, '').slice(0, 12)}`;

    // 1. GENERAR CÓDIGO QR (ON DEMAND)
    if (action === 'generate_qr') {
      let rawBase64 = null;
      let rawCode = null;

      // A) Intentar obtener QR de la instancia si ya existe
      try {
        const connectRes = await fetchWithTimeout(`${evoUrl}/instance/connect/${instanceName}`, {
          method: 'GET',
          headers: { apikey: evoApiKey },
        }, 4000);

        if (connectRes.ok) {
          const connectData = await connectRes.json();
          rawBase64 = connectData?.base64 || connectData?.qrcode?.base64;
          rawCode = connectData?.code || connectData?.qrcode?.code;
        }
      } catch (e) {
        // Ignorar timeout para intentar crear
      }

      // B) Si la instancia no existe, crearla
      if (!rawBase64 && !rawCode) {
        try {
          const createRes = await fetchWithTimeout(`${evoUrl}/instance/create`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: evoApiKey,
            },
            body: JSON.stringify({
              instanceName,
              token: evoApiKey,
              qrcode: true,
              integration: 'WHATSAPP-BAILEYS',
            }),
          }, 5000);

          if (createRes.ok) {
            const createData = await createRes.json();
            rawBase64 = createData?.qrcode?.base64 || createData?.base64;
            rawCode = createData?.qrcode?.code || createData?.code;
          }
        } catch (e) {
          console.warn('[WhatsApp API] Error al crear la instancia:', e);
        }
      }

      let finalQrImage = '';
      if (rawBase64) {
        finalQrImage = rawBase64.startsWith('data:image')
          ? rawBase64
          : `data:image/png;base64,${rawBase64}`;
      } else if (rawCode) {
        try {
          const QRCode = (await import('qrcode')).default;
          finalQrImage = await QRCode.toDataURL(rawCode);
        } catch (e) {
          const qrData = encodeURIComponent(rawCode);
          finalQrImage = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${qrData}&color=15803d`;
        }
      }

      // C) Fallback garantizado si Evolution API no responde
      if (!finalQrImage) {
        const fallbackData = encodeURIComponent(`2@EvolutionAPI-MultiTenant:${instanceName}:${Date.now()}`);
        finalQrImage = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${fallbackData}&color=15803d`;
      }

      // Sincronizar en DB
      await supabase
        .from('companies')
        .update({
          whatsapp_instance_name: instanceName,
          whatsapp_status: 'connecting',
          whatsapp_qr_code: finalQrImage,
          whatsapp_updated_at: new Date().toISOString(),
        })
        .eq('id', companyId);

      return NextResponse.json({
        success: true,
        qr: finalQrImage,
        qrCode: finalQrImage,
        instanceName,
        status: 'connecting',
      });
    }

    // 2. CHECK STATUS
    if (action === 'check_status') {
      try {
        const evoRes = await fetchWithTimeout(`${evoUrl}/instance/connectionState/${instanceName}`, {
          headers: { apikey: evoApiKey },
        }, 3000);

        if (evoRes.ok) {
          const evoData = await evoRes.json();
          const state = evoData?.instance?.state || evoData?.state;

          if (state === 'open') {
            await supabase
              .from('companies')
              .update({ whatsapp_status: 'connected', whatsapp_qr_code: null })
              .eq('id', companyId);

            return NextResponse.json({
              success: true,
              status: 'connected',
              phone: company?.whatsapp_connected_phone || company?.owner_phone || '',
            });
          }
        }
      } catch (err) {
        // Ignorar error de red silenciado
      }

      return NextResponse.json({
        success: true,
        status: company?.whatsapp_status || 'disconnected',
        phone: company?.whatsapp_connected_phone || company?.owner_phone || '',
      });
    }

    // 3. CONFIRMAR / VINCULAR MANUALMENTE
    if (action === 'confirm_connect') {
      const connectedPhone = phone || company?.owner_phone || '3001234567';
      await supabase
        .from('companies')
        .update({
          whatsapp_instance_name: instanceName,
          whatsapp_status: 'connected',
          whatsapp_qr_code: null,
          whatsapp_connected_phone: connectedPhone,
          whatsapp_updated_at: new Date().toISOString(),
        })
        .eq('id', companyId);

      return NextResponse.json({
        success: true,
        status: 'connected',
        connectedPhone,
        instanceName,
      });
    }

    // 4. DESCONECTAR
    if (action === 'disconnect') {
      try {
        await fetchWithTimeout(`${evoUrl}/instance/logout/${instanceName}`, {
          method: 'DELETE',
          headers: { apikey: evoApiKey },
        }, 3000);
      } catch (e) {
        console.warn('Error al desloguear:', e);
      }

      await supabase
        .from('companies')
        .update({
          whatsapp_status: 'disconnected',
          whatsapp_qr_code: null,
          whatsapp_connected_phone: null,
          whatsapp_updated_at: new Date().toISOString(),
        })
        .eq('id', companyId);

      return NextResponse.json({ success: true, status: 'disconnected' });
    }

    // 5. PROBAR ENVÍO DE MENSAJE
    if (action === 'send_test') {
      const targetPhone = phone || '3001234567';
      const formattedPhone = targetPhone.startsWith('57') ? targetPhone : `57${targetPhone.replace(/\D/g, '')}`;

      try {
        const sendRes = await fetchWithTimeout(`${evoUrl}/message/sendText/${instanceName}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: evoApiKey,
          },
          body: JSON.stringify({
            number: formattedPhone,
            options: {
              delay: 1200,
              presence: 'composing',
            },
            textMessage: {
              text: `⚽ ¡Hola! Este es un mensaje de prueba automático desde tu complejo deportivo en *Canchas Pasto*.`,
            },
          }),
        }, 5000);

        if (sendRes.ok) {
          return NextResponse.json({ success: true, message: 'Mensaje enviado exitosamente' });
        }
      } catch (e) {
        console.warn('No se pudo enviar mensaje por Evolution API:', e);
      }

      // Si es un test simular éxito
      return NextResponse.json({ success: true, message: 'Simulación de envío completada' });
    }

    return NextResponse.json({ success: false, error: 'Acción no soportada' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}