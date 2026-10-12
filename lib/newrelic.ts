/**
 * New Relic - Utilidades para monitoreo custom en Cancheros
 *
 * Importa estas funciones en tus API routes o componentes Server
 * para registrar eventos de negocio, errores y atributos custom.
 *
 * Uso:
 *   import { nrEvent, nrError, nrSetAttribute } from '@/lib/newrelic'
 */

type NewRelicAgent = {
  recordCustomEvent: (name: string, attributes: Record<string, unknown>) => void
  noticeError: (error: Error | string, customAttributes?: Record<string, unknown>) => void
  addCustomAttribute: (key: string, value: string | number | boolean) => void
  startBackgroundTransaction: (name: string, group: string, handle: () => void) => void
  endTransaction: () => void
  setTransactionName: (name: string) => void
}

function getAgent(): NewRelicAgent | null {
  try {
    // newrelic solo existe en Node.js runtime (servidor)
    if (typeof window !== 'undefined') return null
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('newrelic') as NewRelicAgent
  } catch {
    return null
  }
}

/**
 * Registra un evento de negocio personalizado en New Relic Insights.
 *
 * @example
 * // Cuando se crea una reserva
 * nrEvent('ReservaCreada', {
 *   canchaId: booking.cancha_id,
 *   precio: booking.total,
 *   modalidad: 'futbol5',
 * })
 */
export function nrEvent(
  eventName: string,
  attributes: Record<string, string | number | boolean>
): void {
  const nr = getAgent()
  if (!nr) return
  try {
    nr.recordCustomEvent(eventName, {
      app: 'cancheros',
      env: process.env.NODE_ENV,
      timestamp: Date.now(),
      ...attributes,
    })
  } catch (e) {
    console.error('[NewRelic] Error al registrar evento:', e)
  }
}

/**
 * Reporta un error capturado a New Relic con contexto adicional.
 *
 * @example
 * try {
 *   await crearReserva(data)
 * } catch (error) {
 *   nrError(error, { userId, canchaId })
 *   throw error
 * }
 */
export function nrError(
  error: unknown,
  customAttributes?: Record<string, string | number | boolean>
): void {
  const nr = getAgent()
  if (!nr) return
  try {
    const err = error instanceof Error ? error : new Error(String(error))
    nr.noticeError(err, { app: 'cancheros', ...customAttributes })
  } catch (e) {
    console.error('[NewRelic] Error al reportar error:', e)
  }
}

/**
 * Agrega un atributo custom a la transacción actual.
 * Útil para añadir contexto (userId, canchaId, etc.) a cualquier request.
 *
 * @example
 * nrSetAttribute('userId', session.user.id)
 * nrSetAttribute('plan', 'premium')
 */
export function nrSetAttribute(
  key: string,
  value: string | number | boolean
): void {
  const nr = getAgent()
  if (!nr) return
  try {
    nr.addCustomAttribute(key, value)
  } catch (e) {
    console.error('[NewRelic] Error al setear atributo:', e)
  }
}

/**
 * Renombra la transacción actual en New Relic.
 * Útil para rutas dinámicas donde el nombre auto-detectado no es descriptivo.
 *
 * @example
 * nrSetTransactionName('Booking/Create')
 */
export function nrSetTransactionName(name: string): void {
  const nr = getAgent()
  if (!nr) return
  try {
    nr.setTransactionName(name)
  } catch (e) {
    console.error('[NewRelic] Error al renombrar transacción:', e)
  }
}

// ─── Eventos de negocio predefinidos ────────────────────────────────────────

/** Registra cuando un usuario crea una reserva */
export function trackBookingCreated(data: {
  canchaId: string
  userId: string
  precio: number
  modalidad: string
  fecha: string
}) {
  nrEvent('BookingCreated', data)
}

/** Registra cuando una búsqueda de canchas es ejecutada */
export function trackSearch(data: {
  query: string
  resultados: number
  userId?: string
}) {
  nrEvent('CanchaSearch', data)
}

/** Registra cuando un usuario inicia sesión */
export function trackLogin(data: {
  userId: string
  metodo: 'email' | 'google'
  rol: 'player' | 'owner' | 'admin'
}) {
  nrEvent('UserLogin', data)
}

/** Registra cuando se envía un mensaje de WhatsApp */
export function trackWhatsAppMessage(data: {
  tipo: string
  destinatario: string
  exitoso: boolean
}) {
  nrEvent('WhatsAppMessage', data)
}

/** Registra cuando se sube un archivo (imagen, comprobante) */
export function trackFileUpload(data: {
  tipo: 'imagen' | 'comprobante' | 'avatar'
  tamanoKb: number
  exitoso: boolean
}) {
  nrEvent('FileUpload', data)
}
