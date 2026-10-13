import Script from 'next/script'

/**
 * New Relic Browser Agent Component
 *
 * Inyecta el script de New Relic Browser Monitoring de forma segura.
 * Utiliza Next.js <Script strategy="beforeInteractive"> para:
 * 1. Evitar advertencias de hidratación de React causadas por datos dinámicos (age / timestamps).
 * 2. Cargar el agente antes de cualquier hidratación para registrar Core Web Vitals precisos.
 * 3. Despojar cualquier wrapper <script> previo para evitar anidación inválida de HTML.
 */

export function getNewRelicBrowserScript(): string | null {
  // Solo inyectar en producción o si está explícitamente habilitado
  if (
    process.env.NODE_ENV !== 'production' &&
    process.env.NEW_RELIC_BROWSER_MONITORING_ENABLE !== 'true'
  ) {
    return null
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const newrelic = require('newrelic')

    if (typeof newrelic?.getBrowserTimingHeader === 'function') {
      const raw = newrelic.getBrowserTimingHeader({
        hasToRemoveScriptWrapper: true,
        allowTransactionlessInjection: true,
      })

      if (!raw || typeof raw !== 'string') return null

      // Si NR devuelve un comentario de error (ej: <!-- NREUM: (4) -->), no inyectar
      if (raw.trim().startsWith('<!--')) return null

      // Limpiar cualquier tag <script> remanente para evitar anidación ilegal
      const clean = raw
        .replace(/^<script\b[^>]*>/i, '')
        .replace(/<\/script>$/i, '')
        .trim()

      return clean || null
    }
  } catch {
    // NR no disponible (local sin agente, Edge Runtime, o build time)
    return null
  }

  return null
}

export function NewRelicBrowserScript() {
  const browserScript = getNewRelicBrowserScript()

  if (!browserScript) {
    return null
  }

  return (
    <Script
      id="nr-browser-agent"
      strategy="beforeInteractive"
      dangerouslySetInnerHTML={{ __html: browserScript }}
    />
  )
}
