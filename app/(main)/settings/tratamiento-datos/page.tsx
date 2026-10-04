'use client';

import { ArrowLeft, FileCheck2, ShieldCheck, CheckCircle2, UserCheck, AlertTriangle, Phone, Calendar } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

export default function TratamientoDatosPage() {
  const [accepted, setAccepted] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleAuthorize = () => {
    if (!accepted) return;
    setSubmitted(true);
  };

  const purposes = [
    'Gestionar y confirmar sus reservas de canchas deportivas en la plataforma.',
    'Enviar notificaciones y tickets digitales de confirmación por WhatsApp.',
    'Comunicar actualizaciones, cambios de horario o cancelaciones de reservas.',
    'Mejorar los servicios mediante análisis estadístico anonimizado del uso de la plataforma.',
    'Cumplir con obligaciones legales, fiscales y regulatorias vigentes en Colombia.',
    'Prevenir fraudes y garantizar la seguridad e integridad de la plataforma.',
    'Contactar al usuario para soporte técnico o atención al cliente.',
  ];

  const rights = [
    { right: 'Conocer', desc: 'Saber qué datos personales suyos son objeto de tratamiento.' },
    { right: 'Actualizar', desc: 'Solicitar la corrección o actualización de sus datos en cualquier momento.' },
    { right: 'Rectificar', desc: 'Corregir datos incompletos, inexactos o desactualizados.' },
    { right: 'Suprimir', desc: 'Solicitar la eliminación de sus datos cuando no exista deber legal de conservarlos.' },
    { right: 'Revocar', desc: 'Revocar esta autorización en cualquier momento, sin efectos retroactivos.' },
    { right: 'Acceder', desc: 'Acceder gratuitamente a sus datos que hayan sido objeto de tratamiento.' },
  ];

  return (
    <div className="page-content max-w-3xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/settings"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6 group"
        >
          <ArrowLeft size={16} className="group-hover:-translate-x-0.5 transition-transform" />
          Volver a Configuración
        </Link>

        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/25 shrink-0">
            <FileCheck2 size={26} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-foreground">Autorización de Tratamiento</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Tratamiento de Datos Personales · Ley 1581 de 2012
            </p>
          </div>
        </div>

        <div className="mt-6 p-4 bg-emerald-500/10 border border-emerald-500/25 rounded-2xl flex items-start gap-3">
          <ShieldCheck size={18} className="text-emerald-500 shrink-0 mt-0.5" />
          <p className="text-sm text-foreground/80 leading-relaxed">
            De conformidad con la <strong className="text-foreground">Ley 1581 de 2012</strong>, el 
            <strong className="text-foreground"> Decreto 1377 de 2013</strong> y demás normas concordantes, 
            Canchas Pasto requiere su autorización expresa para realizar el tratamiento de sus datos personales.
          </p>
        </div>
      </div>

      {/* Responsable */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm mb-4">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border/60 bg-secondary/30">
          <div className="w-8 h-8 rounded-xl bg-card flex items-center justify-center border border-border shadow-xs">
            <UserCheck size={18} className="text-emerald-500" />
          </div>
          <h2 className="font-bold text-sm sm:text-base text-foreground">Responsable del Tratamiento</h2>
        </div>
        <div className="px-5 py-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { label: 'Razón Social', value: 'Canchas Pasto' },
              { label: 'Ciudad', value: 'Pasto, Nariño, Colombia' },
              { label: 'Canal de Contacto', value: 'Soporte en la plataforma' },
              { label: 'Base Legal', value: 'Ley 1581/2012 · Decreto 1377/2013' },
            ].map(({ label, value }) => (
              <div key={label} className="bg-secondary/50 rounded-xl p-3 border border-border/50">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">{label}</p>
                <p className="text-sm font-semibold text-foreground">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Finalidades */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm mb-4">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border/60 bg-secondary/30">
          <div className="w-8 h-8 rounded-xl bg-card flex items-center justify-center border border-border shadow-xs">
            <Calendar size={18} className="text-emerald-500" />
          </div>
          <h2 className="font-bold text-sm sm:text-base text-foreground">Finalidades del Tratamiento</h2>
        </div>
        <div className="px-5 py-4 space-y-2.5">
          {purposes.map((purpose, idx) => (
            <div key={idx} className="flex items-start gap-2.5">
              <CheckCircle2 size={15} className="text-emerald-500 shrink-0 mt-0.5" />
              <p className="text-sm text-muted-foreground leading-relaxed">{purpose}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Derechos del Titular */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm mb-4">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border/60 bg-secondary/30">
          <div className="w-8 h-8 rounded-xl bg-card flex items-center justify-center border border-border shadow-xs">
            <ShieldCheck size={18} className="text-emerald-500" />
          </div>
          <h2 className="font-bold text-sm sm:text-base text-foreground">Sus Derechos como Titular</h2>
        </div>
        <div className="px-5 py-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {rights.map(({ right, desc }) => (
              <div key={right} className="flex items-start gap-2.5 p-3 bg-secondary/40 rounded-xl border border-border/50">
                <div className="w-6 h-6 rounded-full bg-emerald-500/15 flex items-center justify-center shrink-0">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                </div>
                <div>
                  <p className="text-xs font-bold text-foreground">{right}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/25 rounded-xl flex items-start gap-2">
            <AlertTriangle size={15} className="text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-foreground/75 leading-relaxed">
              Para ejercer cualquiera de estos derechos, contáctenos a través del soporte disponible en la plataforma. 
              Respondemos en un máximo de <strong className="text-foreground">10 días hábiles</strong> conforme a la ley.
            </p>
          </div>
        </div>
      </div>

      {/* Aviso sobre WhatsApp */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm mb-6">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border/60 bg-secondary/30">
          <div className="w-8 h-8 rounded-xl bg-card flex items-center justify-center border border-border shadow-xs">
            <Phone size={18} className="text-emerald-500" />
          </div>
          <h2 className="font-bold text-sm sm:text-base text-foreground">Uso del Número de WhatsApp</h2>
        </div>
        <div className="px-5 py-4 space-y-2.5">
          <div className="flex items-start gap-2.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
            <p className="text-sm text-muted-foreground leading-relaxed">
              Su número de WhatsApp se utiliza <strong className="text-foreground">exclusivamente</strong> para el envío de tickets digitales y notificaciones de reserva.
            </p>
          </div>
          <div className="flex items-start gap-2.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
            <p className="text-sm text-muted-foreground leading-relaxed">
              No compartiremos su número con terceros ni lo utilizaremos para fines publicitarios sin su consentimiento expreso.
            </p>
          </div>
          <div className="flex items-start gap-2.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
            <p className="text-sm text-muted-foreground leading-relaxed">
              Puede solicitar la eliminación de su número de nuestros registros en cualquier momento a través del soporte.
            </p>
          </div>
        </div>
      </div>

      {/* Autorización interactiva */}
      {submitted ? (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-6 text-center space-y-3">
          <div className="w-14 h-14 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto">
            <CheckCircle2 size={28} className="text-emerald-500" />
          </div>
          <h3 className="font-black text-lg text-foreground">¡Autorización Confirmada!</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
            Ha autorizado el tratamiento de sus datos personales conforme a la Ley 1581 de 2012. 
            Puede revocar esta autorización en cualquier momento contactando nuestro soporte.
          </p>
          <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground pt-1">
            <Calendar size={12} />
            <span>Registrado el {new Date().toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
          </div>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-2xl p-5 sm:p-6 shadow-sm space-y-4">
          <h3 className="font-black text-base text-foreground flex items-center gap-2">
            <FileCheck2 size={18} className="text-emerald-500" />
            Declaración de Autorización
          </h3>
          <div className="p-4 bg-secondary/50 rounded-xl border border-border text-sm text-muted-foreground leading-relaxed">
            <em>
              &ldquo;Declaro que he leído y comprendido la presente Autorización de Tratamiento de Datos Personales 
              y, de manera libre, expresa e informada, autorizo a <strong className="text-foreground">Canchas Pasto</strong> para 
              recolectar, almacenar, usar, circular y, en general, tratar mis datos personales para las finalidades 
              descritas en este documento, conforme a la Ley 1581 de 2012 y el Decreto 1377 de 2013.&rdquo;
            </em>
          </div>

          <label className="flex items-start gap-3 cursor-pointer group">
            <div className="relative mt-0.5">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                className="sr-only"
              />
              <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                accepted
                  ? 'bg-emerald-600 border-emerald-600'
                  : 'border-border bg-background group-hover:border-emerald-500'
              }`}>
                {accepted && <CheckCircle2 size={13} className="text-white" />}
              </div>
            </div>
            <span className="text-sm text-foreground/80 leading-relaxed">
              He leído y acepto la Autorización de Tratamiento de Datos Personales descrita anteriormente, 
              incluyendo las finalidades, derechos y condiciones establecidas.
            </span>
          </label>

          <button
            type="button"
            onClick={handleAuthorize}
            disabled={!accepted}
            className={`w-full py-3.5 rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
              accepted
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-600/25 cursor-pointer'
                : 'bg-secondary text-muted-foreground cursor-not-allowed'
            }`}
          >
            <FileCheck2 size={16} />
            Autorizar Tratamiento de mis Datos
          </button>

          <p className="text-[11px] text-center text-muted-foreground">
            Esta autorización puede ser revocada en cualquier momento. Ver{' '}
            <Link href="/settings/privacidad" className="text-emerald-600 hover:underline font-semibold">
              Política de Privacidad
            </Link>
          </p>
        </div>
      )}

      {/* Footer */}
      <div className="mt-6 p-4 bg-card border border-border rounded-2xl text-center">
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} Canchas Pasto · Pasto, Nariño, Colombia
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Cumplimiento normativo: Ley 1581/2012 · Decreto 1377/2013 · SIC Colombia
        </p>
      </div>
    </div>
  );
}
