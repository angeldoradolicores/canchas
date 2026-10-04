'use client';

import { ArrowLeft, ScrollText, CheckCircle2, AlertTriangle, Clock, MapPin, CreditCard, Shield, Users, Phone } from 'lucide-react';
import Link from 'next/link';

export default function TerminosPage() {
  const sections = [
    {
      icon: <Users size={18} className="text-emerald-500" />,
      title: '1. Aceptación de los Términos',
      content: [
        'Al acceder y utilizar la plataforma Canchas Pasto, usted acepta cumplir y estar sujeto a los presentes Términos y Condiciones de Uso.',
        'Si no está de acuerdo con alguna parte de estos términos, le pedimos que no utilice nuestros servicios.',
        'Nos reservamos el derecho de actualizar estos términos en cualquier momento. Los cambios entrarán en vigor una vez publicados en la plataforma.',
      ],
    },
    {
      icon: <MapPin size={18} className="text-emerald-500" />,
      title: '2. Descripción del Servicio',
      content: [
        'Canchas Pasto es una plataforma digital que facilita la reserva de canchas de fútbol y espacios deportivos en Pasto, Colombia.',
        'Actuamos como intermediarios entre los usuarios y los propietarios de los complejos deportivos. La plataforma no es propietaria de ninguna cancha.',
        'La disponibilidad de los espacios está sujeta a la agenda de cada complejo deportivo registrado en nuestra plataforma.',
      ],
    },
    {
      icon: <Clock size={18} className="text-emerald-500" />,
      title: '3. Reservas y Cancelaciones',
      content: [
        'Una reserva se considera confirmada únicamente cuando el propietario del complejo aprueba el comprobante de pago cargado por el usuario.',
        'El usuario tiene hasta 30 minutos desde el inicio del proceso de reserva para completar el pago y cargar el comprobante.',
        'Las cancelaciones deben notificarse con al menos 24 horas de anticipación. Las cancelaciones tardías pueden estar sujetas a penalizaciones según las políticas de cada complejo.',
        'Los reembolsos por cancelaciones aceptadas serán procesados de acuerdo con las políticas del complejo deportivo correspondiente.',
      ],
    },
    {
      icon: <CreditCard size={18} className="text-emerald-500" />,
      title: '4. Pagos y Abonos',
      content: [
        'Los pagos se realizan directamente al complejo deportivo mediante transferencias a las cuentas autorizadas (Nequi, Daviplata, Bancolombia u otras indicadas).',
        'Canchas Pasto no procesa ni almacena información de tarjetas de crédito o datos bancarios de los usuarios.',
        'El abono requerido corresponde al porcentaje o monto fijo establecido por cada propietario de cancha. El saldo restante se cancela en el lugar el día del partido.',
        'Es responsabilidad del usuario conservar el comprobante de pago y verificar que los datos (valor y fecha) sean legibles antes de cargarlo.',
      ],
    },
    {
      icon: <Shield size={18} className="text-emerald-500" />,
      title: '5. Responsabilidades del Usuario',
      content: [
        'El usuario se compromete a proporcionar información veraz, completa y actualizada al momento de registrarse y al realizar una reserva.',
        'Queda prohibido el uso de la plataforma para fines ilegales, fraudulentos o que perjudiquen a terceros.',
        'El usuario es responsable de mantener la confidencialidad de sus credenciales de acceso.',
        'Cualquier uso no autorizado de la cuenta debe reportarse de inmediato a nuestro equipo de soporte.',
      ],
    },
    {
      icon: <AlertTriangle size={18} className="text-amber-500" />,
      title: '6. Limitación de Responsabilidad',
      content: [
        'Canchas Pasto no se hace responsable por daños, lesiones o pérdidas ocurridas durante la práctica deportiva en los complejos registrados.',
        'No garantizamos la disponibilidad ininterrumpida de la plataforma y no somos responsables por interrupciones técnicas.',
        'No somos responsables por discrepancias entre la información publicada por los complejos y las condiciones reales de las instalaciones.',
      ],
    },
    {
      icon: <Phone size={18} className="text-emerald-500" />,
      title: '7. Contacto',
      content: [
        'Para consultas, reclamos o sugerencias relacionadas con estos Términos y Condiciones, puede contactarnos a través de los canales de soporte disponibles en la plataforma.',
        'Nuestro equipo dará respuesta en un plazo máximo de 3 días hábiles.',
      ],
    },
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
            <ScrollText size={26} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-foreground">Términos y Condiciones</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Última actualización: Octubre 2025 · Versión 1.0
            </p>
          </div>
        </div>

        {/* Aviso introductorio */}
        <div className="mt-6 p-4 bg-emerald-500/10 border border-emerald-500/25 rounded-2xl flex items-start gap-3">
          <CheckCircle2 size={18} className="text-emerald-500 shrink-0 mt-0.5" />
          <p className="text-sm text-foreground/80 leading-relaxed">
            Lea detenidamente estos términos antes de utilizar la plataforma. Al crear una cuenta o realizar una reserva,
            confirma que ha leído y acepta los presentes términos y condiciones en su totalidad.
          </p>
        </div>
      </div>

      {/* Secciones */}
      <div className="space-y-4">
        {sections.map((section, idx) => (
          <div key={idx} className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-border/60 bg-secondary/30">
              <div className="w-8 h-8 rounded-xl bg-card flex items-center justify-center border border-border shadow-xs">
                {section.icon}
              </div>
              <h2 className="font-bold text-sm sm:text-base text-foreground">{section.title}</h2>
            </div>
            <div className="px-5 py-4 space-y-3">
              {section.content.map((paragraph, pIdx) => (
                <div key={pIdx} className="flex items-start gap-2.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                  <p className="text-sm text-muted-foreground leading-relaxed">{paragraph}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Footer legal */}
      <div className="mt-8 p-4 bg-card border border-border rounded-2xl text-center">
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} Canchas Pasto · Pasto, Nariño, Colombia
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Todos los derechos reservados. Uso exclusivo en el territorio colombiano.
        </p>
      </div>
    </div>
  );
}
