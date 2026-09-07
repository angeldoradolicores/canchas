'use client';

import { useState } from 'react';
import { Eye, EyeOff, Loader2, X, Trophy, User, Building2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

import { useRouter } from 'next/navigation';

interface AuthModalProps {
  onClose: () => void;
}

type Mode = 'login' | 'register';
type Role = 'player' | 'owner';

export function AuthModal({ onClose }: AuthModalProps) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('login');
  const [role, setRole] = useState<Role>('player');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (mode === 'login') {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError('Correo o contraseña incorrectos.');
      } else {
        // Consultar el perfil para redirigir si es owner
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', data.user.id)
          .maybeSingle();

        const userRole = profile?.role || data.user.user_metadata?.role;
        onClose();
        if (userRole === 'owner') {
          router.push('/dashboard');
        } else if (userRole === 'superadmin') {
          router.push('/admin');
        }
      }
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName, role },
        },
      });
      if (error) {
        setError(error.message);
      } else {
        if (data.session) {
          // Si auto-confirm está activado en Supabase
          onClose();
          if (role === 'owner') {
            router.push('/dashboard');
          }
        } else {
          setSuccess('¡Cuenta creada! Revisa tu correo electrónico para confirmar tu registro y poder ingresar.');
        }
      }
    }
    setLoading(false);
  };

  return (
    <div className="auth-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="auth-modal">
        {/* Header */}
        <div className="auth-modal-head">
          <div>
            <div className="auth-logo-dot" />
            <h2>{mode === 'login' ? 'Bienvenido de vuelta' : 'Crea tu cuenta'}</h2>
            <p>{mode === 'login' ? 'Inicia sesión para reservar y jugar' : 'Únete a la comunidad de Canchas Pasto'}</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        {success ? (
          <div className="auth-success">
            <Trophy size={32} className="auth-success-icon" />
            <p>{success}</p>
            <button className="btn-primary" onClick={onClose}>Entendido</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="auth-form">
            {/* Selector de Rol (solo en registro) */}
            {mode === 'register' && (
              <div className="role-selector">
                <button
                  type="button"
                  className={`role-card ${role === 'player' ? 'active' : ''}`}
                  onClick={() => setRole('player')}
                >
                  <User size={22} />
                  <strong>Jugador</strong>
                  <span>Busca y reserva canchas</span>
                </button>
                <button
                  type="button"
                  className={`role-card ${role === 'owner' ? 'active' : ''}`}
                  onClick={() => setRole('owner')}
                >
                  <Building2 size={22} />
                  <strong>Dueño de cancha</strong>
                  <span>Administra tu complejo</span>
                </button>
              </div>
            )}

            {/* Nombre (solo en registro) */}
            {mode === 'register' && (
              <label className="auth-field">
                <span>¿Cómo te llamas?</span>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Juan Pérez"
                  required
                  autoComplete="name"
                />
              </label>
            )}

            <label className="auth-field">
              <span>Correo electrónico</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@correo.com"
                required
                autoComplete="email"
              />
            </label>

            <label className="auth-field">
              <span>Contraseña</span>
              <div className="password-wrap">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
                <button type="button" className="pass-toggle" onClick={() => setShowPass(!showPass)}>
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>

            {error && <p className="auth-error">{error}</p>}

            <button type="submit" className="btn-primary auth-submit" disabled={loading}>
              {loading ? <Loader2 size={18} className="spin" /> : null}
              {loading ? 'Cargando...' : mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
            </button>

            <p className="auth-switch">
              {mode === 'login' ? '¿No tienes cuenta?' : '¿Ya tienes cuenta?'}{' '}
              <button type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
                {mode === 'login' ? 'Regístrate gratis' : 'Inicia sesión'}
              </button>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
