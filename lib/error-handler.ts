/**
 * Centralized error handler and sanitizer for the entire application.
 * Ensures NO internal database schema, SQL errors, Supabase exceptions,
 * stack traces, or server technical details are ever exposed to the user.
 */

const KNOWN_ERROR_MAP: Array<{ pattern: RegExp; message: string }> = [
  // Auth errors
  { pattern: /invalid login credentials/i, message: 'Correo o contraseña incorrectos.' },
  { pattern: /invalid_grant/i, message: 'Correo o contraseña incorrectos.' },
  { pattern: /email not confirmed/i, message: 'Tu correo electrónico no ha sido confirmado aún. Por favor revisa tu bandeja de entrada o spam.' },
  { pattern: /user already registered/i, message: 'Ya existe una cuenta registrada con este correo electrónico.' },
  { pattern: /user with this email already exists/i, message: 'Ya existe una cuenta registrada con este correo electrónico.' },
  { pattern: /email rate limit exceeded/i, message: 'Has superado el límite de intentos. Por favor espera unos minutos antes de volver a intentar.' },
  { pattern: /rate limit/i, message: 'Demasiadas solicitudes en poco tiempo. Por favor espera un momento.' },
  { pattern: /password should be at least/i, message: 'La contraseña debe tener al menos 6 caracteres.' },
  { pattern: /signup requires a valid password/i, message: 'Por favor ingresa una contraseña válida.' },
  { pattern: /token has expired|token_expired|otp_expired/i, message: 'El enlace o código de verificación ha expirado. Por favor solicita uno nuevo.' },
  { pattern: /invalid token|bad_code|pkce/i, message: 'El enlace o código de verificación no es válido o ya fue utilizado.' },
  { pattern: /session not found|jwt expired|auth session missing/i, message: 'Tu sesión ha expirado. Por favor inicia sesión nuevamente.' },
  { pattern: /user not found/i, message: 'No se encontró ningún usuario con los datos proporcionados.' },
  { pattern: /weak_password/i, message: 'La contraseña es muy sencilla. Utiliza una más segura.' },
  { pattern: /same_password/i, message: 'La nueva contraseña debe ser diferente a la anterior.' },

  // Database / Postgres errors
  { pattern: /duplicate key|unique constraint/i, message: 'Ya existe un registro con estos datos.' },
  { pattern: /foreign key constraint|violates foreign key/i, message: 'No se pudo realizar la acción debido a que un registro asociado no existe o fue eliminado.' },
  { pattern: /not-null constraint|null value in column/i, message: 'Por favor completa todos los campos requeridos.' },
  { pattern: /check constraint/i, message: 'Los datos ingresados no cumplen con el formato o rango permitido.' },
  { pattern: /pgrst|pg_catalog|column.*does not exist|relation.*does not exist/i, message: 'Ocurrió un inconveniente temporal en el servicio. Intenta nuevamente.' },
  { pattern: /permission denied|row-level security|policy/i, message: 'No tienes los permisos necesarios para realizar esta acción.' },

  // Storage / Upload errors
  { pattern: /payload too large|file too large|entity too large/i, message: 'El archivo seleccionado es demasiado grande. Por favor selecciona uno más liviano.' },
  { pattern: /unsupported media type|invalid file type/i, message: 'El tipo de archivo no es compatible. Usa formatos comunes como JPG, PNG o PDF.' },
  { pattern: /bucket not found|storage/i, message: 'No se pudo completar la subida del archivo. Por favor intenta más tarde.' },

  // Network / General
  { pattern: /failed to fetch|network error|econnrefused|etimedout/i, message: 'Problemas de conexión con el servidor. Verifica tu conexión a internet e inténtalo de nuevo.' },
  { pattern: /abort|timeout/i, message: 'La solicitud tardó demasiado tiempo en responder. Por favor intenta de nuevo.' },
];

/**
 * Technical indicators that imply internal server/database leaks.
 * If an error contains these and hasn't matched a clean translation,
 * we never show it to the user.
 */
const INTERNAL_LEAK_PATTERNS = [
  /select /i,
  /insert into/i,
  /update /i,
  /delete from/i,
  /table /i,
  /syntax error/i,
  /postgres/i,
  /supabase/i,
  /pgrst/i,
  /schema/i,
  /at (Object|Function|eval|<anonymous>)/i,
  /\.tsx?:\d+/i,
  /stack/i,
  /internal server error/i,
  /violates /i,
  /constraint /i,
  /jwt/i,
  /jwks/i,
  /bearer /i,
  /secret/i,
];

/**
 * Sanitizes any error (Error object, Supabase PostgrestError, string, or unknown)
 * into a safe, human-friendly Spanish message suitable for displaying in the UI.
 */
export function getFriendlyErrorMessage(
  error: unknown,
  fallbackMessage: string = 'Ocurrió un error al procesar la solicitud. Por favor intenta de nuevo.'
): string {
  if (!error) return fallbackMessage;

  let rawMessage = '';

  if (typeof error === 'string') {
    rawMessage = error;
  } else if (typeof error === 'object' && error !== null) {
    const errObj = error as Record<string, any>;
    rawMessage = errObj.message || errObj.error_description || errObj.error || errObj.details || '';
  }

  rawMessage = String(rawMessage).trim();
  if (!rawMessage) return fallbackMessage;

  // 1. Check known mappings
  for (const { pattern, message } of KNOWN_ERROR_MAP) {
    if (pattern.test(rawMessage)) {
      return message;
    }
  }

  // 2. Check if the message contains internal technical leak patterns
  const containsInternalLeak = INTERNAL_LEAK_PATTERNS.some((leak) => leak.test(rawMessage));
  if (containsInternalLeak) {
    return fallbackMessage;
  }

  // 3. If the message is already short, in Spanish and contains no internal leaks, keep it
  // (e.g. custom business validation messages like "Horario no disponible", "Debes ingresar tu teléfono", etc.)
  if (rawMessage.length < 200 && !/[<>{}\\]/.test(rawMessage)) {
    return rawMessage;
  }

  return fallbackMessage;
}

/**
 * Server-side helper for API routes:
 * Logs the complete internal error for developer inspection in the server terminal,
 * while returning a safe, sanitized message to the response JSON.
 */
export function safeServerErrorResponse(
  error: unknown,
  fallbackMessage: string = 'Ocurrió un error al procesar la solicitud en el servidor. Por favor intenta nuevamente.'
): { error: string } {
  // Safe server logging with full details for debugging
  console.error('[API Server Error]:', error);

  const cleanMessage = getFriendlyErrorMessage(error, fallbackMessage);
  return { error: cleanMessage };
}
