'use client';

import { useState } from 'react';
import { X, LayoutDashboard, CalendarDays, Map, ShieldCheck, LogOut, Smartphone } from 'lucide-react';
import { Logo } from '@/components/layout/Logo';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <OwnerLayoutInner>{children}</OwnerLayoutInner>
    </AuthProvider>
  );
}

function OwnerLayoutInner({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { profile, signOut } = useAuth();
  const pathname = usePathname();

  const items = [
    ['Resumen', LayoutDashboard, '/dashboard'],
    ['Mis Canchas', Map, '/dashboard/pitches'],
    ['Reservas', CalendarDays, '/dashboard/bookings'],
    ['Conectar WhatsApp', Smartphone, '/dashboard/whatsapp'],
    ['Escuelas y Torneos', ShieldCheck, '/dashboard/academy'],
  ] as const;

  const handleLogout = async () => {
    await signOut();
  };

  return (
    <div className="app-shell bg-[#f5f7f5]">
      {/* Drawer móvil B2B */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-[998] bg-black/50 backdrop-blur-sm lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
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
            <div className="flex flex-1 flex-col gap-2">
              <p className="eyebrow px-3">Gestión de Complejo</p>
              {items.map(([label, Icon, path]) => {
                const isActive = pathname === path || (path !== '/dashboard' && pathname.startsWith(path));
                return (
                  <Link
                    key={path}
                    href={path}
                    onClick={() => setMobileOpen(false)}
                    className={`nav-item ${isActive ? 'active' : ''}`}
                  >
                    <Icon size={19} />
                    <span>{label}</span>
                  </Link>
                );
              })}
            </div>
            <div className="flex flex-col gap-2 border-t border-border pt-4 mt-6">
              <div className="px-3 mb-2">
                <p className="truncate text-sm font-semibold">{profile?.full_name || 'Dueño'}</p>
                <p className="truncate text-xs text-muted-foreground">Administrador de Complejo</p>
              </div>
              <button onClick={handleLogout} className="nav-item text-red-600 hover:bg-red-50 hover:text-red-700">
                <LogOut size={19} />
                <span>Cerrar sesión</span>
              </button>
            </div>
          </div>
        </>
      )}

      {/* Sidebar B2B Desktop */}
      <aside className="sidebar hidden lg:flex" style={{ borderRight: '1px solid var(--border)', boxShadow: 'none' }}>
        <Link href="/">
          <Logo />
        </Link>
        <div className="mt-8 mb-4">
          <span className="role-badge role-owner">Panel de Administración</span>
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <p className="eyebrow px-3">Gestión de Complejo</p>
          {items.map(([label, Icon, path]) => {
            const isActive = pathname === path || (path !== '/dashboard' && pathname.startsWith(path));
            return (
              <Link
                key={path}
                href={path}
                className={`nav-item ${isActive ? 'active' : ''}`}
              >
                <Icon size={19} />
                <span>{label}</span>
              </Link>
            );
          })}
        </div>
        
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <div className="px-3 mb-2">
            <p className="truncate text-sm font-semibold">{profile?.full_name || 'Dueño'}</p>
            <p className="truncate text-xs text-muted-foreground">Administrador de Complejo</p>
          </div>
          <button onClick={handleLogout} className="nav-item text-red-600 hover:bg-red-50 hover:text-red-700">
            <LogOut size={19} />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar bg-white border-b border-border h-[72px]">
          <div className="flex items-center gap-4">
            <button onClick={() => setMobileOpen(true)} className="icon-button lg:hidden">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
            </button>
            <h1 className="text-lg font-bold">Panel del Dueño</h1>
          </div>
          <div className="flex items-center gap-4">
             <Link href="/" className="text-sm text-primary font-semibold hover:underline">
               Ver vista de jugador
             </Link>
          </div>
        </header>
        
        <div className="p-6 max-w-7xl mx-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
