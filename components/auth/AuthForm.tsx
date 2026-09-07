'use client';

import { useState } from 'react';
import { Eye, EyeOff, Loader2, ArrowRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

interface AuthFormProps {
  mode: 'login' | 'register';
  forcedRole?: 'player' | 'owner' | 'superadmin';
  title: string;
  subtitle: string;
  redirectPath?: string;
}

export function AuthForm({ mode, forcedRole = 'player', title, subtitle, redirectPath = '/' }: AuthFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (mode === 'login') {
      const { error, data } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError('Correo o contraseña incorrectos.');
      } else {
        // Redirigir según el rol (consultando perfil o metadata)
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).maybeSingle();
        const role = profile?.role || data.user.user_metadata?.role;
        if (role === 'superadmin') router.push('/admin');
        else if (role === 'owner') router.push('/dashboard');
        else router.push(redirectPath);
      }
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName, role: forcedRole },
        },
      });
      if (error) setError(error.message);
      else setSuccess(true);
    }
    setLoading(false);
  };

  if (success) {
    return (
      <div className="auth-box success-state">
        <div className="auth-logo-dot" />
        <h2>¡Registro exitoso!</h2>
        <p>Por favor, revisa tu correo electrónico para confirmar tu cuenta antes de iniciar sesión.</p>
        <button className="btn-primary mt-6" onClick={() => router.push('/login')}>
          Ir a iniciar sesión
        </button>
      </div>
    );
  }

  return (
    <div className="auth-box">
      <div className="auth-head">
        <div className="auth-logo-dot" />
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>

      <form onSubmit={handleSubmit} className="auth-form">
        {mode === 'register' && (
          <label className="auth-field">
            <span>¿Cómo te llamas?</span>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Ej: Juan Pérez"
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
          {loading ? 'Procesando...' : mode === 'login' ? 'Ingresar a mi cuenta' : 'Completar registro'}
          {!loading && <ArrowRight size={16} />}
        </button>
      </form>
    </div>
  );
}
