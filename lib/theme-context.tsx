'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

type Theme = 'light' | 'dark' | 'system';
type ResolvedTheme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'light',
  resolvedTheme: 'light',
  setTheme: () => {},
  toggleTheme: () => {},
});

const THEME_STORAGE_KEY = 'cancheros_theme';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('light');
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('light');
  const [mounted, setMounted] = useState(false);

  const applyTheme = useCallback((targetTheme: Theme) => {
    let effective: ResolvedTheme = 'light';

    if (targetTheme === 'dark') {
      effective = 'dark';
    } else if (targetTheme === 'light') {
      effective = 'light';
    } else {
      // Sistema
      if (typeof window !== 'undefined') {
        effective = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
    }

    setResolvedTheme(effective);

    if (typeof document !== 'undefined') {
      const root = document.documentElement;
      if (effective === 'dark') {
        root.classList.add('dark');
        root.style.colorScheme = 'dark';
      } else {
        root.classList.remove('dark');
        root.style.colorScheme = 'light';
      }
    }
  }, []);

  // Inicializar desde localStorage al montar
  useEffect(() => {
    let savedTheme: Theme = 'light';
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
      if (stored === 'dark' || stored === 'light' || stored === 'system') {
        savedTheme = stored;
      }
    } catch {}

    setThemeState(savedTheme);
    applyTheme(savedTheme);
    setMounted(true);
  }, [applyTheme]);

  // Escuchar cambios en la preferencia del sistema si está en 'system'
  useEffect(() => {
    if (theme !== 'system' || typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      applyTheme('system');
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme, applyTheme]);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    } catch {}
    applyTheme(newTheme);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('cancheros-theme-changed', { detail: newTheme }));
    }
  }, [applyTheme]);

  const toggleTheme = useCallback(() => {
    const next = resolvedTheme === 'dark' ? 'light' : 'dark';
    setTheme(next);
  }, [resolvedTheme, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
