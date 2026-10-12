'use strict'

/**
 * New Relic APM Configuration - Cancheros
 * Monitorea todas las rutas, APIs y transacciones del servidor.
 * Docs: https://docs.newrelic.com/docs/apm/agents/nodejs-agent/
 */
exports.config = {
  /**
   * ─── IDENTIDAD ────────────────────────────────────────────────────────────
   */
  app_name: ['cancheros'],
  license_key: '66840daa3b8ca5cdca748823cc968cbff56fNRAL',

  /**
   * ─── REGIÓN ────────────────────────────────────────────────────────────────
   * Si tu cuenta es EU → host: 'collector.eu.newrelic.com'
   * Si tu cuenta es US → omite este campo (por defecto es US)
   */
  host: process.env.NEW_RELIC_HOST || 'collector.newrelic.com',

  /**
   * ─── LOGGING ──────────────────────────────────────────────────────────────
   * En producción usa 'info'. Para debug temporal usa 'trace'.
   */
  logging: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'trace',
    filepath: 'stdout',
    diagnostics: false,
  },

  /**
   * ─── DISTRIBUTED TRACING ──────────────────────────────────────────────────
   * Rastrea requests de extremo a extremo (cliente → API → DB → respuesta).
   */
  distributed_tracing: {
    enabled: true,
  },

  /**
   * ─── TRANSACCIONES ────────────────────────────────────────────────────────
   * Monitorea cada ruta de Next.js como una transacción separada.
   */
  transaction_tracer: {
    enabled: true,
    transaction_threshold: 'apdex_f', // Traza las lentas automáticamente
    record_sql: 'raw',                 // Registra queries SQL completas
    explain_threshold: 500,            // Explain plans si query > 500ms
    hide_internals: false,
  },

  /**
   * ─── ERROR COLLECTOR ──────────────────────────────────────────────────────
   * Captura todos los errores no manejados del servidor.
   */
  error_collector: {
    enabled: true,
    ignore_status_codes: [404, 401], // No alertar en estos códigos esperados
    capture_events: true,
    max_event_samples_stored: 100,
  },

  /**
   * ─── BROWSER MONITORING ───────────────────────────────────────────────────
   * Inyecta el agente JS en el HTML para monitorear el cliente (Web Vitals).
   */
  browser_monitoring: {
    enable: true,
    auto_instrument: true,
  },

  /**
   * ─── SLOW TRANSACTIONS (Apdex) ────────────────────────────────────────────
   * T = 500ms → Satisfecho < 500ms | Tolerante < 2000ms | Frustrado > 2000ms
   */
  apdex_t: 0.5,

  /**
   * ─── CUSTOM ATTRIBUTES ────────────────────────────────────────────────────
   * Atributos extra en cada transacción para filtrar en New Relic.
   */
  attributes: {
    enabled: true,
    include: ['request.headers.host', 'request.uri'],
    exclude: ['request.headers.cookie', 'request.headers.authorization'],
  },

  /**
   * ─── REGLAS DE NAMING ─────────────────────────────────────────────────────
   * Agrupa rutas dinámicas de Next.js correctamente en el dashboard.
   */
  rules: {
    name: [
      // Páginas públicas
      { pattern: '^/$',                       name: '/[Homepage]' },
      { pattern: '^/cancha/[^/]+$',           name: '/cancha/[id]' },
      { pattern: '^/tournaments$',            name: '/tournaments' },
      { pattern: '^/schools$',               name: '/schools' },
      { pattern: '^/community$',             name: '/community' },
      { pattern: '^/players$',              name: '/players' },
      { pattern: '^/favorites$',            name: '/favorites' },
      { pattern: '^/reservations$',         name: '/reservations' },
      { pattern: '^/profile$',              name: '/profile' },
      { pattern: '^/settings$',             name: '/settings' },

      // Auth
      { pattern: '^/login$',                  name: '/auth/login' },
      { pattern: '^/register$',               name: '/auth/register' },
      { pattern: '^/register-owner$',         name: '/auth/register-owner' },
      { pattern: '^/forgot-password$',        name: '/auth/forgot-password' },
      { pattern: '^/reset-password$',         name: '/auth/reset-password' },
      { pattern: '^/auth/callback$',          name: '/auth/callback' },

      // Dashboard (Owner)
      { pattern: '^/dashboard$',                  name: '/dashboard/[overview]' },
      { pattern: '^/dashboard/bookings$',         name: '/dashboard/bookings' },
      { pattern: '^/dashboard/pitches$',          name: '/dashboard/pitches' },
      { pattern: '^/dashboard/status$',           name: '/dashboard/status' },
      { pattern: '^/dashboard/schools$',          name: '/dashboard/schools' },
      { pattern: '^/dashboard/whatsapp$',         name: '/dashboard/whatsapp' },

      // API Routes
      { pattern: '^/api/bookings$',               name: 'API /bookings' },
      { pattern: '^/api/bookings/notify-status$', name: 'API /bookings/notify-status' },
      { pattern: '^/api/search-companies$',       name: 'API /search-companies' },
      { pattern: '^/api/tournaments$',            name: 'API /tournaments' },
      { pattern: '^/api/schools$',               name: 'API /schools' },
      { pattern: '^/api/favorites$',             name: 'API /favorites' },
      { pattern: '^/api/generate-status$',       name: 'API /generate-status' },
      { pattern: '^/api/image-proxy$',           name: 'API /image-proxy' },
      { pattern: '^/api/media$',                 name: 'API /media' },
      { pattern: '^/api/upload$',               name: 'API /upload' },
      { pattern: '^/api/upload-school-image$',  name: 'API /upload-school-image' },
      { pattern: '^/api/whatsapp$',             name: 'API /whatsapp' },
      { pattern: '^/api/delete-account$',       name: 'API /delete-account' },
      { pattern: '^/api/community-actions$',    name: 'API /community-actions' },
      { pattern: '^/api/admin-actions$',        name: 'API /admin-actions' },
      { pattern: '^/api/auth$',                 name: 'API /auth' },
      { pattern: '^/api/debug-dashboard$',      name: 'API /debug-dashboard' },
    ],
    ignore: [
      // Ignorar assets estáticos (no relevantes para APM)
      '^/_next/static',
      '^/_next/image',
      '^/favicon',
      '^/icon-',
      '^/apple-icon',
      '^/og-image',
      '^/cancheros\\.png',
      '^/manifest\\.json',
      '^/robots\\.txt',
      '^/sitemap\\.xml',
      '^/loaderio-',
    ],
  },

  /**
   * ─── SLOW QUERIES ─────────────────────────────────────────────────────────
   */
  slow_sql: {
    enabled: true,
    max_samples: 10,
  },

  /**
   * ─── CUSTOM EVENTS ────────────────────────────────────────────────────────
   * Permite enviar eventos custom desde el código (reservas, pagos, etc.)
   */
  custom_insights_events: {
    enabled: true,
    max_samples_stored: 30000,
  },

  /**
   * ─── SEGURIDAD ────────────────────────────────────────────────────────────
   */
  high_security: false,
  allow_all_headers: true,
  ssl: true,
}
