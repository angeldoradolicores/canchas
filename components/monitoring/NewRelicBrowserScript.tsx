/**
 * New Relic Browser Agent Component
 *
 * Inyecta el script de New Relic Browser Monitoring en el <head>.
 * Solo se renderiza en el servidor (Server Component).
 *
 * IMPORTANTE: `export const dynamic = 'force-dynamic'` evita que Next.js
 * intente renderizar este componente en tiempo de build estático,
 * lo que causaría errores cuando el agente NR no tiene conexión válida.
 */

// Fuerza renderizado dinámico (por request), nunca en build time
export const dynamic = 'force-dynamic'

export function NewRelicBrowserScript() {
  // Solo inyectar en producción o si está explícitamente habilitado
  if (
    process.env.NODE_ENV !== 'production' &&
    process.env.NEW_RELIC_BROWSER_MONITORING_ENABLE !== 'true'
  ) {
    return null
  }

  let browserScript = ''

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const newrelic = require('newrelic')

    // La API moderna de NR es síncrona
    if (typeof newrelic?.getBrowserTimingHeader === 'function') {
      browserScript = newrelic.getBrowserTimingHeader() ?? ''
    }
  } catch {
    // Silencio: NR no disponible (dev local, Edge Runtime, build time)
    return null
  }

  if (!browserScript || browserScript.trim() === '') {
    return null
  }

  return (
    <script
      type="text/javascript"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: contenido controlado por New Relic SDK
      dangerouslySetInnerHTML={{ __html: browserScript }}
    />
  )
}
