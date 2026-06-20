import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import log from '../utils/logger'

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (db) return db

  const dbPath = app.isPackaged
    ? join(app.getPath('userData'), 'gabriela.db')
    : join(app.getPath('userData'), 'gabriela-dev.db')

  log.info(`[DB] Abriendo base de datos: ${dbPath}`)

  db = new Database(dbPath)

  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  // FULL (no NORMAL): en un POS la durabilidad importa más que la velocidad.
  // Con NORMAL en modo WAL, las transacciones confirmadas pueden perderse ante
  // un corte de luz o apagado forzado de la PC. Con FULL cada commit se fsync-ea
  // al WAL antes de devolver, así un producto recién guardado nunca se pierde.
  db.pragma('synchronous = FULL')
  // Volcar el WAL a la base principal cada ~200 páginas (~800 KB) para que el
  // archivo .db no quede meses desactualizado y el WAL no crezca sin control.
  db.pragma('wal_autocheckpoint = 200')
  db.pragma('cache_size = -20000') // 20 MB cache

  // Función SQL para búsquedas tolerantes a acentos y mayúsculas:
  // "limon" encuentra "Limón", "MILANESA" encuentra "milanesa", etc.
  db.function('unaccent', { deterministic: true }, (s: unknown) =>
    s == null
      ? ''
      : String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(),
  )

  applyMigrations(db)

  log.info('[DB] Base de datos inicializada correctamente')
  return db
}

// Vuelca el WAL a la base principal. Lo llamamos periódicamente y antes de
// salir para que `gabriela.db` esté siempre al día y nada quede sólo en el WAL.
export function checkpointDb(): void {
  if (!db) return
  try {
    db.pragma('wal_checkpoint(TRUNCATE)')
  } catch (err) {
    log.warn(`[DB] Checkpoint falló: ${(err as Error).message}`)
  }
}

export function closeDb(): void {
  if (db) {
    checkpointDb()
    db.close()
    db = null
    log.info('[DB] Conexión cerrada')
  }
}

function applyMigrations(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      name    TEXT NOT NULL UNIQUE,
      applied TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    )
  `)

  const migrations: Array<{ name: string; sql: string }> = [
    { name: '001_initial', sql: MIGRATION_001 },
    { name: '002_pendientes_codigo', sql: MIGRATION_002 },
    { name: '003_productos_uuid', sql: MIGRATION_003 },
    { name: '004_promociones', sql: MIGRATION_004 },
    { name: '005_sync_ops', sql: MIGRATION_005 },
  ]

  const runMigration = database.transaction((name: string, sql: string) => {
    database.exec(sql)
    database.prepare('INSERT INTO _migrations (name) VALUES (?)').run(name)
  })

  for (const { name, sql } of migrations) {
    const already = database
      .prepare('SELECT id FROM _migrations WHERE name = ?')
      .get(name)

    if (!already) {
      log.info(`[DB] Aplicando migración: ${name}`)
      runMigration(name, sql)
      log.info(`[DB] Migración aplicada: ${name}`)
    }
  }
}

// SQL de migraciones inlineado para evitar dependencias de paths en prod
const MIGRATION_001 = `
CREATE TABLE IF NOT EXISTS categorias (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre      TEXT NOT NULL UNIQUE,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  sync_status TEXT NOT NULL DEFAULT 'pending'
              CHECK(sync_status IN ('pending','synced','error'))
);

CREATE TABLE IF NOT EXISTS productos (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo_barras   TEXT UNIQUE,
  nombre          TEXT NOT NULL,
  precio_venta    REAL NOT NULL,
  precio_costo    REAL,
  stock_actual    REAL NOT NULL DEFAULT 0,
  stock_minimo    REAL NOT NULL DEFAULT 0,
  unidad          TEXT NOT NULL DEFAULT 'unidad'
                  CHECK(unidad IN ('unidad','kg','lt','gr')),
  categoria_id    INTEGER REFERENCES categorias(id),
  activo          INTEGER NOT NULL DEFAULT 1,
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  sync_status     TEXT NOT NULL DEFAULT 'pending'
                  CHECK(sync_status IN ('pending','synced','error')),
  remote_id       TEXT
);

CREATE INDEX IF NOT EXISTS idx_productos_barcode
  ON productos(codigo_barras) WHERE codigo_barras IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_productos_nombre
  ON productos(nombre COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_productos_sync
  ON productos(sync_status) WHERE sync_status != 'synced';

CREATE TABLE IF NOT EXISTS usuarios (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre      TEXT NOT NULL,
  pin_hash    TEXT NOT NULL,
  rol         TEXT NOT NULL DEFAULT 'cajero'
              CHECK(rol IN ('cajero','admin','supervisor')),
  activo      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  sync_status TEXT NOT NULL DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS turnos_caja (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id      INTEGER NOT NULL REFERENCES usuarios(id),
  apertura_ts     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  cierre_ts       TEXT,
  monto_apertura  REAL NOT NULL DEFAULT 0,
  monto_cierre    REAL,
  estado          TEXT NOT NULL DEFAULT 'abierto'
                  CHECK(estado IN ('abierto','cerrado')),
  observaciones   TEXT,
  sync_status     TEXT NOT NULL DEFAULT 'pending'
);

CREATE INDEX IF NOT EXISTS idx_turnos_estado
  ON turnos_caja(estado, apertura_ts DESC);

CREATE TABLE IF NOT EXISTS ventas (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid_local      TEXT NOT NULL UNIQUE
                  DEFAULT (lower(hex(randomblob(16)))),
  turno_id        INTEGER NOT NULL REFERENCES turnos_caja(id),
  usuario_id      INTEGER NOT NULL REFERENCES usuarios(id),
  timestamp       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  subtotal        REAL NOT NULL,
  descuento       REAL NOT NULL DEFAULT 0,
  total           REAL NOT NULL,
  metodo_pago     TEXT NOT NULL
                  CHECK(metodo_pago IN ('efectivo','debito','credito','qr','mixto')),
  monto_recibido  REAL,
  vuelto          REAL,
  estado          TEXT NOT NULL DEFAULT 'completada'
                  CHECK(estado IN ('completada','anulada','pendiente_anulacion')),
  sync_status     TEXT NOT NULL DEFAULT 'pending'
                  CHECK(sync_status IN ('pending','synced','error')),
  remote_id       TEXT
);

CREATE INDEX IF NOT EXISTS idx_ventas_turno
  ON ventas(turno_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_ventas_sync
  ON ventas(sync_status) WHERE sync_status != 'synced';
CREATE INDEX IF NOT EXISTS idx_ventas_timestamp
  ON ventas(timestamp DESC);

CREATE TABLE IF NOT EXISTS detalle_ventas (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  venta_id        INTEGER NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
  producto_id     INTEGER NOT NULL REFERENCES productos(id),
  cantidad        REAL NOT NULL,
  precio_unitario REAL NOT NULL,
  subtotal        REAL NOT NULL,
  descuento_item  REAL NOT NULL DEFAULT 0,
  sync_status     TEXT NOT NULL DEFAULT 'pending'
);

CREATE INDEX IF NOT EXISTS idx_detalle_venta
  ON detalle_ventas(venta_id);

CREATE TABLE IF NOT EXISTS anulaciones (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  venta_id        INTEGER NOT NULL REFERENCES ventas(id),
  solicitante_id  INTEGER NOT NULL REFERENCES usuarios(id),
  motivo          TEXT,
  modo            TEXT NOT NULL CHECK(modo IN ('remoto','local_pin')),
  estado          TEXT NOT NULL DEFAULT 'pendiente'
                  CHECK(estado IN ('pendiente','aprobada','rechazada')),
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  resuelto_at     TEXT,
  sync_status     TEXT NOT NULL DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS config (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);

INSERT OR IGNORE INTO config VALUES ('last_poll_ts', '1970-01-01T00:00:00.000Z');
`

// Códigos escaneados en caja que no existen todavía: quedan "pendientes" para
// darlos de alta después, sin interrumpir la venta. Tabla local (no se sincroniza).
const MIGRATION_002 = `
CREATE TABLE IF NOT EXISTS pendientes_codigo (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo_barras TEXT NOT NULL UNIQUE,
  veces         INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
`

// uuid global para productos: clave estable que identifica al mismo producto en
// las dos PC y en Supabase (los id autoincrement chocarían entre máquinas).
// ALTER ADD COLUMN no admite default no-constante (randomblob), así que se agrega
// la columna vacía, se rellena a todas las filas y recién ahí se hace UNIQUE.
const MIGRATION_003 = `
ALTER TABLE productos ADD COLUMN uuid TEXT;
UPDATE productos SET uuid = lower(hex(randomblob(16))) WHERE uuid IS NULL OR uuid = '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_productos_uuid ON productos(uuid);
`

// Promociones (sección propia). Una promo tiene un precio final y una lista de
// ítems (producto + cantidad). Si tiene un solo ítem es una promo de "varias
// unidades del mismo producto"; si tiene varios, es un combo (ej: 2 cocas + 1
// fernet a $X). En caja se aplica tantas veces como entre en el carrito.
// Sincronización de órdenes entre Caja y Gestor (Etapas 4-5).
//  · sync_ops_log    (CAJA):   ids de órdenes ya ejecutadas → idempotencia, aunque
//                              falle el marcado en Supabase no se reaplican.
//  · sync_ops_outbox (GESTOR): bandeja de salida local de órdenes a enviar a
//                              Supabase; sobrevive a estar sin internet.
const MIGRATION_005 = `
CREATE TABLE IF NOT EXISTS sync_ops_log (
  op_id       TEXT PRIMARY KEY,
  applied_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS sync_ops_outbox (
  id            TEXT PRIMARY KEY,
  tipo          TEXT NOT NULL CHECK(tipo IN ('crear','sumar_stock','actualizar')),
  producto_uuid TEXT,
  payload       TEXT NOT NULL DEFAULT '{}',
  estado        TEXT NOT NULL DEFAULT 'pendiente'
                CHECK(estado IN ('pendiente','enviada')),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_outbox_pendientes
  ON sync_ops_outbox(created_at) WHERE estado = 'pendiente';
`;

const MIGRATION_004 = `
CREATE TABLE IF NOT EXISTS promociones (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid        TEXT NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  nombre      TEXT NOT NULL,
  precio      REAL NOT NULL,
  activa      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  sync_status TEXT NOT NULL DEFAULT 'pending'
              CHECK(sync_status IN ('pending','synced','error'))
);

CREATE TABLE IF NOT EXISTS promocion_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  promocion_id INTEGER NOT NULL REFERENCES promociones(id) ON DELETE CASCADE,
  producto_id  INTEGER NOT NULL REFERENCES productos(id),
  cantidad     REAL NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_promocion_items ON promocion_items(promocion_id);
`
