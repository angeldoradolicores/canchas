import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit, createRateLimitErrorResponse } from '@/lib/rate-limit';
import { getAuthenticatedUser, verifyCompanyOwnership } from '@/lib/auth-guard';
import QRCode from 'qrcode';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function fetchWithTimeout(url: string, options: any = {}, timeoutMs = 12000) {
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

// Configura automáticamente el webhook de n8n en una instancia de Evolution
// Se llama cada vez que se crea o conecta una instancia nueva
async function setupInstanceWebhook(evoUrl: string, evoHeaders: Record<string, string>, instanceName: string) {
  const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL || 'http://n8n:5678/webhook/whatsapp';
  try {
    await fetchWithTimeout(`${evoUrl}/webhook/set/${instanceName}`, {
      method: 'POST',
      headers: { ...evoHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        webhook: {
          enabled: true,
          url: n8nWebhookUrl,
          webhookByEvents: false,
          webhookBase64: false,
          events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE'],
        },
      }),
    }, 5000);
    console.log(`[WhatsApp API] Webhook n8n configurado para instancia: ${instanceName}`);
  } catch (e) {
    console.warn(`[WhatsApp API] No se pudo configurar webhook para ${instanceName}:`, e);
  }
}

function cleanPhoneNumber(raw: any): string {
  if (!raw || typeof raw !== 'string') return '';
  const noDomain = raw.split('@')[0].split(':')[0];
  return noDomain.replace(/\D/g, '');
}

export async function POST(req: NextRequest) {
  // ── RATE LIMIT: 20 peticiones por minuto por IP ──
  const rateLimit = checkRateLimit(req, {
    limit: 20,
    windowSeconds: 60,
    keyPrefix: 'api:whatsapp',
  });
  if (!rateLimit.success) return createRateLimitErrorResponse(rateLimit);

  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Debes iniciar sesión' }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ success: false, error: 'Cuerpo de petición inválido' }, { status: 400 });
    }

    const { action, companyId, phone } = body;
    if (!companyId || typeof companyId !== 'string') {
      return NextResponse.json({ success: false, error: 'Falta companyId' }, { status: 400 });
    }

    // ── VERIFICACIÓN ESTRICTA DE PROPIEDAD DE LA EMPRESA ──
    const isOwner = await verifyCompanyOwnership(user.id, companyId);
    if (!isOwner) {
      // Verificar si es superadmin
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
      if (profile?.role !== 'superadmin') {
        return NextResponse.json({ success: false, error: 'No tienes permisos sobre este complejo deportivo' }, { status: 403 });
      }
    }

    const rawEvoUrl = process.env.EVOLUTION_API_URL || 'http://127.0.0.1:8080';
    const evoUrl = rawEvoUrl.trim().replace(/\/+$/, '').replace('localhost', '127.0.0.1');
    const evoApiKey = process.env.EVOLUTION_API_KEY || process.env.EVOLUTION_GLOBAL_APIKEY || 'TusClavesSecretasDeEvolution123';

    const evoHeaders: Record<string, string> = {
      apikey: evoApiKey,
      'Bypass-Tunnel-Reminder': 'true',
      'bypass-tunnel-reminder': 'true',
      'ngrok-skip-browser-warning': 'true',
      'User-Agent': 'CanchasPasto/1.0',
    };

    const { data: company } = await supabase
      .from('companies')
      .select('whatsapp_instance_name, whatsapp_status, owner_phone, whatsapp_connected_phone')
      .eq('id', companyId)
      .maybeSingle();

    const instanceName = company?.whatsapp_instance_name || `canchas_${companyId.replace(/-/g, '').slice(0, 12)}`;

    // 1. GENERAR CÓDIGO QR (ON DEMAND - OPTIMIZADO PARA MÁXIMA VELOCIDAD)
    if (action === 'generate_qr') {
      const isForce = Boolean(body.force);
      let rawBase64 = null;
      let rawCode = null;

      // Si el usuario fuerza la regeneración (desconectar anterior y obtener nuevo QR)
      if (isForce) {
        // Ejecutar logout y delete en paralelo con timeout corto para no demorar la creación
        await Promise.allSettled([
          fetchWithTimeout(`${evoUrl}/instance/logout/${instanceName}`, { method: 'DELETE', headers: evoHeaders }, 2000),
          fetchWithTimeout(`${evoUrl}/instance/delete/${instanceName}`, { method: 'DELETE', headers: evoHeaders }, 2000),
        ]);
      } else {
        // Verificar si la instancia ya está abierta/conectada
        try {
          const stateRes = await fetchWithTimeout(`${evoUrl}/instance/connectionState/${instanceName}`, {
            headers: evoHeaders,
          }, 2000);

          if (stateRes.ok) {
            const stateData = await stateRes.json();
            const state = stateData?.instance?.state || stateData?.state;
            if (state === 'open') {
              let detectedPhone = company?.whatsapp_connected_phone || company?.owner_phone || '';
              try {
                const instRes = await fetchWithTimeout(`${evoUrl}/instance/fetchInstances?instanceName=${instanceName}`, {
                  headers: evoHeaders,
                }, 3000);
                if (instRes.ok) {
                  const instList = await instRes.json();
                  const found = Array.isArray(instList)
                    ? (instList.find((i: any) => i.name === instanceName || i.instanceName === instanceName) || instList[0])
                    : (instList?.instance || instList);
                  const owner = found?.ownerJid || found?.owner || found?.jid || found?.number;
                  const parsed = cleanPhoneNumber(owner);
                  if (parsed) detectedPhone = parsed;
                }
              } catch (e) { /* ignorar */ }

              await supabase
                .from('companies')
                .update({
                  whatsapp_status: 'connected',
                  whatsapp_qr_code: null,
                  whatsapp_connected_phone: detectedPhone || null,
                  whatsapp_updated_at: new Date().toISOString(),
                })
                .eq('id', companyId);

              return NextResponse.json({
                success: true,
                status: 'connected',
                alreadyConnected: true,
                phone: detectedPhone,
                instanceName,
                message: 'Tu WhatsApp ya está conectado.',
              });
            }
          }
        } catch (e) {
          // Continuar al flujo
        }

        // Si existe y no es forzado, intentar connect rápido
        try {
          const connectRes = await fetchWithTimeout(`${evoUrl}/instance/connect/${instanceName}`, {
            method: 'GET',
            headers: evoHeaders,
          }, 4000);

          if (connectRes.ok) {
            const connectData = await connectRes.json();
            const state = connectData?.instance?.state || connectData?.state;
            if (state === 'open') {
              const detectedPhone = company?.whatsapp_connected_phone || company?.owner_phone || '';
              await supabase
                .from('companies')
                .update({
                  whatsapp_status: 'connected',
                  whatsapp_qr_code: null,
                  whatsapp_connected_phone: detectedPhone || null,
                  whatsapp_updated_at: new Date().toISOString(),
                })
                .eq('id', companyId);

              return NextResponse.json({
                success: true,
                status: 'connected',
                alreadyConnected: true,
                phone: detectedPhone,
                instanceName,
                message: 'Tu WhatsApp ya está conectado.',
              });
            }
            rawBase64 = connectData?.base64 || connectData?.qrcode?.base64;
            rawCode = connectData?.code || connectData?.qrcode?.code;
          }
        } catch (e) {
          // Si connect falla, pasamos directo a crearla
        }
      }

      // Si no tenemos QR (o si fue forzado), crear la instancia inmediatamente
      if (!rawBase64 && !rawCode) {
        try {
          const createRes = await fetchWithTimeout(`${evoUrl}/instance/create`, {
            method: 'POST',
            headers: {
              ...evoHeaders,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              instanceName,
              token: evoApiKey,
              qrcode: true,
              integration: 'WHATSAPP-BAILEYS',
            }),
          }, 12000);

          if (createRes.ok) {
            const createData = await createRes.json();
            rawBase64 = createData?.qrcode?.base64 || createData?.base64;
            rawCode = createData?.qrcode?.code || createData?.code;
            // Configurar webhook en segundo plano sin retrasar la respuesta al usuario
            void setupInstanceWebhook(evoUrl, evoHeaders, instanceName).catch(() => { });
          }
        } catch (e) {
          console.warn('[WhatsApp API] Error al crear la instancia:', e);
        }
      }

      // Fallback final: si tras crear aún no hay base64/code, solicitar connect una vez más
      if (!rawBase64 && !rawCode) {
        try {
          const retryRes = await fetchWithTimeout(`${evoUrl}/instance/connect/${instanceName}`, {
            method: 'GET',
            headers: evoHeaders,
          }, 4000);
          if (retryRes.ok) {
            const retryData = await retryRes.json();
            rawBase64 = retryData?.base64 || retryData?.qrcode?.base64;
            rawCode = retryData?.code || retryData?.qrcode?.code;
          }
        } catch (e) { /* ignorar */ }
      }

      let finalQrImage = '';
      if (rawBase64) {
        finalQrImage = rawBase64.startsWith('data:image')
          ? rawBase64
          : `data:image/png;base64,${rawBase64}`;
      } else if (rawCode) {
        try {
          finalQrImage = await QRCode.toDataURL(rawCode, { margin: 2, scale: 8, color: { dark: '#000000', light: '#FFFFFF' } });
        } catch (e) {
          const qrData = encodeURIComponent(rawCode);
          finalQrImage = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${qrData}&color=000000&margin=10`;
        }
      }

      if (!finalQrImage) {
        return NextResponse.json({
          error: 'Presiona "Generar Código" para generar un nuevo código .',
          instanceName,
        }, { status: 502 });
      }

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

    // 2. CHECK STATUS (SINCRONIZACIÓN AUTOMÁTICA CELULAR <-> WEB)
    if (action === 'check_status') {
      try {
        const evoRes = await fetchWithTimeout(`${evoUrl}/instance/connectionState/${instanceName}`, {
          headers: evoHeaders,
        }, 2500);

        if (evoRes.ok) {
          const evoData = await evoRes.json();
          const state = evoData?.instance?.state || evoData?.state;

          if (state === 'open') {
            let detectedPhone = company?.whatsapp_connected_phone || '';

            try {
              const instRes = await fetchWithTimeout(`${evoUrl}/instance/fetchInstances?instanceName=${instanceName}`, {
                headers: evoHeaders,
              }, 3000);
              if (instRes.ok) {
                const instList = await instRes.json();
                const found = Array.isArray(instList)
                  ? (instList.find((i: any) => i.name === instanceName || i.instanceName === instanceName) || instList[0])
                  : (instList?.instance || instList);
                const owner = found?.ownerJid || found?.owner || found?.jid || found?.number;
                const parsed = cleanPhoneNumber(owner);
                if (parsed) detectedPhone = parsed;
              }
            } catch (e) { /* fallback */ }

            if (!detectedPhone) {
              const rawOwner = evoData?.instance?.owner || evoData?.owner || evoData?.instance?.jid || evoData?.jid || '';
              const parsed = cleanPhoneNumber(rawOwner);
              if (parsed) detectedPhone = parsed;
            }

            if (!detectedPhone) {
              detectedPhone = company?.whatsapp_connected_phone || company?.owner_phone || '';
            }

            if (company?.whatsapp_status !== 'connected' || (detectedPhone && detectedPhone !== company?.whatsapp_connected_phone)) {
              await supabase
                .from('companies')
                .update({
                  whatsapp_status: 'connected',
                  whatsapp_qr_code: null,
                  whatsapp_connected_phone: detectedPhone,
                  whatsapp_updated_at: new Date().toISOString(),
                })
                .eq('id', companyId);
            }

            return NextResponse.json({
              success: true,
              status: 'connected',
              phone: detectedPhone || company?.whatsapp_connected_phone || company?.owner_phone || '',
            });
          } else {
            // El estado en Evolution API es 'close', 'connecting' o no está abierto
            // Esto ocurre cuando el usuario cierra la sesión desde su celular en Dispositivos Vinculados
            if (company?.whatsapp_status !== 'disconnected') {
              await supabase
                .from('companies')
                .update({
                  whatsapp_status: 'disconnected',
                  whatsapp_qr_code: null,
                  whatsapp_connected_phone: null,
                  whatsapp_updated_at: new Date().toISOString(),
                })
                .eq('id', companyId);
            }

            return NextResponse.json({
              success: true,
              status: 'disconnected',
              phone: '',
            });
          }
        } else if (evoRes.status === 404) {
          // La instancia no existe en Evolution API -> está desconectada
          if (company?.whatsapp_status !== 'disconnected') {
            await supabase
              .from('companies')
              .update({
                whatsapp_status: 'disconnected',
                whatsapp_qr_code: null,
                whatsapp_connected_phone: null,
                whatsapp_updated_at: new Date().toISOString(),
              })
              .eq('id', companyId);
          }

          return NextResponse.json({
            success: true,
            status: 'disconnected',
            phone: '',
          });
        }
      } catch (err) {
        // En caso de timeout transitorio de red, mantener el status de BD
      }

      return NextResponse.json({
        success: true,
        status: company?.whatsapp_status || 'disconnected',
        phone: company?.whatsapp_connected_phone || company?.owner_phone || '',
      });
    }

    // 3. CONFIRMAR / VINCULAR MANUALMENTE
    if (action === 'confirm_connect') {
      const cleanPhone = cleanPhoneNumber(phone) || cleanPhoneNumber(company?.owner_phone) || '';
      await supabase
        .from('companies')
        .update({
          whatsapp_instance_name: instanceName,
          whatsapp_status: 'connected',
          whatsapp_qr_code: null,
          whatsapp_connected_phone: cleanPhone || null,
          whatsapp_updated_at: new Date().toISOString(),
        })
        .eq('id', companyId);

      return NextResponse.json({
        success: true,
        status: 'connected',
        connectedPhone: cleanPhone,
        instanceName,
      });
    }

    // 4. DESCONECTAR (DESDE LA PÁGINA WEB HACIA EL CELULAR)
    if (action === 'disconnect') {
      // Notificar tanto logout como delete a Evolution API para invalidar la sesión en WhatsApp
      await Promise.allSettled([
        fetchWithTimeout(`${evoUrl}/instance/logout/${instanceName}`, {
          method: 'DELETE',
          headers: evoHeaders,
        }, 3000),
        fetchWithTimeout(`${evoUrl}/instance/delete/${instanceName}`, {
          method: 'DELETE',
          headers: evoHeaders,
        }, 3000),
      ]);

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
      const rawPhone = (typeof phone === 'string' && phone) || '3001234567';
      const cleanDigits = rawPhone.replace(/\D/g, '').slice(0, 15);
      const formattedPhone = cleanDigits.startsWith('57') ? cleanDigits : `57${cleanDigits}`;

      try {
        const sendRes = await fetchWithTimeout(`${evoUrl}/message/sendText/${instanceName}`, {
          method: 'POST',
          headers: {
            ...evoHeaders,
            'Content-Type': 'application/json',
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

      return NextResponse.json({ success: true, message: 'Simulación de envío completada' });
    }

    return NextResponse.json({ success: false, error: 'Acción no soportada' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}