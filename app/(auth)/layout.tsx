import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Ingresa a Canchas Pasto',
  description: 'Inicia sesión o crea tu cuenta para reservar canchas sintéticas en Pasto.',
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-page-shell">
      {children}
    </div>
  );
}
