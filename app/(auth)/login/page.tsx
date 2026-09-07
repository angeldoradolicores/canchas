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
      
      <p className="auth-switch">
        ¿No tienes cuenta? <Link href="/register">Regístrate como Jugador</Link> o{' '}
        <Link href="/register-owner">Registra tu Cancha</Link>
      </p>
    </div>
  );
}
