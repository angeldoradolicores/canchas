import { NextRequest } from 'next/server';
import { createClient, User } from '@supabase/supabase-js';

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return createClient(url, key);
}

/**
 * Obtiene de forma segura el usuario autenticado a partir del encabezado Authorization (Bearer token)
 * o de las cookies de sesión. NUNCA confía en IDs enviados en el body payload.
 */
export async function getAuthenticatedUser(req: NextRequest): Promise<User | null> {
  const supabase = getAdminSupabase();

  // 1. Verificar encabezado Authorization: Bearer <token>
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (token) {
      const { data, error } = await supabase.auth.getUser(token);
      if (!error && data?.user) {
        return data.user;
      }
    }
  }

  // 2. Fallback: buscar token de sesión en cookies de Supabase
  const sbAccessTokenCookie = req.cookies.get('sb-access-token')?.value ||
    req.cookies.get(`sb-${process.env.NEXT_PUBLIC_SUPABASE_URL?.split('//')[1]?.split('.')[0]}-auth-token`)?.value;

  if (sbAccessTokenCookie) {
    try {
      let rawToken = sbAccessTokenCookie;
      // Si la cookie es un JSON serializado (Supabase SSR v0.12+)
      if (rawToken.startsWith('[')) {
        const parsed = JSON.parse(rawToken);
        rawToken = parsed[0] || '';
      } else if (rawToken.startsWith('{')) {
        const parsed = JSON.parse(rawToken);
        rawToken = parsed.access_token || '';
      }
      if (rawToken) {
        const { data, error } = await supabase.auth.getUser(rawToken);
        if (!error && data?.user) {
          return data.user;
        }
      }
    } catch {
      // Ignorar error al parsear cookies
    }
  }

  return null;
}

/**
 * Verifica si un usuario es propietario legítimo de una empresa (complejo deportivo).
 */
export async function verifyCompanyOwnership(userId: string, companyId: string): Promise<boolean> {
  if (!userId || !companyId) return false;
  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from('companies')
    .select('id')
    .eq('id', companyId)
    .eq('owner_id', userId)
    .maybeSingle();

  return !error && !!data;
}

/**
 * Verifica si un usuario es propietario de la cancha especificada
 * (a través de la empresa a la que pertenece la cancha).
 */
export async function verifyPitchOwnership(userId: string, pitchId: string): Promise<boolean> {
  if (!userId || !pitchId) return false;
  const supabase = getAdminSupabase();

  const { data: pitch, error: pitchErr } = await supabase
    .from('pitches')
    .select('company_id')
    .eq('id', pitchId)
    .maybeSingle();

  if (pitchErr || !pitch?.company_id) return false;

  return verifyCompanyOwnership(userId, pitch.company_id);
}
