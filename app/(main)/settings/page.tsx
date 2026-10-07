import { Bell, CreditCard, Lock, Moon, Settings2, ScrollText, Shield, FileCheck2, ChevronRight, Info } from 'lucide-react';
import Link from 'next/link';

export default function SettingsPage() {
  const sections = [
    {
      title: 'Cuenta y Seguridad',
      icon: <Lock className="text-primary" size={20} />,
      items: [
        { name: 'Cambiar contraseña', description: 'Actualiza tu contraseña periódicamente para mayor seguridad.' },
        { name: 'Privacidad del perfil', description: 'Controla quién puede ver tu historial de partidos.' }
      ]
    },
    {
      title: 'Notificaciones',
      icon: <Bell className="text-amber-500" size={20} />,
      items: [
        { name: 'Alertas de reserva', description: 'Recibe notificaciones por email y WhatsApp.' },
        { name: 'Promociones y ofertas', description: 'Descuentos exclusivos de canchas cercanas.' },
        { name: 'Recordatorios de partidos', description: 'Te avisamos 2 horas antes de tu partido.' }
      ]
    },

    {
      title: 'Apariencia y Accesibilidad',
      icon: <Moon className="text-indigo-500" size={20} />,
      items: [
        { name: 'Modo Oscuro', description: 'Cambia el tema visual de la aplicación.' },
        { name: 'Idioma', description: 'Español (Colombia) por defecto.' }
      ]
    }
  ];

  const legalLinks = [
    {
      href: '/settings/terminos',
      icon: <ScrollText size={20} className="text-emerald-500" />,
      title: 'Términos y Condiciones',
      description: 'Reglas de uso, reservas, pagos y responsabilidades de la plataforma.',
      badge: null,
    },
    {
      href: '/settings/privacidad',
      icon: <Shield size={20} className="text-emerald-500" />,
      title: 'Política de Privacidad',
      description: 'Cómo recopilamos, usamos y protegemos tus datos personales. Ley 1581/2012.',
      badge: null,
    },
    {
      href: '/settings/tratamiento-datos',
      icon: <FileCheck2 size={20} className="text-emerald-500" />,
      title: 'Autorización de Tratamiento de Datos',
      description: 'Gestiona tu autorización de tratamiento de datos personales conforme a la ley colombiana.',
      badge: 'Requerido',
    },
  ];

  return (
    <div className="page-content max-w-4xl mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-black mb-2 flex items-center gap-2">
          <Settings2 className="text-primary" /> Configuración de la cuenta
        </h1>
        <p className="text-muted-foreground text-sm">
          Administra tus preferencias, seguridad y ajustes generales.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {sections.map((section, idx) => (
          <div key={idx} className="bg-card border border-border rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-4 pb-3 border-b border-border/50">
              <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center">
                {section.icon}
              </div>
              <h2 className="font-bold text-lg">{section.title}</h2>
            </div>
            <div className="space-y-4">
              {section.items.map((item, i) => (
                <div key={i} className="group flex items-center justify-between cursor-pointer hover:bg-secondary/50 p-2 -mx-2 rounded-lg transition-colors">
                  <div>
                    <h3 className="font-semibold text-sm group-hover:text-primary transition-colors">{item.name}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                  </div>
                  <div className="w-8 h-4 bg-secondary rounded-full relative ml-4 flex-shrink-0">
                    <div className="w-4 h-4 bg-white rounded-full border border-border shadow-sm absolute left-0" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* ── Sección Más Información / Legal ── */}
      <div className="mt-8">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center">
            <Info size={16} className="text-emerald-500" />
          </div>
          <div>
            <h2 className="font-bold text-base text-foreground">Más Información</h2>
            <p className="text-xs text-muted-foreground">Documentos legales y políticas de la plataforma</p>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm divide-y divide-border/60">
          {legalLinks.map(({ href, icon, title, description, badge }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-4 px-5 py-4 hover:bg-secondary/40 transition-colors group"
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0 group-hover:bg-emerald-500/20 transition-colors">
                {icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-sm text-foreground group-hover:text-emerald-600 transition-colors">
                    {title}
                  </h3>
                  {badge && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 border border-emerald-500/25 uppercase tracking-wider">
                      {badge}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
              </div>
              <ChevronRight size={16} className="text-muted-foreground/50 group-hover:text-emerald-500 group-hover:translate-x-0.5 transition-all shrink-0" />
            </Link>
          ))}
        </div>
      </div>


    </div>
  );
}
