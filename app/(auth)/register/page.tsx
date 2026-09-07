import { AuthForm } from '@/components/auth/AuthForm';
import Link from 'next/link';

export default function RegisterPage() {
  return (
    <div className="auth-container">
      <AuthForm
        mode="register"
        forcedRole="player"
        title="Únete a Canchas Pasto"
        subtitle="Crea tu cuenta de Jugador para empezar a reservar y armar tus partidos."
      />
      
      <p className="auth-switch">
        ¿Ya tienes cuenta? <Link href="/login">Inicia sesión</Link>
      </p>
      <p className="auth-switch mt-4">
        ¿Eres administrador de un complejo deportivo? <Link href="/register-owner">Registra tu Cancha</Link>
      </p>
    </div>
  );
}
