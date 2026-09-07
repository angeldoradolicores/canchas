export interface Pitch {
  id: string; // uuid
  company_id: string; // uuid
  name: string;
  type: string;
  surface: string | null;
  size: string | null;
  price_per_hour: number;
  tone: string;
  image_url: string | null;
  amenities: string | null;
  contact_phone?: string | null; // Nuevo campo para teléfono de la cancha
  created_at: string;

  // UI computed fields (para mantener compatibilidad con el UI existente)
  distance?: string;
  rating?: string;
  reviews?: number;
  open?: boolean;
  zone?: string;
  price?: string;
  image?: string;
  amenity?: string;
}

export interface Company {
  id: string;
  owner_id: string;
  name: string;
  address: string | null;
  zone: string | null;
  lat: number | null;
  lng: number | null;
  /** Datos bancarios para instrucciones de abono en mensajes WhatsApp */
  bank_name: string | null;
  bank_account: string | null;
  account_holder: string | null;
  /** WhatsApp del dueño – n8n lo usa para enviarle notificación de nuevo comprobante */
  owner_phone: string | null;
  
  /** Integración Multi-Tenant WhatsApp (Evolution API / Baileys) */
  whatsapp_instance_name: string | null;
  whatsapp_status: 'disconnected' | 'connecting' | 'connected' | null;
  whatsapp_qr_code: string | null;
  whatsapp_connected_phone: string | null;
  whatsapp_api_token: string | null;
  whatsapp_updated_at: string | null;

  created_at: string;
}

export interface Profile {
  id: string;
  full_name: string | null;
  phone: string | null;
  role: 'player' | 'owner' | 'superadmin';
  created_at: string;
}

/**
 * Ciclo de vida de una reserva
 * ─────────────────────────────────────────────────────────────────────────
 *  status        → estado externo visible al cliente y al dueño
 *  payment_status → máquina de estados del pago, independiente del status
 *
 *  Flujo feliz:
 *    INSERT → status='pending', payment_status='awaiting_proof', expires_at = now()+10min
 *    Cliente sube comprobante → payment_status='submitted'  (n8n notifica al dueño)
 *    Dueño aprueba → status='confirmed', payment_status='verified' (n8n notifica al cliente)
 *    n8n cron sweeper → si expires_at < now() y status='pending' → status='cancelled'
 */
export interface Booking {
  id: string;
  pitch_id: string;
  user_id: string | null;
  start_time: string;   // ISO 8601
  end_time: string;     // ISO 8601
  /** Estado principal del ciclo de vida */
  status: 'pending' | 'confirmed' | 'cancelled';
  /** Estado granular del pago */
  payment_status: 'awaiting_proof' | 'submitted' | 'verified' | 'rejected';
  /** URL firmada (7 días) del comprobante – bucket privado */
  payment_proof_url: string | null;
  /** TTL: si sigue pending al llegar aquí, n8n la cancela */
  expires_at: string | null;
  /** Auditoría de revisión */
  reviewed_at: string | null;
  reviewed_by: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  source: string;
  created_at: string;
}
