export const IPC = {
  // Productos
  PRODUCTOS_BUSCAR_BARCODE:   'productos:buscar-barcode',
  PRODUCTOS_BUSCAR_NOMBRE:    'productos:buscar-nombre',
  PRODUCTOS_LISTAR:           'productos:listar',
  PRODUCTOS_CREAR:            'productos:crear',
  PRODUCTOS_ACTUALIZAR:       'productos:actualizar',
  PRODUCTOS_ACTUALIZAR_MASIVO:'productos:actualizar-masivo',

  // Ventas
  VENTAS_CREAR:               'ventas:crear',
  VENTAS_LISTAR_TURNO:        'ventas:listar-turno',
  VENTAS_ANULAR:              'ventas:anular',
  VENTAS_ANULAR_LOCAL:        'ventas:anular-local',

  // Auth + Caja
  AUTH_LISTAR_USUARIOS:       'auth:listar-usuarios',
  AUTH_LOGIN:                 'auth:login',
  AUTH_LOGOUT:                'auth:logout',
  CAJA_ABRIR:                 'caja:abrir',
  CAJA_CERRAR:                'caja:cerrar',
  CAJA_TURNO_ACTIVO:          'caja:turno-activo',
  CAJA_RESUMEN:               'caja:resumen',

  // Sync — invoke (renderer → main)
  SYNC_ESTADO:                'sync:estado',
  SYNC_FORZAR:                'sync:forzar',
  // Sync — push (main → renderer)
  SYNC_ONLINE:                'sync:online',
  SYNC_OFFLINE:               'sync:offline',
  SYNC_PROGRESS:              'sync:progress',

  // Anulaciones (Fase 8)
  ANULACIONES_SOLICITAR_REMOTO: 'anulaciones:solicitar-remoto',
  ANULACIONES_CANCELAR_REMOTO:  'anulaciones:cancelar-remoto',
  ANULACION_APROBADA:           'anulacion:aprobada',   // push main → renderer
  ANULACION_RECHAZADA:          'anulacion:rechazada',  // push main → renderer

  // Reportes (Fase 8)
  REPORTES_RESUMEN:           'reportes:resumen',
  REPORTES_HISTORIAL:         'reportes:historial',
  REPORTES_TOP_PRODUCTOS:     'reportes:top-productos',

  // Updater (Fase 8) — push main → renderer
  UPDATER_AVAILABLE:          'updater:available',
  UPDATER_PROGRESS:           'updater:progress',
  UPDATER_DOWNLOADED:         'updater:downloaded',
  UPDATER_INSTALL:            'updater:install',
} as const

// Escáner de código de barras
export const BARCODE_MIN_CHARS          = 4
export const BARCODE_MAX_CHARS          = 14
export const BARCODE_DEBOUNCE_MS        = 50   // tiempo máximo entre keystrokes del escáner

// Seguridad PIN
export const PIN_LOCKOUT_ATTEMPTS       = 3
export const PIN_LOCKOUT_DURATION_MS    = 5 * 60 * 1000   // 5 min

// Sync
export const SYNC_INTERVAL_MS           = 30 * 1000        // 30 s entre ciclos
export const NETWORK_CHECK_INTERVAL_MS  = 10 * 1000        // 10 s ping
export const SYNC_BATCH_SIZE            = 50               // registros por ciclo por tabla
export const ANULACION_POLL_INTERVAL_MS = 10 * 1000        // 10 s polling aprobación remota
