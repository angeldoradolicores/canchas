'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import {
  QrCode,
  Smartphone,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Loader2,
  Send,
  Zap,
  Info,
  LogOut,
  AlertCircle,
} from 'lucide-react';

export default function WhatsAppConnectionPage() {
  const { user, profile } = useAuth();

  const [company, setCompany] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [connectedPhone, setConnectedPhone] = useState<string>('');
  const [inputPhone, setInputPhone] = useState<string>('');
  const [testPhone, setTestPhone] = useState<string>('');
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 1. Cargar datos iniciales del complejo
  useEffect(() => {
    let isMounted = true;

    async function fetchCompanyData() {
      if (!user?.id) {
        setLoading(false);
        return;
      }
      try {
        const res = await fetch('/api/admin-actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'ensure_company',
            payload: {
              owner_id: user.id,
              company_name: profile?.full_name ? `Complejo ${profile.full_name}` : 'Mi Complejo Deportivo',
            },
          }),
        });

        const json = await res.json();
        const targetCompany = json.success ? json.data : null;

        if (isMounted && targetCompany) {
          setCompany(targetCompany);
          setConnectedPhone(targetCompany.whatsapp_connected_phone || targetCompany.owner_phone || '');
          if (targetCompany.owner_phone) setInputPhone(targetCompany.owner_phone);

          // Consultar estado en tiempo real
          const statusRes = await fetch('/api/whatsapp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'check_status', companyId: targetCompany.id }),
          });
          const statusJson = await statusRes.json();

          if (statusJson.success && statusJson.status === 'connected') {
            setStatus('connected');
            if (statusJson.phone) setConnectedPhone(statusJson.phone);
          } else {
            setStatus(targetCompany.whatsapp_status || 'disconnected');
          }
        }
      } catch (err: any) {
        if (isMounted) setErrorMsg('No se pudo cargar la información de WhatsApp de tu complejo.');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchCompanyData();

    return () => {
      isMounted = false;
    };
  }, [user, profile]);

  // 2. Polling si está en estado 'connecting' para detectar cuando escanean el QR
  useEffect(() => {
    if (status !== 'connecting' || !company?.id) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/whatsapp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'check_status', companyId: company.id }),
        });
        const data = await res.json();

        if (data.success && data.status === 'connected') {
          setStatus('connected');
          setConnectedPhone(data.phone || inputPhone || '3000000000');
          setQrCode(null);
          clearInterval(interval);
        }
      } catch (e) {
        console.error('Error comprobando conexión...', e);
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [status, company, inputPhone]);

  // 3. Generar / Regenerar Código QR
  const handleGenerateQR = async () => {
    setGenerating(true);
    setErrorMsg(null);
    try {
      let activeCompany = company;

      if (!activeCompany && user?.id) {
        const compRes = await fetch('/api/admin-actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'ensure_company',
            payload: {
              owner_id: user.id,
              company_name: profile?.full_name ? `Complejo ${profile.full_name}` : 'Mi Complejo Deportivo',
            },
          }),
        });
        const compJson = await compRes.json();
        if (compJson.success && compJson.data) {
          activeCompany = compJson.data;
          setCompany(compJson.data);
        }
      }

      const companyId = activeCompany?.id;
      if (!companyId) throw new Error('No se pudo verificar la empresa asociada.');

      const res = await fetch('/api/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate_qr', companyId }),
      });

      const data = await res.json();

      if (data.success && (data.qr || data.qrCode)) {
        setQrCode(data.qr || data.qrCode);
        setStatus('connecting');
      } else {
        setErrorMsg(data.error || 'No se pudo obtener el código QR de WhatsApp.');
      }
    } catch (err: any) {
      setErrorMsg('Error al conectar con el servidor: ' + err.message);
    } finally {
      setGenerating(false);
    }
  };

  // Simulación / Confirmación manual
  const handleSimulateScan = async () => {
    if (!company?.id) return;
    setGenerating(true);
    try {
      const phoneToUse = inputPhone || company.owner_phone || '3001234567';
      const res = await fetch('/api/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'confirm_connect',
          companyId: company.id,
          phone: phoneToUse,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setStatus('connected');
        setConnectedPhone(data.connectedPhone || phoneToUse);
        setQrCode(null);
      }
    } catch (err: any) {
      setErrorMsg('Error al conectar: ' + err.message);
    } finally {
      setGenerating(false);
    }
  };

  // Desconectar
  const handleDisconnect = async () => {
    if (!company?.id) return;
    if (!confirm('¿Estás seguro de desconectar tu WhatsApp?')) return;

    setGenerating(true);
    try {
      const res = await fetch('/api/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'disconnect', companyId: company.id }),
      });
      const data = await res.json();
      if (data.success) {
        setStatus('disconnected');
        setQrCode(null);
        setConnectedPhone('');
      }
    } catch (err: any) {
      setErrorMsg('Error al desconectar: ' + err.message);
    } finally {
      setGenerating(false);
    }
  };

  // Probar envío de mensaje
  const handleSendTestMessage = async () => {
    if (!testPhone) {
      alert('Ingresa un número para enviar el mensaje de prueba');
      return;
    }
    setSendingTest(true);
    setTestResult('');
    try {
      const res = await fetch('/api/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_test',
          companyId: company?.id,
          phone: testPhone,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setTestResult(`✅ Mensaje enviado exitosamente a +57 ${testPhone}`);
      } else {
        setTestResult(`❌ Error: ${data.error || 'No se pudo enviar'}`);
      }
    } catch (err: any) {
      setTestResult('❌ Error al enviar mensaje: ' + err.message);
    } finally {
      setSendingTest(false);
    }
  };

  if (loading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center gap-3">
        <Loader2 size={32} className="animate-spin text-emerald-600" />
        <span className="text-xs font-semibold text-zinc-500">Verificando conexión de WhatsApp...</span>
      </div>
    );
  }

  const instanceName = company?.whatsapp_instance_name || `canchas_${company?.id?.slice(0, 8) || 'inst'}`;

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12 p-4">
      <div>
        <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-600">WHATSAPP SAAS DE TU COMPLEJO</span>
        <h1 className="text-2xl font-bold flex items-center gap-2 text-zinc-900 mt-1">
          <Smartphone className="text-emerald-600" size={24} /> Conectar mi WhatsApp
        </h1>
        <p className="text-xs text-zinc-500">
          Vincula el número oficial de tu complejo ({company?.name || profile?.full_name || 'Mi Complejo'}) para que tus clientes reciban confirmaciones automáticamente.
        </p>
      </div>

      {errorMsg && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-xs font-bold underline">Cerrar</button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-zinc-100 mb-6">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">Estado de Vinculación</span>
              {status === 'connected' && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-green-100 text-green-700">
                  <CheckCircle2 size={14} /> Conectado
                </span>
              )}
              {status === 'connecting' && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-amber-100 text-amber-700 animate-pulse">
                  <RefreshCw size={14} className="animate-spin" /> Esperando escaneo...
                </span>
              )}
              {status === 'disconnected' && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-red-100 text-red-700">
                  <XCircle size={14} /> Desconectado
                </span>
              )}
            </div>

            {/* ESTADO CONECTADO */}
            {status === 'connected' && (
              <div className="space-y-4">
                <div className="flex items-center gap-4 p-4 rounded-xl bg-emerald-50 border border-emerald-200">
                  <div className="w-12 h-12 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xl">
                    📱
                  </div>
                  <div>
                    <strong className="text-base block font-bold text-zinc-900">
                      +57 {connectedPhone || '300 123 4567'}
                    </strong>
                    <p className="text-xs text-zinc-500">Sesión activa · Vinculado a {company?.name || 'Mi Complejo'}</p>
                  </div>
                </div>

                <div className="bg-zinc-50 p-4 rounded-xl space-y-2 text-xs border border-zinc-100">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Instancia activa:</span>
                    <code className="font-mono font-bold text-emerald-600">{instanceName}</code>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-zinc-100">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider block mb-2">
                    Probar envío de mensaje
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Número ej: 3001234567"
                      value={testPhone}
                      onChange={(e) => setTestPhone(e.target.value)}
                      className="flex-1 px-3 py-2 border border-zinc-200 rounded-xl bg-zinc-50 text-xs font-medium outline-none focus:border-emerald-600"
                    />
                    <button
                      onClick={handleSendTestMessage}
                      disabled={sendingTest}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all"
                    >
                      {sendingTest ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Probar
                    </button>
                  </div>
                  {testResult && <p className="text-xs mt-2 font-medium">{testResult}</p>}
                </div>
              </div>
            )}

            {/* ESTADO CONECTANDO / QR */}
            {status === 'connecting' && (
              <div className="flex flex-col items-center justify-center py-4 space-y-4 text-center">
                <div className="p-4 bg-white rounded-2xl shadow-md border border-zinc-200">
                  {qrCode ? (
                    <img src={qrCode} alt="Código QR WhatsApp" className="w-56 h-56 object-contain rounded-lg" />
                  ) : (
                    <div className="w-56 h-56 flex flex-col items-center justify-center bg-zinc-50 text-zinc-400 gap-3 p-4">
                      <Loader2 size={32} className="animate-spin text-emerald-600" />
                      <span className="text-xs font-semibold">Generando código QR...</span>
                      <button
                        onClick={handleGenerateQR}
                        disabled={generating}
                        className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 mt-2"
                      >
                        <RefreshCw size={12} className={generating ? 'animate-spin' : ''} /> Obtener QR
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <h3 className="font-bold text-sm text-zinc-900">Escanea este código QR con WhatsApp</h3>
                  <p className="text-xs text-zinc-500 max-w-sm">
                    Abre WhatsApp ➔ Menú ➔ Dispositivos vinculados ➔ Vincular dispositivo.
                  </p>
                  <button
                    onClick={handleGenerateQR}
                    disabled={generating}
                    className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-bold text-xs rounded-xl inline-flex items-center gap-1.5 transition-colors border border-zinc-200 mt-2"
                  >
                    <RefreshCw size={14} className={generating ? 'animate-spin' : ''} /> Generar de nuevo
                  </button>
                </div>

                <div className="pt-2 w-full max-w-xs space-y-2 border-t border-zinc-100 mt-4">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase block">¿Modo de prueba rápida?</span>
                  <input
                    type="text"
                    placeholder="Tu número (ej: 3001234567)"
                    value={inputPhone}
                    onChange={(e) => setInputPhone(e.target.value)}
                    className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-xs bg-zinc-50 outline-none"
                  />
                  <button
                    onClick={handleSimulateScan}
                    disabled={generating}
                    className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all"
                  >
                    {generating ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                    Confirmar / Vincular número
                  </button>
                </div>
              </div>
            )}

            {/* ESTADO DESCONECTADO */}
            {status === 'disconnected' && (
              <div className="py-8 text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-zinc-100 text-zinc-400 mx-auto flex items-center justify-center">
                  <QrCode size={32} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-zinc-900">WhatsApp no vinculado</h3>
                  <p className="text-xs text-zinc-500 max-w-md mx-auto mt-1">
                    Vincula tu número para enviar mensajes de confirmación de reservas y recordatorios automáticamente a tus jugadores.
                  </p>
                </div>

                <button
                  onClick={handleGenerateQR}
                  disabled={generating}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl text-sm font-bold inline-flex items-center gap-2 shadow-lg transition-all"
                >
                  {generating ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <>
                      <QrCode size={18} /> Generar Código QR de Conexión
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {status === 'connected' && (
            <div className="pt-6 mt-6 border-t border-zinc-100 flex justify-end">
              <button
                onClick={handleDisconnect}
                disabled={generating}
                className="text-xs font-bold text-red-600 hover:bg-red-50 px-4 py-2 rounded-xl border border-red-200 transition-colors flex items-center gap-1.5"
              >
                <LogOut size={14} /> Desconectar mi WhatsApp
              </button>
            </div>
          )}
        </div>

        <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <h3 className="font-bold text-sm flex items-center gap-1.5 text-emerald-600">
              <Zap size={16} /> ¿Cómo funciona el envío?
            </h3>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Cada complejo deportivo en <strong>Canchas Pasto</strong> dispone de una instancia aislada para gestionar sus notificaciones sin interferir con otros negocios.
            </p>
          </div>

          <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-100 text-[11px] text-zinc-500 flex items-start gap-2">
            <Info size={16} className="text-emerald-600 flex-shrink-0 mt-0.5" />
            <span>
              Puedes desvincular o cerrar la sesión cuando quieras desde Dispositivos vinculados en tu WhatsApp.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}