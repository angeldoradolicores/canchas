'use client';

import { ChevronDown, LogOut, MapPin, Menu, Bell, Settings, User, Check, Trash2, LayoutDashboard } from 'lucide-react';
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
  const supabase = createClient();

  useEffect(() => {
    if (user) {
      fetchNotifications();
    }
  }, [user]);

  const fetchNotifications = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);

    setNotifications(data || []);
  };

  const markAsRead = async (id: string) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
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
  const CITIES = ['Pasto', 'Ipiales', 'Tumaco'];
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
    <header className="topbar">
      <button onClick={onMenu} className="icon-button lg:hidden" aria-label="Abrir menú">
        <Menu size={21} />
      </button>
      {/* ── Selector de ubicación ── */}
      <div className="relative">
        <p className="eyebrow">Mi ubicación</p>
        <div className="flex items-center gap-1.5">
          <button
            className="location"
            onClick={() => { setShowCityDropdown(v => !v); setShowDropdown(false); setShowNotifications(false); }}
          >
            <MapPin size={15} /> {selectedCity}, Nariño <ChevronDown size={14} className={`transition-transform ${showCityDropdown ? 'rotate-180' : ''}`} />
          </button>
          <button
            onClick={handleGPS}
            disabled={locating}
            title="Usar mi ubicación GPS"
            className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 hover:bg-primary/20 text-primary transition-colors text-xs font-bold"
          >
            {locating ? '⏳' : '📍'}
          </button>
        </div>

        {/* Dropdown ciudades */}
        {showCityDropdown && (
          <div className="absolute top-full left-0 mt-2 min-w-[180px] bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-3 pt-2 pb-1">Selecciona ciudad</p>
            {CITIES.map(city => (
              <button
                key={city}
                onClick={() => handleCitySelect(city)}
                className={`w-full text-left px-4 py-2.5 text-sm font-semibold hover:bg-primary/10 transition-colors flex items-center gap-2 ${selectedCity === city ? 'text-primary bg-primary/5' : 'text-foreground'
                  }`}
              >
                <MapPin size={13} className={selectedCity === city ? 'text-primary' : 'text-muted-foreground'} />
                {city}
                {selectedCity === city && <Check size={13} className="ml-auto text-primary" />}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="header-actions">
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
              }}
              className="icon-button relative"
              aria-label="Notificaciones"
            >
              <Bell size={19} />
              {unreadCount > 0 && <span className="dot" />}
            </button>

            {/* Dropdown de Notificaciones */}
            {showNotifications && (
              <div className="avatar-dropdown w-80 right-0 p-3 z-50">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-border">
                  <strong className="text-sm">Notificaciones</strong>
                  {unreadCount > 0 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 bg-primary/10 text-primary rounded-full">
                      {unreadCount} nuevas
                    </span>
                  )}
                </div>

                {notifications.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-6">No tienes notificaciones por ahora.</p>
                ) : (
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {notifications.map((n) => (
                      <div
                        key={n.id}
                        className={`p-2.5 rounded-xl border text-xs transition-colors flex items-start justify-between gap-2 ${n.is_read ? 'bg-card border-border/40 opacity-70' : 'bg-primary/5 border-primary/20 font-medium'
                          }`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-foreground truncate">{n.title}</p>
                          <p className="text-muted-foreground mt-0.5 leading-tight">{n.message}</p>
                          <span className="text-[10px] text-muted-foreground/70 mt-1 block">
                            {new Date(n.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
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
          <div className="avatar-wrap">
            <button
              className="header-avatar"
              onClick={() => {
                setShowDropdown(!showDropdown);
                setShowNotifications(false);
              }}
              aria-label="Perfil"
            >
              {initials}
            </button>
            {showDropdown && (
              <div className="avatar-dropdown">
                <div className="avatar-dropdown-head">
                  <strong>{profile?.full_name ?? 'Usuario'}</strong>
                  <span className={`role-badge role-${profile?.role ?? 'player'}`}>
                    {profile?.role === 'owner' ? 'Dueño' : profile?.role === 'superadmin' ? 'Admin' : 'Jugador'}
                  </span>
                </div>
                <p className="avatar-email">{user.email}</p>
                <hr />
                {profile?.role === 'owner' && (
                  <Link
                    href="/dashboard"
                    onClick={() => setShowDropdown(false)}
                    className="dropdown-item text-primary font-bold bg-primary/10"
                  >
                    <LayoutDashboard size={15} /> Panel de Dueño
                  </Link>
                )}
                <Link
                  href="/profile"
                  onClick={() => setShowDropdown(false)}
                  className="dropdown-item"
                >
                  <User size={15} /> Mi perfil
                </Link>
                <Link
                  href="/settings"
                  onClick={() => setShowDropdown(false)}
                  className="dropdown-item"
                >
                  <Settings size={15} /> Configuración
                </Link>
                <button
                  className="dropdown-item danger"
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
