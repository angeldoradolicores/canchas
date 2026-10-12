/**
 * Next.js Instrumentation Hook
 * Se ejecuta UNA VEZ al arrancar el servidor antes de cualquier request.
 * Carga el agente New Relic en el runtime de Node.js (lado servidor).
 *
 * Docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Solo en el runtime de Node.js (server-side), nunca en Edge Runtime
    await import('newrelic')
    console.log('[NewRelic] Agente APM iniciado para Cancheros ✓')
  }
}
