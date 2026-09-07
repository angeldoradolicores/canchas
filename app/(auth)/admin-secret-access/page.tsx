import { AuthForm } from '@/components/auth/AuthForm';

export default function AdminSecretAccessPage() {
  return (
    <div className="auth-container">
      <div className="owner-badge mb-4 mx-auto w-fit">
        <span className="role-badge role-superadmin" style={{ padding: '6px 12px', fontSize: '13px' }}>ACCESO RESTRINGIDO - SUPERADMIN</span>
      </div>
      
      {/* 
        NOTA: En producción, este formulario podría solo permitir "login"
        o permitir registro pero solo si tienes un token especial.
        Por ahora permitimos registrarse como superadmin a través de este link secreto.
      */}
      <AuthForm
        mode="register"
        forcedRole="superadmin"
        title="Crear cuenta Root"
        subtitle="Registra las credenciales maestras para el control total de Canchas Pasto."
        redirectPath="/admin"
      />
    </div>
  );
}
