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
                <div className="fixed inset-y-0 left-0 z-[999] w-72 bg-card shadow-2xl flex flex-col p-6 lg:hidden overflow-y-auto">
                  <div className="flex items-center justify-between mb-8">
                    <Logo />
                    <button
                      onClick={() => setMobileOpen(false)}
                      className="flex items-center justify-center w-9 h-9 rounded-full bg-secondary hover:bg-border transition-colors"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  <MobileNavLinks onClose={() => setMobileOpen(false)} />
                </div>
              </>
            )}

            <div className="main-area">
              <Header
                onMenu={() => setMobileOpen(true)}
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
    <nav className="flex flex-col gap-1">
      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-3 mb-2">Menú principal</p>
      {items.map(({ label, Icon, path }) => (
        <Link
          key={path}
          href={path}
          onClick={onClose}
          className={`flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-semibold transition-all ${
            pathname === path
              ? 'bg-primary/10 text-primary font-bold'
              : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
          }`}
        >
          <Icon size={19} />
          {label}
        </Link>
      ))}

      {profile?.role === 'owner' && (
        <>
          <div className="my-4 h-px bg-border" />
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-3 mb-2">Mi negocio</p>
          <Link
            href="/dashboard"
            onClick={onClose}
            className={`flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-semibold transition-all ${
              pathname === '/dashboard' ? 'bg-primary/10 text-primary font-bold' : 'text-muted-foreground hover:bg-secondary'
            }`}
          >
            <LayoutDashboard size={19} />
            Panel de control
          </Link>
          <Link
            href="/dashboard/bookings"
            onClick={onClose}
            className={`flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-semibold transition-all ${
              pathname === '/dashboard/bookings' ? 'bg-primary/10 text-primary font-bold' : 'text-muted-foreground hover:bg-secondary'
            }`}
          >
            <CalendarDays size={19} />
            Gestión de reservas
          </Link>
          <Link
            href="/dashboard/whatsapp"
            onClick={onClose}
            className={`flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-semibold transition-all ${
              pathname === '/dashboard/whatsapp' ? 'bg-primary/10 text-primary font-bold' : 'text-muted-foreground hover:bg-secondary'
            }`}
          >
            <Smartphone size={19} />
            Conectar WhatsApp
          </Link>
        </>
      )}
    </nav>
  );
}

