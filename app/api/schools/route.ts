import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit, createRateLimitErrorResponse } from '@/lib/rate-limit';
import { getAuthenticatedUser } from '@/lib/auth-guard';
import { SchoolCreateSchema, SchoolUpdateSchema } from '@/lib/validations/api-schemas';

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return createClient(url, key);
}

/**
 * Normaliza y enriquece la escuela extrayendo todas las imágenes y la ubicación personalizada
 */
function enrichSchoolRow(school: any) {
  if (!school) return school;

  // 1. Extraer todas las imágenes
  let allImages: string[] = [];
  if (Array.isArray(school.images) && school.images.length > 0) {
    allImages = school.images;
  } else if (school.logo_url) {
    if (school.logo_url.includes('|||')) {
      allImages = school.logo_url.split('|||').filter(Boolean);
    } else if (school.logo_url.startsWith('[') && school.logo_url.endsWith(']')) {
      try {
        const parsed = JSON.parse(school.logo_url);
        if (Array.isArray(parsed)) allImages = parsed;
      } catch {
        allImages = [school.logo_url];
      }
    } else {
      allImages = [school.logo_url];
    }
  }

  // 2. Extraer ubicación personalizada (si vino de columna nativa o del metadata en description)
  let customLocation: string | null = school.custom_location || null;
  let cleanDescription: string | null = school.description || null;

  if (!customLocation && cleanDescription && cleanDescription.includes('[Ubicación:')) {
    const match = cleanDescription.match(/\[Ubicación:\s*([^\]]+)\]/);
    if (match) {
      customLocation = match[1].trim();
      cleanDescription = cleanDescription.replace(/\[Ubicación:\s*[^\]]+\]/, '').trim();
    }
  }

  return {
    ...school,
    images: allImages,
    logo_url: allImages[0] || school.logo_url || null,
    custom_location: customLocation,
    description: cleanDescription,
  };
}

// GET - Listar escuelas públicas (con rate limit)
export async function GET(req: NextRequest) {
  const rateLimit = checkRateLimit(req, {
    limit: 60,
    windowSeconds: 60,
    keyPrefix: 'api:schools:get',
  });
  if (!rateLimit.success) return createRateLimitErrorResponse(rateLimit);

  try {
    const supabase = getServiceSupabase();
    const { searchParams } = new URL(req.url);
    const pitch_id = searchParams.get('pitch_id');

    let query = supabase
      .from('schools')
      .select('*, pitches(id, name, image_url)');

    if (pitch_id) query = query.eq('pitch_id', pitch_id);

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const enriched = (data || []).map(enrichSchoolRow);
    return NextResponse.json({ success: true, data: enriched });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST - Crear escuela
export async function POST(req: NextRequest) {
  const rateLimit = checkRateLimit(req, {
    limit: 20,
    windowSeconds: 60,
    keyPrefix: 'api:schools:post',
  });
  if (!rateLimit.success) return createRateLimitErrorResponse(rateLimit);

  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Debes iniciar sesión para registrar una escuela.' }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Cuerpo de petición inválido' }, { status: 400 });
    }

    const validation = SchoolCreateSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.issues[0]?.message || 'Datos de escuela inválidos', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const validData = validation.data;
    const service = getServiceSupabase();

    let created_by_owner = false;
    if (validData.pitch_id) {
      const { data: pitch } = await service.from('pitches').select('company_id').eq('id', validData.pitch_id).single();
      if (pitch) {
        const { data: company } = await service.from('companies').select('id').eq('id', pitch.company_id).eq('owner_id', user.id).single();
        if (company) created_by_owner = true;
      }
    }

    // Preparar fotos serializadas para máxima compatibilidad con logo_url
    const imagesList = Array.isArray(validData.images) && validData.images.length > 0
      ? validData.images
      : (validData.logo_url ? [validData.logo_url] : []);
    const serializedImages = imagesList.join('|||');

    // Manejar ubicación personalizada (cancha que no está en el sistema)
    let finalDescription = validData.description || null;
    if (validData.custom_location && !validData.pitch_id) {
      const locTag = `[Ubicación: ${validData.custom_location.trim()}]`;
      finalDescription = finalDescription ? `${finalDescription}\n\n${locTag}` : locTag;
    }

    const categoriesStr = Array.isArray(validData.categories)
      ? validData.categories.join(', ')
      : (validData.categories || null);

    // Intentar insertar con columnas nativas (si existen) y fallback seguro
    const basePayload: any = {
      name: validData.name,
      logo_url: serializedImages || null,
      contact_phone: validData.contact_phone || null,
      instagram_url: validData.instagram_url || null,
      facebook_url: validData.facebook_url || null,
      description: finalDescription,
      categories: categoriesStr,
      pitch_id: validData.pitch_id || null,
      created_by_owner,
      user_id: user.id,
    };

    let insertResult = await service
      .from('schools')
      .insert({
        ...basePayload,
        images: imagesList.length > 0 ? imagesList : null,
        custom_location: validData.custom_location || null,
      })
      .select('*, pitches(id, name, image_url)')
      .single();

    // Si las columnas nativas aún no existen en DB (error PGRST204), insertar usando basePayload
    if (insertResult.error && (insertResult.error.code === 'PGRST204' || insertResult.error.message.includes('column'))) {
      insertResult = await service
        .from('schools')
        .insert(basePayload)
        .select('*, pitches(id, name, image_url)')
        .single();
    }

    if (insertResult.error) {
      return NextResponse.json({ error: insertResult.error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: enrichSchoolRow(insertResult.data) });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Manejador común de Actualización para PUT y PATCH
async function handleUpdate(req: NextRequest) {
  const rateLimit = checkRateLimit(req, {
    limit: 20,
    windowSeconds: 60,
    keyPrefix: 'api:schools:update',
  });
  if (!rateLimit.success) return createRateLimitErrorResponse(rateLimit);

  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: 'Debes iniciar sesión para actualizar.' }, { status: 401 });

    const service = getServiceSupabase();
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Cuerpo de petición inválido' }, { status: 400 });
    }

    const validation = SchoolUpdateSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.issues[0]?.message || 'Datos de actualización inválidos', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const { id, ...updates } = validation.data;

    // Verificar propiedad o rol superadmin
    const { data: school, error: findErr } = await service.from('schools').select('user_id, description').eq('id', id).single();
    if (findErr || !school) {
      return NextResponse.json({ error: 'Escuela no encontrada' }, { status: 404 });
    }

    const { data: profile } = await service.from('profiles').select('role').eq('id', user.id).single();

    if (school.user_id && school.user_id !== user.id && profile?.role !== 'superadmin') {
      return NextResponse.json({ error: 'No tienes permiso para editar esta escuela' }, { status: 403 });
    }

    // Preparar fotos
    const imagesList = Array.isArray(updates.images) && updates.images.length > 0
      ? updates.images
      : (updates.logo_url ? [updates.logo_url] : []);
    const serializedImages = imagesList.join('|||');

    // Manejar ubicación personalizada en description
    let finalDescription = updates.description !== undefined ? updates.description : school.description;
    if (finalDescription) {
      finalDescription = finalDescription.replace(/\[Ubicación:\s*[^\]]+\]/, '').trim();
    }
    if (updates.custom_location && !updates.pitch_id) {
      const locTag = `[Ubicación: ${updates.custom_location.trim()}]`;
      finalDescription = finalDescription ? `${finalDescription}\n\n${locTag}` : locTag;
    }

    const categoriesStr = Array.isArray(updates.categories)
      ? updates.categories.join(', ')
      : (updates.categories !== undefined ? updates.categories : undefined);

    const updatePayload: any = {
      ...(updates.name ? { name: updates.name } : {}),
      ...(serializedImages ? { logo_url: serializedImages } : {}),
      ...(updates.contact_phone !== undefined ? { contact_phone: updates.contact_phone || null } : {}),
      ...(updates.instagram_url !== undefined ? { instagram_url: updates.instagram_url || null } : {}),
      ...(updates.facebook_url !== undefined ? { facebook_url: updates.facebook_url || null } : {}),
      ...(finalDescription !== undefined ? { description: finalDescription || null } : {}),
      ...(categoriesStr !== undefined ? { categories: categoriesStr || null } : {}),
      ...(updates.pitch_id !== undefined ? { pitch_id: updates.pitch_id || null } : {}),
    };

    // Intentar actualizar con columnas nativas primero
    let updateResult = await service
      .from('schools')
      .update({
        ...updatePayload,
        images: imagesList.length > 0 ? imagesList : null,
        custom_location: updates.custom_location || null,
      })
      .eq('id', id)
      .select('*, pitches(id, name, image_url)')
      .single();

    // Fallback si no existen las columnas opcionales en Postgres
    if (updateResult.error && (updateResult.error.code === 'PGRST204' || updateResult.error.message.includes('column'))) {
      updateResult = await service
        .from('schools')
        .update(updatePayload)
        .eq('id', id)
        .select('*, pitches(id, name, image_url)')
        .single();
    }

    if (updateResult.error) {
      return NextResponse.json({ error: updateResult.error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: enrichSchoolRow(updateResult.data) });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH - Actualizar
export async function PATCH(req: NextRequest) {
  return handleUpdate(req);
}

// PUT - Actualizar (soporta clientes que envían PUT)
export async function PUT(req: NextRequest) {
  return handleUpdate(req);
}

// DELETE - Eliminar escuela
export async function DELETE(req: NextRequest) {
  const rateLimit = checkRateLimit(req, {
    limit: 20,
    windowSeconds: 60,
    keyPrefix: 'api:schools:delete',
  });
  if (!rateLimit.success) return createRateLimitErrorResponse(rateLimit);

  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const service = getServiceSupabase();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 });

    const { data: school } = await service.from('schools').select('user_id').eq('id', id).single();
    const { data: profile } = await service.from('profiles').select('role').eq('id', user.id).single();

    if (school?.user_id && school.user_id !== user.id && profile?.role !== 'superadmin') {
      return NextResponse.json({ error: 'No tienes permiso para eliminar esta escuela' }, { status: 403 });
    }

    const { error } = await service.from('schools').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
