'use client';

import { useState } from 'react';
import { X, Search, CalendarDays, Trophy, Users, LayoutDashboard, ShieldCheck, Smartphone, Heart } from 'lucide-react';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { MobileNav } from '@/components/layout/MobileNav';
import { Logo } from '@/components/layout/Logo';
import { AuthModal } from '@/components/auth/AuthModal';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { FavoritesProvider } from '@/lib/favorites-context';
import { ActiveBookingProvider } from '@/lib/active-booking-context';
import { FloatingBookingTimer } from '@/components/booking/FloatingBookingTimer';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showAuth, setShowAuth] = useState(false);

  return (
    <AuthProvider>
      <FavoritesProvider>
        <ActiveBookingProvider>
          <div className="app-shell">
            <Sidebar />

            {/* ── Menú móvil overlay ── */}
            {mobileOpen && (
              <>
                {/* Fondo semitransparente */}
                <div
                  className="fixed inset-0 z-[998] bg-black/50 backdrop-blur-sm lg:hidden"
                  onClick={() => setMobileOpen(false)}
                />
                {/* Panel lateral deslizante */}
                <div className="fixed inset-y-0 left-0 z-[999] w-[280px] bg-card shadow-2xl flex flex-col lg:hidden overflow-hidden">
                  {/* Header con gradiente verde */}
                  <div className="relative bg-gradient-to-br from-[#054D27] via-[#007A3D] to-[#0a6634] px-5 pt-10 pb-6 shrink-0">
                    {/* Círculos decorativos de fondo */}
                    <div className="absolute -top-6 -right-6 w-28 h-28 rounded-full bg-white/5" />
                    <div className="absolute -bottom-4 -left-4 w-20 h-20 rounded-full bg-white/5" />
                    <div className="relative flex items-center justify-between">
                      <Logo />
                      <button
                        onClick={() => setMobileOpen(false)}
                        className="flex items-center justify-center w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 transition-colors text-white"
                      >
                        <X size={17} />
                      </button>
                    </div>
                    <p className="relative text-white/60 text-xs mt-3 font-medium">Tu plataforma de canchas sintéticas</p>
                  </div>

                  {/* Nav links con scroll */}
                  <div className="flex-1 overflow-y-auto px-3 py-4">
                    <MobileNavLinks onClose={() => setMobileOpen(false)} />
                  </div>
                </div>
              </>
            )}

            <div className="main-area">
              <Header
                onMenu={() => setMobileOpen(prev => !prev)}
                title=""
                onLoginClick={() => setShowAuth(true)}
              />
              
              {children}
            </div>

            <MobileNav />

            {/* Cronómetro flotante persistente en toda la navegación */}
            <FloatingBookingTimer />

            {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
          </div>
        </ActiveBookingProvider>
      </FavoritesProvider>
    </AuthProvider>
  );
}

function MobileNavLinks({ onClose }: { onClose: () => void }) {
  const pathname = usePathname() || '/';
  const { profile } = useAuth();

  const items = [
    { label: 'Explorar Canchas', Icon: Search, path: '/' },
    { label: 'Mis reservas', Icon: CalendarDays, path: '/reservations' },
    { label: 'Favoritos', Icon: Heart, path: '/favorites' },
    { label: 'Retos y Jugadores', Icon: Trophy, path: '/community' },
    { label: 'Campeonatos', Icon: ShieldCheck, path: '/tournaments' },
    { label: 'Escuelas de fútbol', Icon: ShieldCheck, path: '/schools' },
    { label: 'Mi perfil', Icon: Users, path: '/profile' },
  ];

  return (
    <nav className="flex flex-col gap-0.5">
      <p className="text-[9px] font-black text-muted-foreground/70 uppercase tracking-[0.15em] px-3 mb-2">Menú principal</p>
      {items.map(({ label, Icon, path }) => {
        const isActive = pathname === path;
        return (
          <Link
            key={path}
            href={path}
            onClick={onClose}
            className={`group flex items-center gap-3 px-3 py-2.5 rounded-2xl text-[13.5px] font-semibold transition-all duration-200 ${
              isActive
                ? 'bg-primary/12 text-primary font-bold shadow-sm'
                : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
            }`}
          >
            <span className={`flex items-center justify-center w-8 h-8 rounded-xl transition-all duration-200 shrink-0 ${
              isActive
                ? 'bg-primary text-white shadow-sm'
                : 'bg-secondary/80 text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary'
            }`}>
              <Icon size={16} />
            </span>
            {label}
            {isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />}
          </Link>
        );
      })}

      {profile?.role === 'owner' && (
        <>
          <div className="my-3 mx-3 h-px bg-border" />
          <p className="text-[9px] font-black text-muted-foreground/70 uppercase tracking-[0.15em] px-3 mb-2">Mi negocio</p>
          {[
            { href: '/dashboard', Icon: LayoutDashboard, label: 'Panel de control' },
            { href: '/dashboard/bookings', Icon: CalendarDays, label: 'Gestión de reservas' },
            { href: '/dashboard/whatsapp', Icon: Smartphone, label: 'Conectar WhatsApp' },
          ].map(({ href, Icon, label }) => {
            const isActive = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                onClick={onClose}
                className={`group flex items-center gap-3 px-3 py-2.5 rounded-2xl text-[13.5px] font-semibold transition-all duration-200 ${
                  isActive
                    ? 'bg-primary/12 text-primary font-bold'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                }`}
              >
                <span className={`flex items-center justify-center w-8 h-8 rounded-xl transition-all duration-200 shrink-0 ${
                  isActive
                    ? 'bg-primary text-white shadow-sm'
                    : 'bg-secondary/80 text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary'
                }`}>
                  <Icon size={16} />
                </span>
                {label}
                {isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />}
              </Link>
            );
          })}
        </>
      )}
    </nav>
  );
}

