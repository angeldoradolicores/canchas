'use client';

import {
  CalendarDays,
  CircleHelp,
  Heart,
  LayoutDashboard,
  MoreHorizontal,
  Search,
  Settings,
  ShieldCheck,
  Smartphone,
  Trophy,
  Users,
} from 'lucide-react';
import { Logo } from './Logo';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

export function Sidebar() {
  const pathname = usePathname() || '/';
  const { user, profile } = useAuth();

  const items = [
    ['Explorar Canchas', Search, '/'],
    ['Mis reservas', CalendarDays, '/reservations'],
    ['Favoritos', Heart, '/favorites'],
    ['Retos y Jugadores', Trophy, '/community'],
    ['Campeonatos', ShieldCheck, '/tournaments'],
    ['Escuelas de fútbol', ShieldCheck, '/schools'],
    ['Mi perfil', Users, '/profile'],
  ] as const;

  return (
    <aside className="sidebar hidden lg:flex">
      <Link href="/">
        <Logo />
      </Link>
      
      <div className="mt-12 flex flex-1 flex-col gap-2 sidebar-links">
        <p className="eyebrow px-3">Menú principal</p>
        {items.map(([label, Icon, path]) => (
          <Link
            key={path}
            href={path}
            className={`nav-item ${pathname === path ? 'active' : ''}`}
          >
            <Icon size={19} />
            <span>{label}</span>
          </Link>
        ))}
        
        {profile?.role === 'owner' && (
          <>
            <div className="my-7 h-px bg-border" />
            <p className="eyebrow px-3">Mi negocio</p>
            <Link
              href="/dashboard"
              className={`nav-item ${pathname === '/dashboard' ? 'active' : ''}`}
            >
              <LayoutDashboard size={19} />
              <span>Panel de control</span>
            </Link>

            <Link
              href="/dashboard/bookings"
              className={`nav-item ${pathname === '/dashboard/bookings' ? 'active' : ''}`}
            >
              <CalendarDays size={19} />
              <span>Gestión de reservas</span>
            </Link>

            <Link
              href="/dashboard/whatsapp"
              className={`nav-item ${pathname === '/dashboard/whatsapp' ? 'active' : ''}`}
            >
              <Smartphone size={19} />
              <span>Conectar WhatsApp</span>
            </Link>
          </>
        )}
        
        {profile?.role === 'superadmin' && (
          <>
            <div className="my-7 h-px bg-border" />
            <p className="eyebrow px-3">Administración</p>
            <Link
              href="/admin"
              className={`nav-item ${pathname.startsWith('/admin') ? 'active' : ''}`}
            >
              <ShieldCheck size={19} />
              <span>Super Admin</span>
            </Link>
          </>
        )}
      </div>
      
      <div className="flex flex-col gap-2">
        <button className="nav-item">
          <CircleHelp size={19} />
          <span>Ayuda</span>
        </button>
        <Link href="/profile" className={`nav-item ${pathname === '/profile' ? 'active' : ''}`}>
          <Settings size={19} />
          <span>Configuración</span>
        </Link>
        
        {user ? (
          <div className="profile">
            <div className="avatar">
              {profile?.full_name ? profile.full_name.substring(0, 2).toUpperCase() : 'US'}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{profile?.full_name || 'Usuario'}</p>
              <p className="truncate text-xs text-muted-foreground capitalize">{profile?.role}</p>
            </div>
            <MoreHorizontal className="ml-auto text-muted-foreground" size={17} />
          </div>
        ) : (
          <div className="profile">
            <Link href="/login" className="btn-primary btn-sm w-full">Ingresar</Link>
          </div>
        )}
      </div>
    </aside>
  );
}
