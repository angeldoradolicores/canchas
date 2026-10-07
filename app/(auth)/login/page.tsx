import { AuthForm } from '@/components/auth/AuthForm';
import Link from 'next/link';

export default function LoginPage() {
  return (
    <div className="auth-container">
      <AuthForm
        mode="login"
        title="Bienvenido de vuelta"
        subtitle="Ingresa tus credenciales para continuar."
      />

      <div className="mt-6 pt-5 border-t border-emerald-800/10 text-center space-y-2">
        <p className="text-xs sm:text-sm font-semibold text-emerald-950/70">
          ¿Aún no tienes cuenta?
        </p>

        <div className="flex items-center justify-center gap-2 text-xs sm:text-sm font-extrabold text-emerald-900 flex-wrap">
          <Link
            href="/register"
            className="text-emerald-700 hover:text-emerald-800 underline underline-offset-4 decoration-emerald-500/40 hover:decoration-emerald-600 transition-all py-1 px-1 active:scale-95"
          >
            Regístrate como Jugador
          </Link>

          <span className="text-emerald-950/40 font-bold text-xs">o</span>

          <Link
            href="/register-owner"
            className="text-emerald-700 hover:text-emerald-800 underline underline-offset-4 decoration-emerald-500/40 hover:decoration-emerald-600 transition-all py-1 px-1 active:scale-95"
          >
            Registra tu Cancha
          </Link>
        </div>
      </div>
    </div>
  );
}
