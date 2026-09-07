import { Bell, CreditCard, Lock, Moon, Shield, Settings2, Globe } from 'lucide-react';
import Link from 'next/link';

export default function SettingsPage() {
  const sections = [
    {
      title: 'Cuenta y Seguridad',
      icon: <Lock className="text-primary" size={20} />,
      items: [
        { name: 'Cambiar contraseña', description: 'Actualiza tu contraseña periódicamente para mayor seguridad.' },
        { name: 'Autenticación de dos pasos', description: 'Añade una capa extra de seguridad a tu cuenta.' },
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
      title: 'Métodos de Pago',
      icon: <CreditCard className="text-emerald-500" size={20} />,
      items: [
        { name: 'Tarjetas guardadas', description: 'Gestiona tus tarjetas de crédito o débito.' },
        { name: 'Cuentas bancarias', description: 'Configura tus cuentas para transferencias rápidas.' }
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

      <div className="mt-8 text-center">
        <button className="text-red-500 text-sm font-semibold hover:underline">
          Eliminar cuenta
        </button>
      </div>
    </div>
  );
}
