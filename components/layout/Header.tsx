'use client';

import { ChevronDown, LogOut, MapPin, Menu, Bell, Settings, User, Check, Trash2, LayoutDashboard, Navigation } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

interface HeaderProps {
  onMenu: () => void;
  title: string;
  onLoginClick: () => void;
}


export function Header({ onMenu, title, onLoginClick }: HeaderProps) {
  const { user, profile, signOut } = useAuth();
  const [showDropdown, setShowDropdown] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [bellShaking, setBellShaking] = useState(false);
  const supabase = createClient();
  const isAnyMenuOpen = showNotifications || showDropdown;

  const fetchNotifications = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(15);

    setNotifications(data || []);
  };

  useEffect(() => {
    if (!user) return;
    fetchNotifications();

    // 1. Escuchar notificaciones dirigidas al usuario en TIEMPO REAL
    const notifChannel = supabase
      .channel(`realtime:notifications:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          fetchNotifications();
          if (payload.eventType === 'INSERT') {
            setBellShaking(true);
            setTimeout(() => setBellShaking(false), 1200);
          }
        }
      )
      .subscribe();

    // 2. Escuchar cambios de estado en reservas del usuario en TIEMPO REAL
    const bookingsChannel = supabase
      .channel(`realtime:bookings:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'bookings',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchNotifications();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(notifChannel);
      supabase.removeChannel(bookingsChannel);
    };
  }, [user, supabase]);

  const markAsRead = async (id: string) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  };

  const markAllAsRead = async () => {
    if (!user) return;
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  const deleteNotification = async (id: string) => {
    await supabase.from('notifications').delete().eq('id', id);
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : user?.email?.[0]?.toUpperCase() ?? '?';

  // ── Selector de ciudad ──
  const CITIES = ['Pasto'];
  const [selectedCity, setSelectedCity] = useState('Pasto');
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const [locating, setLocating] = useState(false);

  const handleCitySelect = (city: string) => {
    setSelectedCity(city);
    setShowCityDropdown(false);
    window.dispatchEvent(new CustomEvent('cityChange', { detail: city }));
  };

  const handleGPS = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      () => {
        setLocating(false);
        handleCitySelect('Pasto');
      },
      () => setLocating(false)
    );
  };



  return (
    <header
      className={`topbar relative flex items-center justify-between px-4 py-3 bg-background border-b border-border transition-all ${
        isAnyMenuOpen ? 'z-[9999]' : 'z-10'
      }`}
    >
      <div className="flex items-center gap-3">
        <button
          onClick={onMenu}
          className="icon-button lg:hidden p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          aria-label="Abrir/Cerrar menú"
        >
          <Menu size={22} />
        </button>
      </div>

      {/* ── Centro: Selector de ubicación perfectamente centrado ── */}
      <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center justify-center text-center pointer-events-auto">
        <p className="eyebrow text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Mi ubicación</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <button
            className="location flex items-center gap-1 font-semibold text-sm hover:text-primary transition-colors"
            onClick={() => { setShowCityDropdown(v => !v); setShowDropdown(false); setShowNotifications(false); }}
          >
            <MapPin size={15} className="text-primary" /> {selectedCity}, Nariño
            <ChevronDown size={14} className={`transition-transform duration-200 ${showCityDropdown ? 'rotate-180' : ''}`} />
          </button>

          {/* Botón GPS */}
          <button
            onClick={handleGPS}
            disabled={locating}
            title="Usar mi ubicación GPS"
            className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 hover:bg-primary/20 text-primary transition-all text-xs font-bold border border-primary/20 active:scale-95"
          >
            {locating ? (
              <span className="animate-spin text-xs">⏳</span>
            ) : (
              <Navigation size={12} className="fill-primary" />
            )}
          </button>
        </div>

        {/* Dropdown ciudades centrado */}
        {showCityDropdown && (
          <div className="absolute top-full mt-2 w-48 bg-card border border-border rounded-2xl shadow-2xl z-[9999] overflow-hidden text-left">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-3 pt-3 pb-1">Selecciona ciudad</p>
            {CITIES.map(city => (
              <button
                key={city}
                onClick={() => {
                  handleCitySelect(city);
                  setShowCityDropdown(false);
                }}
                className={`w-full text-left px-4 py-2.5 text-sm font-semibold hover:bg-primary/10 transition-colors flex items-center gap-2 ${selectedCity === city ? 'text-primary bg-primary/10' : 'text-foreground'
                  }`}
              >
                <MapPin size={14} className={selectedCity === city ? 'text-primary' : 'text-muted-foreground'} />
                {city}
                {selectedCity === city && <Check size={14} className="ml-auto text-primary" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Derecha: Acciones, Notificaciones y Perfil ── */}
      <div className="header-actions flex items-center gap-2 ml-auto">
        {user && profile?.role === 'owner' && (
          <Link
            href="/dashboard"
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-white font-bold text-xs shadow-sm hover:bg-primary/90 transition-all"
          >
            <LayoutDashboard size={15} /> Panel de Dueño
          </Link>
        )}

        {user && (
          <div className="relative">
            <button
              onClick={() => {
                setShowNotifications(!showNotifications);
                setShowDropdown(false);
                setShowCityDropdown(false);
              }}
              className={`icon-button relative transition-transform active:scale-95 ${bellShaking ? 'animate-bounce' : ''}`}
              aria-label="Notificaciones"
            >
              <Bell size={20} className={unreadCount > 0 ? 'text-primary' : 'text-foreground'} />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-red-600 text-white text-[10px] font-black rounded-full flex items-center justify-center shadow-lg ring-2 ring-background animate-pulse">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {/* Dropdown Notificaciones al frente */}
            {showNotifications && (
              <div className="absolute right-0 top-full mt-2 w-80 sm:w-88 bg-card border border-border rounded-2xl shadow-2xl p-3 z-[9999] opacity-100">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-border">
                  <strong className="text-sm font-bold text-foreground">Notificaciones</strong>
                  <div className="flex items-center gap-2">
                    {unreadCount > 0 && (
                      <>
                        <span className="text-[10px] font-bold px-2 py-0.5 bg-red-500/15 text-red-600 dark:text-red-400 rounded-full">
                          {unreadCount} {unreadCount === 1 ? 'nueva' : 'nuevas'}
                        </span>
                        <button
                          type="button"
                          onClick={markAllAsRead}
                          className="text-[11px] text-primary hover:underline font-bold transition-all"
                        >
                          Marcar leídas
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {notifications.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-6">No tienes notificaciones por ahora.</p>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                    {notifications.map((n) => (
                      <div
                        key={n.id}
                        onClick={() => {
                          if (!n.is_read) markAsRead(n.id);
                          setShowNotifications(false);
                          if (n.type === 'booking_status') {
                            window.location.href = '/reservations';
                          } else if (['challenge_join', 'player_offer', 'team_join'].includes(n.type)) {
                            window.location.href = '/community';
                          }
                        }}
                        className={`p-2.5 rounded-xl border text-xs transition-all flex items-start justify-between gap-2 cursor-pointer hover:border-primary/40 ${n.is_read ? 'bg-card border-border/40 opacity-75' : 'bg-primary/10 border-primary/30 font-medium shadow-xs'
                          }`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-foreground truncate">{n.title}</p>
                          <p className="text-muted-foreground mt-0.5 leading-tight">{n.message}</p>
                          <span className="text-[10px] text-muted-foreground/70 mt-1 block">
                            {new Date(n.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                          {!n.is_read && (
                            <button
                              onClick={() => markAsRead(n.id)}
                              className="p-1 text-primary hover:bg-primary/10 rounded"
                              title="Marcar leída"
                            >
                              <Check size={13} />
                            </button>
                          )}
                          <button
                            onClick={() => deleteNotification(n.id)}
                            className="p-1 text-muted-foreground hover:text-red-600 rounded"
                            title="Eliminar"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {user ? (
          <div className="relative">
            <button
              className="header-avatar"
              onClick={() => {
                setShowDropdown(!showDropdown);
                setShowNotifications(false);
                setShowCityDropdown(false);
              }}
              aria-label="Perfil"
            >
              {initials}
            </button>

            {/* Dropdown Perfil */}
            {showDropdown && (
              <div className="absolute right-0 top-full mt-2 w-56 bg-card border border-border rounded-2xl shadow-2xl p-2 z-[9999]">
                <div className="p-2 border-b border-border mb-1">
                  <strong className="block text-sm truncate capitalize">{profile?.full_name ?? 'Usuario'}</strong>
                  <span className="text-xs text-muted-foreground truncate block">{user.email}</span>
                  <span className={`inline-block mt-1.5 px-2 py-0.5 text-[10px] font-bold rounded-full ${profile?.role === 'owner' ? 'bg-amber-500/10 text-amber-600' : 'bg-primary/10 text-primary'
                    }`}>
                    {profile?.role === 'owner' ? 'Dueño' : profile?.role === 'superadmin' ? 'Admin' : 'Jugador'}
                  </span>
                </div>

                {profile?.role === 'owner' && (
                  <Link
                    href="/dashboard"
                    onClick={() => setShowDropdown(false)}
                    className="flex items-center gap-2 w-full px-3 py-2 text-xs font-bold text-primary bg-primary/10 rounded-xl mb-1 hover:bg-primary/20 transition-colors"
                  >
                    <LayoutDashboard size={15} /> Panel de Dueño
                  </Link>
                )}
                <Link
                  href="/profile"
                  onClick={() => setShowDropdown(false)}
                  className="flex items-center gap-2 w-full px-3 py-2 text-xs font-medium text-foreground hover:bg-secondary rounded-xl transition-colors"
                >
                  <User size={15} /> Mi perfil
                </Link>
                <Link
                  href="/settings"
                  onClick={() => setShowDropdown(false)}
                  className="flex items-center gap-2 w-full px-3 py-2 text-xs font-medium text-foreground hover:bg-secondary rounded-xl transition-colors"
                >
                  <Settings size={15} /> Configuración
                </Link>
                <button
                  className="flex items-center gap-2 w-full px-3 py-2 text-xs font-medium text-red-500 hover:bg-red-500/10 rounded-xl transition-colors mt-1"
                  onClick={() => { signOut(); setShowDropdown(false); }}
                >
                  <LogOut size={15} /> Cerrar sesión
                </button>
              </div>
            )}
          </div>
        ) : (
          <button className="btn-primary btn-sm" onClick={onLoginClick}>
            Ingresar
          </button>
        )}
      </div>
    </header>
  );
}
