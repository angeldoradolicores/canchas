'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { Profile } from '@/lib/types';

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
  ensureProfile: () => Promise<Profile | null>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  session: null,
  loading: true,
  signOut: async () => {},
  ensureProfile: async () => null,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data, error }) => {
        if (error) {
          console.warn('⚠️ Sesión expirada o token inválido, limpiando estado de auth:', error.message);
          supabase.auth.signOut().catch(() => {});
          setSession(null);
          setUser(null);
          setProfile(null);
          setLoading(false);
          return;
        }

        const sess = data.session;
        setSession(sess);
        setUser(sess?.user ?? null);
        if (sess?.user) {
          fetchProfile(sess.user);
        } else {
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error('Error en getSession:', err);
        setLoading(false);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
      if (event === 'SIGNED_OUT' || !currentSession) {
        setSession(null);
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }

      setSession(currentSession);
      setUser(currentSession.user);
      fetchProfile(currentSession.user);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (authUser: User) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .maybeSingle();

      let finalProfile = data;

      if (!finalProfile) {
        // Auto-heal: el perfil no existe en public.profiles, crearlo automáticamente
        const fallbackProfile = {
          id: authUser.id,
          full_name: authUser.user_metadata?.full_name || authUser.email?.split('@')[0] || 'Jugador',
          role: authUser.user_metadata?.role || 'player',
        };

        const { data: created } = await supabase
          .from('profiles')
          .upsert(fallbackProfile)
          .select()
          .single();

        finalProfile = created || fallbackProfile as any;
      }

      if (finalProfile) {
        setProfile(finalProfile);

        // Si es dueño, asegurar que tenga empresa creada (silenciosamente)
        if (finalProfile.role === 'owner') {
          fetch('/api/admin-actions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'ensure_company',
              payload: {
                owner_id: authUser.id,
                company_name: finalProfile.full_name
                  ? `Complejo ${finalProfile.full_name}`
                  : 'Mi Complejo Deportivo',
              },
            }),
          }).catch(e => console.warn('No se pudo crear empresa automáticamente:', e));
        }
      }
    } catch (e) {
      console.error('Error fetching/creating profile:', e);
    } finally {
      setLoading(false);
    }
  };


  const ensureProfile = async (): Promise<Profile | null> => {
    if (!user) return null;
    if (profile) return profile;

    const fallbackProfile = {
      id: user.id,
      full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Jugador',
      role: user.user_metadata?.role || 'player',
    };

    const { data: created } = await supabase
      .from('profiles')
      .upsert(fallbackProfile)
      .select()
      .single();

    const result = created || (fallbackProfile as any);
    setProfile(result);
    return result;
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn('Error en signOut:', e);
    }
    setProfile(null);
    setUser(null);
    setSession(null);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.clear();
        window.sessionStorage.clear();
      } catch (e) {}
      window.location.href = '/';
    }
  };

  return (
    <AuthContext.Provider value={{ user, profile, session, loading, signOut, ensureProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
