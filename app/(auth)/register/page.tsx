import { AuthForm } from '@/components/auth/AuthForm';
import Link from 'next/link';

export default function RegisterPage() {
  return (
    <div className="auth-container">
      <AuthForm
        mode="register"
        forcedRole="player"
        title="Únete a Cancheros"
        subtitle="Crea tu cuenta de Jugador para empezar a reservar y armar tus partidos."
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

        {/* Opción 2: Registra tu Cancha */}
        <p className="text-xs sm:text-sm font-semibold text-emerald-950/70">
          ¿Eres administrador de un complejo deportivo?{' '}
          <Link
            href="/register-owner"
            className="text-emerald-700 hover:text-emerald-800 font-extrabold underline underline-offset-4 decoration-emerald-500/40 hover:decoration-emerald-600 transition-all py-1 px-1 active:scale-95 inline-block"
          >
            Registra tu Cancha
          </Link>
        </p>
      </div>
    </div>
  );
}
