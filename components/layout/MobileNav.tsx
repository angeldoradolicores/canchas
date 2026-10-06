'use client';

import { CalendarDays, Heart, Search, User } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useReservationsNotifications } from '@/lib/reservations-notification-context';

export function MobileNav() {
  const pathname = usePathname() || '/';
  const router = useRouter();
  const { hasReservationUpdates } = useReservationsNotifications();

  const items = [
    { label: 'Explorar', Icon: Search, path: '/' as const },
    { label: 'Reservas', Icon: CalendarDays, path: '/reservations' as const, isReservas: true },
    { label: 'Favoritos', Icon: Heart, path: '/favorites' as const },
    { label: 'Perfil', Icon: User, path: '/profile' as const },
  ];

  const handleExplorarClick = () => {
    window.dispatchEvent(new CustomEvent('reset-explore-view'));
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
    if (pathname !== '/') {
      router.push('/');
    }
  };

  return (
    <nav className="mobile-bottom-nav">
      {items.map(({ label, Icon, path, isReservas }) => {
        const isExplorar = path === '/';
        const isActive = path === '/' ? pathname === '/' : pathname.startsWith(path);
        const showBadge = isReservas && hasReservationUpdates && !isActive;
        return (
          <Link
            key={path}
            href={path}
            onClick={isExplorar ? handleExplorarClick : undefined}
            id={path === '/favorites' ? 'nav-favorites-mobile' : undefined}
            data-favorites-nav={path === '/favorites' ? 'mobile' : undefined}
            className={`flex flex-col items-center gap-1 min-w-[58px] text-[9px] text-muted-foreground ${isActive ? 'active text-primary' : ''}`}
          >
            <span className="relative">
              <Icon size={22} className={isActive ? 'drop-shadow-md' : ''} />
              {showBadge && (
                <span className="absolute -top-0.5 -right-1.5 flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 ring-1 ring-background shadow-sm" />
                </span>
              )}
            </span>
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}