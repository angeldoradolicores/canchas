'use client';

import { useState, useEffect } from 'react';
import { X, LayoutDashboard, CalendarDays, Map, ShieldCheck, LogOut, Smartphone, Loader2, ShieldAlert, ImagePlay } from 'lucide-react';
import { Logo } from '@/components/layout/Logo';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <OwnerAuthGuard>
        <OwnerLayoutInner>{children}</OwnerLayoutInner>
      </OwnerAuthGuard>
    </AuthProvider>
  );
}

function OwnerAuthGuard({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading) {
      if (!user) {
        // Redirigir de inmediato al login si no tiene credenciales
        const nextUrl = pathname ? `?next=${encodeURIComponent(pathname)}` : '';
        router.replace(`/login${nextUrl}`);
      } else if (
        profile &&
        profile.role !== 'owner' &&
        (profile.role as string) !== 'admin' &&
        profile.role !== 'superadmin' &&
        user.user_metadata?.role !== 'owner'
      ) {
        // Si es jugador, denegar acceso al panel de dueño y enviar a inicio
        router.replace('/');
      }
    }
  }, [user, profile, loading, router, pathname]);

  // Pantalla de carga mientras se verifican credenciales
  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f7f5] dark:bg-background flex flex-col items-center justify-center gap-4">
        <Logo />
        <div className="flex items-center gap-2.5 text-xs sm:text-sm font-semibold text-muted-foreground bg-card/80 px-5 py-3 rounded-2xl border border-border shadow-xs">
          <Loader2 className="animate-spin text-primary" size={18} />
          <span>Verificando credenciales de acceso...</span>
        </div>
      </div>
    );
  }

  // Si no está autenticado, no mostrar NADA del panel de dueño mientras se ejecuta la redirección
  if (!user) {
    return (
      <div className="min-h-screen bg-[#f5f7f5] dark:bg-background flex flex-col items-center justify-center gap-4">
        <Logo />
        <div className="flex items-center gap-2.5 text-xs sm:text-sm font-semibold text-muted-foreground bg-card/80 px-5 py-3 rounded-2xl border border-border shadow-xs">
          <Loader2 className="animate-spin text-primary" size={18} />
          <span>Acceso privado. Redirigiendo a inicio de sesión...</span>
        </div>
      </div>
    );
  }

  // Si el usuario existe pero no tiene permisos de dueño/admin
  if (
    profile &&
    profile.role !== 'owner' &&
    (profile.role as string) !== 'admin' &&
    profile.role !== 'superadmin' &&
    user.user_metadata?.role !== 'owner'
  ) {
    return (
      <div className="min-h-screen bg-[#f5f7f5] dark:bg-background flex flex-col items-center justify-center p-4">
        <div className="bg-card p-6 sm:p-8 rounded-3xl border border-border shadow-xl max-w-sm w-full text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-red-500/10 text-red-500 flex items-center justify-center mx-auto">
            <ShieldAlert size={26} />
          </div>
          <h2 className="text-base font-extrabold text-foreground">Acceso Denegado</h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Esta sección es exclusiva para dueños y administradores de complejos deportivos.
          </p>
          <button
            onClick={() => router.replace('/')}
            className="w-full py-2.5 bg-primary hover:bg-primary/90 text-white rounded-xl text-xs font-bold transition-all"
          >
            Volver a Canchas Pasto
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
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
    ['Crear Publicación', ImagePlay, '/dashboard/status'],
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
                <p className="truncate text-sm font-semibold">
                  {(profile?.full_name || 'Dueño').toLowerCase().replace(/(^\w{1})|(\s+\w{1})/g, letter => letter.toUpperCase())}
                </p>                <p className="truncate text-xs text-muted-foreground capitalize">Administrador de Complejo</p>
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
