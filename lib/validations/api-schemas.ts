import { z } from 'zod';

// ==========================================
// 1. ESQUEMAS PARA RESERVAS (/api/bookings)
// ==========================================

export const BookingCancelDraftSchema = z.object({
  pitch_id: z.string().optional(),
  selected_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido').optional(),
  selected_times: z.array(z.string().regex(/^\d{2}:\d{2}$/, 'Formato de hora inválido')).optional(),
  user_id: z.string().optional().nullable(),
  booking_ids: z.array(z.string()).optional(),
});

export const BookingLockSchema = z.object({
  pitch_id: z.string().min(1, 'El ID de la cancha es obligatorio'),
  selected_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha debe ser YYYY-MM-DD'),
  selected_times: z
    .array(z.string().regex(/^\d{2}:\d{2}$/, 'Formato de hora debe ser HH:mm'))
    .min(1, 'Debes seleccionar al menos una hora')
    .max(8, 'No puedes bloquear más de 8 horas consecutivas'),
  user_id: z.string().optional().nullable(),
});

export const BookingCreateSchema = z.object({
  pitch_id: z.string().min(1, 'El ID de la cancha es obligatorio'),
  customer_name: z
    .string()
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(100, 'El nombre no puede superar los 100 caracteres')
    .trim(),
  customer_phone: z
    .string()
    .max(25, 'Número de teléfono demasiado largo')
    .optional()
    .nullable()
    .or(z.literal('')),
  selected_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha debe ser YYYY-MM-DD'),
  selected_times: z
    .array(z.string().regex(/^\d{2}:\d{2}$/, 'Formato de hora debe ser HH:mm'))
    .min(1, 'Debes seleccionar al menos una hora')
    .max(8, 'No puedes reservar más de 8 horas consecutivas'),
  file_name: z.string().max(255).optional().nullable(),
  file_base64: z
    .string()
    .refine((val) => {
      if (!val) return true;
      // Límite de 7MB de string base64 (~5MB de archivo binario real)
      return val.length <= 7 * 1024 * 1024;
    }, { message: 'El comprobante supera el tamaño máximo permitido de 5 MB' })
    .refine((val) => {
      if (!val) return true;
      return (
        val.startsWith('data:image/') ||
        /^[A-Za-z0-9+/=]+$/.test(val.slice(0, 100))
      );
    }, { message: 'El comprobante debe ser una imagen válida (JPG, PNG, WebP)' })
    .optional()
    .nullable(),
  total_price: z.coerce.number().nonnegative('El precio total no puede ser negativo').optional().nullable(),
  deposit_amount: z.coerce.number().nonnegative('El abono no puede ser negativo').optional().nullable(),
  user_id: z.string().optional().nullable(),
});

// ==========================================
// 2. ESQUEMAS PARA ACCIONES DE ADMIN (/api/admin-actions)
// ==========================================

export const AdminCreatePitchSchema = z.object({
  company_id: z.string().optional(),
  name: z.string().min(2, 'El nombre de la cancha debe tener al menos 2 caracteres').max(100),
  type: z.string().max(50).optional().default('Fútbol 5'),
  price_per_hour: z.coerce.number().positive('El precio por hora debe ser mayor a 0').max(10000000),
  duration_minutes: z.coerce.number().int().positive().default(60),
  is_active: z.boolean().default(true),
  features: z.array(z.string().max(50)).max(20).optional().default([]),
  image_url: z.string().max(1000).optional().nullable(),
  media_urls: z.array(z.string().max(1000)).max(10).optional().default([]),
  opening_time: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:mm').optional().default('08:00'),
  closing_time: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:mm').optional().default('23:00'),
});

export const AdminUpdatePitchSchema = z.object({
  pitch_id: z.string().min(1, 'ID de cancha requerido'),
  updateData: z.record(z.string(), z.any()),
});

export const AdminDeletePitchSchema = z.object({
  pitch_id: z.string().min(1, 'ID de cancha requerido'),
});

export const AdminManualBookingSchema = z.object({
  pitch_id: z.string().min(1, 'ID de cancha requerido'),
  selected_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD'),
  selected_times: z.array(z.string().regex(/^\d{2}:\d{2}$/)).min(1).max(8),
  customer_name: z.string().min(2).max(100),
  customer_phone: z.string().max(25).optional().nullable(),
  total_price: z.coerce.number().nonnegative().optional().nullable(),
  deposit_amount: z.coerce.number().nonnegative().optional().nullable(),
});

// ==========================================
// 3. ESQUEMAS PARA COMUNIDAD (/api/community-actions)
// ==========================================

export const CommunityDeleteChallengeSchema = z.object({
  challenge_id: z.string().min(1, 'ID de reto requerido'),
});

export const CommunityUpdateChallengeSchema = z.object({
  challenge_id: z.string().min(1, 'ID de reto requerido'),
  updateData: z.record(z.string(), z.any()),
});

// ==========================================
// 4. ESQUEMAS PARA ESCUELAS (/api/schools)
// ==========================================

export const SchoolCreateSchema = z.object({
  name: z.string().min(2, 'El nombre de la escuela debe tener al menos 2 caracteres').max(100).trim(),
  contact_phone: z.string().max(25).optional().nullable().or(z.literal('')),
  instagram_url: z.string().max(300).optional().nullable().or(z.literal('')),
  facebook_url: z.string().max(300).optional().nullable().or(z.literal('')),
  description: z.string().max(4000, 'La descripción no puede superar 4000 caracteres').optional().nullable().or(z.literal('')),
  categories: z.union([
    z.string().max(300),
    z.array(z.string().max(50)).max(20),
  ]).optional().nullable().or(z.literal('')),
  logo_url: z.string().max(50000).optional().nullable().or(z.literal('')),
  images: z.array(z.string().max(5000)).max(20).optional().nullable(),
  pitch_id: z.string().max(100).optional().nullable().or(z.literal('')),
  custom_location: z.string().max(300).optional().nullable().or(z.literal('')),
});

export const SchoolUpdateSchema = SchoolCreateSchema.partial().extend({
  id: z.string().min(1, 'ID de escuela requerido'),
});

// ==========================================
// 5. ESQUEMAS PARA TORNEOS (/api/tournaments)
// ==========================================

export const TournamentCreateSchema = z.object({
  pitch_id: z.string().min(1, 'ID de cancha requerido'),
  name: z.string().min(3, 'El nombre debe tener al menos 3 caracteres').max(120).trim(),
  description: z.string().max(2000).optional().nullable(),
  category: z.string().max(50).optional().default('Libre'),
  entry_fee: z.coerce.number().nonnegative().default(0),
  prizes: z.string().max(500).optional().nullable(),
  rules: z.string().max(2000).optional().nullable(),
  contact_phone: z.string().max(25).optional().nullable(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD').optional().nullable(),
  image_url: z.string().max(1000).optional().nullable(),
  status: z.enum(['upcoming', 'active', 'finished']).default('upcoming'),
});

export const TournamentUpdateSchema = TournamentCreateSchema.partial().extend({
  id: z.string().min(1, 'ID del torneo requerido'),
});

// ==========================================
// 6. ESQUEMAS PARA WHATSAPP (/api/whatsapp)
// ==========================================

export const WhatsAppActionSchema = z.object({
  action: z.enum(['generate_qr', 'restart', 'logout', 'status', 'send_test']),
  companyId: z.string().min(1, 'companyId requerido'),
  phone: z.string().max(25).optional(),
});

// ==========================================
// 7. ESQUEMAS PARA FAVORITOS (/api/favorites)
// ==========================================

export const FavoriteToggleSchema = z.object({
  pitch_id: z.string().min(1, 'pitch_id requerido'),
  action: z.enum(['add', 'remove']).optional(),
  user_id: z.string().optional().nullable(),
});
