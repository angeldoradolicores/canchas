import { AuthForm } from '@/components/auth/AuthForm';
import Link from 'next/link';

export default function RegisterOwnerPage() {
  return (
    <div className="auth-container">
      <div className="owner-badge mb-4 mx-auto w-fit">
        <span className="role-badge role-owner" style={{ padding: '6px 12px', fontSize: '13px' }}>Modo Dueño / B2B</span>
      </div>
      <AuthForm
        mode="register"
        forcedRole="owner"
        title="Registra tu Complejo"
        subtitle="Crea tu cuenta de Dueño para empezar a recibir reservas y gestionar tus canchas."
        redirectPath="/dashboard"
      />

      <div className="mt-6 pt-5 border-t border-emerald-800/10 text-center space-y-3">
        {/* Opción 1: Iniciar Sesión */}
        <p className="text-xs sm:text-sm font-semibold text-emerald-950/70">
          ¿Ya tienes cuenta?{' '}
          <Link
            href="/login"
            className="text-emerald-700 hover:text-emerald-800 font-extrabold underline underline-offset-4 decoration-emerald-500/40 hover:decoration-emerald-600 transition-all py-1 px-1 active:scale-95 inline-block"
          >
            Inicia sesión
          </Link>
        </p>

        {/* Opción 2: Regístrate como Jugador */}
        <p className="text-xs sm:text-sm font-semibold text-emerald-950/70">
          ¿Solo quieres reservar?{' '}
          <Link
            href="/register"
            className="text-emerald-700 hover:text-emerald-800 font-extrabold underline underline-offset-4 decoration-emerald-500/40 hover:decoration-emerald-600 transition-all py-1 px-1 active:scale-95 inline-block"
          >
            Regístrate como Jugador
          </Link>
        </p>
      </div>
    </div>
  );
}
