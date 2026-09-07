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
      
      <p className="auth-switch">
        ¿Ya tienes cuenta? <Link href="/login">Inicia sesión</Link>
      </p>
      <p className="auth-switch mt-4">
        ¿Solo quieres reservar? <Link href="/register">Regístrate como Jugador</Link>
      </p>
    </div>
  );
}
