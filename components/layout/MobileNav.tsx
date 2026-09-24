'use client';

import { CalendarDays, Heart, Search, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

export function MobileNav() {
  const pathname = usePathname() || '/';
  const router = useRouter();

  const items = [
    ['Explorar', Search, '/'],
    ['Reservas', CalendarDays, '/reservations'],
    ['Favoritos', Heart, '/favorites'],
    ['Perfil', Users, '/profile'],
  ] as const;

  const handleExplorarClick = (e: React.MouseEvent) => {
    // Independiente de dónde esté el usuario, siempre ir a la página principal y al inicio
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
      {items.map(([label, Icon, path]) => {
        const isExplorar = path === '/';
        const isActive = path === '/' ? pathname === '/' : pathname.startsWith(path);
        return (
          <Link
            key={path}
            href={path}
            onClick={isExplorar ? handleExplorarClick : undefined}
            id={path === '/favorites' ? 'nav-favorites-mobile' : undefined}
            data-favorites-nav={path === '/favorites' ? 'mobile' : undefined}
            className={`flex flex-col items-center gap-1 min-w-[58px] text-[9px] text-muted-foreground ${isActive ? 'active text-primary' : ''
              }`}
          >
            <Icon size={22} className={isActive ? 'drop-shadow-md' : ''} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}