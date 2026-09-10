'use client';

import { CalendarDays, Heart, Search, Trophy, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function MobileNav() {
  const pathname = usePathname() || '/';

  const items = [
    ['Explorar', Search, '/'],
    ['Reservas', CalendarDays, '/reservations'],
    ['Favoritos', Heart, '/favorites'],
    ['Retos', Trophy, '/community'],
    ['Perfil', Users, '/profile'],
  ] as const;

  return (
    <nav className="mobile-bottom-nav">
      {items.map(([label, Icon, path]) => (
        <Link
          key={path}
          href={path}
          id={path === '/favorites' ? 'nav-favorites-mobile' : undefined}
          data-favorites-nav={path === '/favorites' ? 'mobile' : undefined}
          className={`flex flex-col items-center gap-1 min-w-[58px] text-[9px] text-muted-foreground ${
            pathname === path ? 'active text-primary' : ''
          }`}
        >
          <Icon size={22} className={pathname === path ? 'drop-shadow-md' : ''} />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}
