'use client';

import { ArrowLeft, Lock, Eye, Database, Server, UserCheck, Mail, Trash2, ShieldCheck, Globe } from 'lucide-react';
import Link from 'next/link';

export default function PrivacidadPage() {
  const sections = [
    {
      icon: <Database size={18} className="text-emerald-500" />,
      title: '1. Información que Recopilamos',
      subsections: [
        {
          subtitle: 'Datos proporcionados directamente por el usuario:',
          items: [
            'Nombre completo y número de WhatsApp al registrarse o hacer una reserva.',
            'Correo electrónico para autenticación y comunicaciones.',
            'Comprobantes de pago cargados durante el proceso de reserva (imágenes o PDFs).',
          ],
        },
        {
          subtitle: 'Datos recopilados automáticamente:',
          items: [
            'Información de uso y navegación dentro de la plataforma (páginas visitadas, horarios de acceso).',
            'Datos del dispositivo: tipo de dispositivo, sistema operativo y versión del navegador.',
            'Dirección IP con fines de seguridad y prevención de fraude.',
          ],
        },
      ],
    },
    {
      icon: <Eye size={18} className="text-emerald-500" />,
      title: '2. Uso de la Información',
      items: [
        'Procesar y confirmar sus reservas de canchas deportivas.',
        'Enviar notificaciones y tickets digitales de reserva por WhatsApp.',
        'Mejorar la experiencia de usuario en la plataforma.',
        'Prevenir fraudes y garantizar la seguridad de la plataforma.',
        'Cumplir con obligaciones legales aplicables en Colombia.',
        'Enviar comunicaciones relevantes relacionadas con sus reservas.',
      ],
    },
    {
      icon: <UserCheck size={18} className="text-emerald-500" />,
      title: '3. Compartición de Datos',
      items: [
        'Compartimos información de reserva con los propietarios de complejos deportivos únicamente para coordinar y confirmar su turno.',
        'No vendemos, alquilamos ni comercializamos sus datos personales con terceros.',
        'Podemos compartir información con proveedores de servicios tecnológicos que nos apoyan en la operación de la plataforma, bajo acuerdos de confidencialidad.',
        'En caso de requerimiento legal por autoridad competente colombiana, podemos divulgar información conforme a la Ley 1581 de 2012.',
      ],
    },
    {
      icon: <Server size={18} className="text-emerald-500" />,
      title: '4. Almacenamiento y Seguridad',
      items: [
        'Los datos se almacenan en servidores seguros con cifrado en tránsito (HTTPS/TLS) y en reposo.',
        'Implementamos controles de acceso estrictos para garantizar que solo personal autorizado acceda a los datos.',
        'Los comprobantes de pago se almacenan en almacenamiento seguro en la nube y son accesibles únicamente por el propietario del complejo y el equipo de soporte.',
        'Conservamos sus datos mientras su cuenta esté activa o por el tiempo necesario para cumplir obligaciones legales.',
      ],
    },
    {
      icon: <ShieldCheck size={18} className="text-emerald-500" />,
      title: '5. Sus Derechos (Ley 1581 de 2012)',
      items: [
        'Conocer, actualizar y rectificar sus datos personales en cualquier momento desde su perfil.',
        'Solicitar prueba de la autorización otorgada para el tratamiento de sus datos.',
        'Ser informado sobre el uso que se le ha dado a sus datos personales.',
        'Presentar quejas ante la Superintendencia de Industria y Comercio (SIC) por infracción a la ley.',
        'Revocar la autorización y/o solicitar la supresión de sus datos cuando no se respeten los principios, derechos y garantías constitucionales y legales.',
        'Acceder de forma gratuita a sus datos personales que hayan sido objeto de tratamiento.',
      ],
    },
    {
      icon: <Globe size={18} className="text-emerald-500" />,
      title: '6. Cookies y Tecnologías Similares',
      items: [
        'Utilizamos cookies de sesión para mantener su autenticación en la plataforma.',
        'No utilizamos cookies de rastreo publicitario de terceros.',
        'Puede controlar el uso de cookies desde la configuración de su navegador, aunque esto puede afectar algunas funcionalidades de la plataforma.',
      ],
    },
    {
      icon: <Mail size={18} className="text-emerald-500" />,
      title: '7. Contacto para Asuntos de Privacidad',
      items: [
        'Para ejercer sus derechos o resolver dudas sobre el tratamiento de sus datos, contáctenos a través de los canales de soporte de la plataforma.',
        'Daremos respuesta a su solicitud en un plazo máximo de 10 días hábiles conforme a la normativa vigente.',
        'Esta Política de Privacidad puede ser actualizada periódicamente. Le notificaremos sobre cambios significativos.',
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
            <Lock size={26} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-foreground">Política de Privacidad</h1>

          </div>
        </div>

        {/* Aviso legal */}
        <div className="mt-6 p-4 bg-emerald-500/10 border border-emerald-500/25 rounded-2xl flex items-start gap-3">
          <ShieldCheck size={18} className="text-emerald-500 shrink-0 mt-0.5" />
          <p className="text-sm text-foreground/80 leading-relaxed">
            En Cancheros nos comprometemos a proteger su privacidad y a tratar sus datos personales conforme a la
            <strong className="text-foreground"> Ley Estatutaria 1581 de 2012</strong> y el
            <strong className="text-foreground"> Decreto 1377 de 2013</strong> de la República de Colombia.
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
            <div className="px-5 py-4 space-y-4">
              {'subsections' in section && section.subsections ? (
                section.subsections.map((sub, sIdx) => (
                  <div key={sIdx}>
                    <p className="text-xs font-bold text-foreground/70 uppercase tracking-wider mb-2">{sub.subtitle}</p>
                    <div className="space-y-2">
                      {sub.items.map((item, iIdx) => (
                        <div key={iIdx} className="flex items-start gap-2.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                          <p className="text-sm text-muted-foreground leading-relaxed">{item}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                'items' in section && section.items && section.items.map((item, iIdx) => (
                  <div key={iIdx} className="flex items-start gap-2.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                    <p className="text-sm text-muted-foreground leading-relaxed">{item}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Footer legal */}
      <div className="mt-8 p-4 bg-card border border-border rounded-2xl text-center space-y-1">
        <p className="text-xs text-muted-foreground font-semibold">
          Responsable del Tratamiento: Canchas Pasto
        </p>
        <p className="text-xs text-muted-foreground">
          Pasto, Nariño, Colombia · © {new Date().getFullYear()}
        </p>
        <p className="text-xs text-muted-foreground">
          Cumplimiento normativo: Ley 1581/2012 · Decreto 1377/2013
        </p>
      </div>
    </div>
  );
}
