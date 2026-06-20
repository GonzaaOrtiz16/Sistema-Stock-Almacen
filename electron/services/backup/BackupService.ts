import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'fs'
import type Database from 'better-sqlite3'
import * as XLSX from 'xlsx'
import { getDb } from '../../db/client'
import log from '../../utils/logger'

// Backup diario automático de TODA la data. Genera dos cosas en
// Documentos\Almacén Gabriela\Backups\<fecha>:
//   1. gabriela_<fecha>.db  → copia completa de la base (permite restaurar todo)
//   2. almacen_<fecha>.xlsx → Excel legible con varias hojas:
//        Resumen · Inventario · Balance diario · Turnos de caja · Ventas ·
//        Detalle de ventas · Productos vendidos · Anulaciones · Usuarios

const RETENTION_DAYS    = 30
const CHECK_INTERVAL_MS  = 6 * 60 * 60 * 1000 // cada 6 h
const TZ_OFFSET_HORAS    = '-3 hours'         // Argentina (UTC-3, sin horario de verano)

export interface BackupResult {
  ok: boolean
  carpeta?: string
  archivos?: string[]
  error?: string
}

function fechaLocal(d = new Date()): string {
  const y   = d.getFullYear()
  const m   = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100
}

export function getBackupDir(): string {
  return join(app.getPath('documents'), 'Almacén Gabriela', 'Backups')
}

// ── Scheduler ────────────────────────────────────────────────────────────────

let timer: ReturnType<typeof setInterval> | null = null

export function startBackupScheduler(): void {
  // Apenas arranca + cada 6 h. Cubre la apertura diaria del almacén y el caso de
  // que la app quede abierta cruzando la medianoche.
  runDailyBackupIfNeeded()
  timer = setInterval(runDailyBackupIfNeeded, CHECK_INTERVAL_MS)
}

export function stopBackupScheduler(): void {
  if (timer) { clearInterval(timer); timer = null }
}

export function runDailyBackupIfNeeded(): void {
  try {
    const hoy = fechaLocal()
    const carpetaHoy = join(getBackupDir(), hoy)
    // Sólo lo damos por hecho si están AMBOS archivos. Si el .db existe pero el
    // Excel falló, hay que reintentar para completar el backup del día.
    const yaHecho =
      existsSync(join(carpetaHoy, `gabriela_${hoy}.db`)) &&
      existsSync(join(carpetaHoy, `almacen_${hoy}.xlsx`))
    if (yaHecho) return

    ejecutarBackup().then((r) => {
      if (r.ok) log.info(`[Backup] Backup diario OK -> ${r.carpeta}`)
      else      log.error(`[Backup] Backup diario falló: ${r.error}`)
    })
  } catch (err) {
    log.error(`[Backup] Error verificando backup diario: ${(err as Error).message}`)
  }
}

// ── Ejecución ────────────────────────────────────────────────────────────────

export async function ejecutarBackup(): Promise<BackupResult> {
  try {
    const db   = getDb()
    const hoy  = fechaLocal()
    const carpeta = join(getBackupDir(), hoy)
    mkdirSync(carpeta, { recursive: true })

    const dbDest   = join(carpeta, `gabriela_${hoy}.db`)
    const xlsxDest = join(carpeta, `almacen_${hoy}.xlsx`)

    // 1) Copia consistente de la base (online backup, seguro aunque esté en WAL)
    await db.backup(dbDest)

    // 2) Excel legible
    construirExcel(db, xlsxDest)

    // 3) Retención: borrar backups más viejos que RETENTION_DAYS
    limpiarAntiguos()

    return { ok: true, carpeta, archivos: [`gabriela_${hoy}.db`, `almacen_${hoy}.xlsx`] }
  } catch (err) {
    log.error(`[Backup] Error ejecutando backup: ${(err as Error).message}`)
    return { ok: false, error: (err as Error).message }
  }
}

function construirExcel(db: Database.Database, destino: string): void {
  const TZ = TZ_OFFSET_HORAS

  // ── Inventario (TODOS los productos, incluso inactivos, por las dudas) ──
  const inventario = db.prepare(`
    SELECT
      p.codigo_barras                                       AS "Código",
      p.nombre                                              AS "Producto",
      c.nombre                                              AS "Categoría",
      p.unidad                                              AS "Unidad",
      p.precio_costo                                        AS "Precio costo",
      p.precio_venta                                        AS "Precio venta",
      p.stock_actual                                        AS "Stock",
      p.stock_minimo                                        AS "Stock mínimo",
      ROUND(COALESCE(p.precio_venta, 0) * p.stock_actual, 2) AS "Valor stock",
      CASE WHEN p.activo = 1 THEN 'Sí' ELSE 'No' END        AS "Activo"
    FROM productos p
    LEFT JOIN categorias c ON c.id = p.categoria_id
    ORDER BY p.activo DESC, p.nombre COLLATE NOCASE
  `).all()

  // ── Balance diario (resumen de ventas por día, con desglose por método) ──
  const balanceDiario = db.prepare(`
    SELECT
      DATE(v.timestamp, '${TZ}')                                        AS "Fecha",
      COUNT(*)                                                          AS "Ventas",
      ROUND(SUM(v.subtotal), 2)                                         AS "Subtotal",
      ROUND(SUM(v.descuento), 2)                                        AS "Descuentos",
      ROUND(SUM(v.total), 2)                                            AS "Total",
      ROUND(SUM(CASE WHEN v.metodo_pago='efectivo' THEN v.total ELSE 0 END), 2) AS "Efectivo",
      ROUND(SUM(CASE WHEN v.metodo_pago='debito'   THEN v.total ELSE 0 END), 2) AS "Débito",
      ROUND(SUM(CASE WHEN v.metodo_pago='credito'  THEN v.total ELSE 0 END), 2) AS "Crédito",
      ROUND(SUM(CASE WHEN v.metodo_pago='qr'       THEN v.total ELSE 0 END), 2) AS "QR",
      ROUND(SUM(CASE WHEN v.metodo_pago='mixto'    THEN v.total ELSE 0 END), 2) AS "Mixto"
    FROM ventas v
    WHERE v.estado = 'completada'
    GROUP BY DATE(v.timestamp, '${TZ}')
    ORDER BY DATE(v.timestamp, '${TZ}') DESC
  `).all()

  // ── Turnos de caja (arqueos: apertura/cierre y montos) ──
  const turnos = db.prepare(`
    SELECT
      t.id                                    AS "N° turno",
      u.nombre                                AS "Cajero",
      DATE(t.apertura_ts, '${TZ}')            AS "Fecha apertura",
      TIME(t.apertura_ts, '${TZ}')            AS "Hora apertura",
      t.monto_apertura                        AS "Monto apertura",
      DATE(t.cierre_ts, '${TZ}')              AS "Fecha cierre",
      TIME(t.cierre_ts, '${TZ}')              AS "Hora cierre",
      t.monto_cierre                          AS "Monto cierre",
      t.estado                                AS "Estado",
      t.observaciones                         AS "Observaciones"
    FROM turnos_caja t
    LEFT JOIN usuarios u ON u.id = t.usuario_id
    ORDER BY t.apertura_ts DESC
  `).all()

  // ── Ventas completadas (hora local AR) ──
  const ventas = db.prepare(`
    SELECT
      v.id                                AS "N° venta",
      DATE(v.timestamp, '${TZ}')          AS "Fecha",
      TIME(v.timestamp, '${TZ}')          AS "Hora",
      u.nombre                            AS "Cajero",
      v.metodo_pago                       AS "Método",
      v.subtotal                          AS "Subtotal",
      v.descuento                         AS "Descuento",
      v.total                             AS "Total"
    FROM ventas v
    LEFT JOIN usuarios u ON u.id = v.usuario_id
    WHERE v.estado = 'completada'
    ORDER BY v.timestamp DESC
  `).all()

  // ── Detalle de ventas (cada renglón vendido) ──
  const detalle = db.prepare(`
    SELECT
      v.id                                       AS "N° venta",
      DATE(v.timestamp, '${TZ}')                 AS "Fecha",
      COALESCE(p.codigo_barras, '')              AS "Código",
      COALESCE(p.nombre, '(producto eliminado)') AS "Producto",
      dv.cantidad                                AS "Cantidad",
      dv.precio_unitario                         AS "Precio unit.",
      dv.descuento_item                          AS "Descuento",
      dv.subtotal                                AS "Subtotal"
    FROM detalle_ventas dv
    JOIN ventas v        ON v.id = dv.venta_id
    LEFT JOIN productos p ON p.id = dv.producto_id
    WHERE v.estado = 'completada'
    ORDER BY v.timestamp DESC, v.id DESC
  `).all()

  // ── Productos más vendidos (ranking histórico) ──
  const masVendidos = db.prepare(`
    SELECT
      COALESCE(p.nombre, '(producto eliminado)') AS "Producto",
      COALESCE(p.codigo_barras, '')              AS "Código",
      ROUND(SUM(dv.cantidad), 2)                 AS "Cantidad vendida",
      ROUND(SUM(dv.subtotal), 2)                 AS "Total vendido"
    FROM detalle_ventas dv
    JOIN ventas v        ON v.id = dv.venta_id
    LEFT JOIN productos p ON p.id = dv.producto_id
    WHERE v.estado = 'completada'
    GROUP BY dv.producto_id
    ORDER BY SUM(dv.cantidad) DESC
  `).all()

  // ── Anulaciones ──
  const anulaciones = db.prepare(`
    SELECT
      a.id                            AS "N°",
      a.venta_id                      AS "N° venta",
      DATE(a.created_at, '${TZ}')     AS "Fecha",
      TIME(a.created_at, '${TZ}')     AS "Hora",
      u.nombre                        AS "Solicitante",
      a.modo                          AS "Modo",
      a.estado                        AS "Estado",
      a.motivo                        AS "Motivo"
    FROM anulaciones a
    LEFT JOIN usuarios u ON u.id = a.solicitante_id
    ORDER BY a.created_at DESC
  `).all()

  // ── Usuarios (sin el hash del PIN) ──
  const usuarios = db.prepare(`
    SELECT
      nombre                       AS "Nombre",
      rol                          AS "Rol",
      CASE WHEN activo = 1 THEN 'Sí' ELSE 'No' END AS "Activo",
      DATE(created_at, '${TZ}')    AS "Alta"
    FROM usuarios
    ORDER BY nombre COLLATE NOCASE
  `).all()

  // ── Resumen ──
  const inv = db.prepare(`
    SELECT
      COUNT(*)                                                  AS productos,
      COALESCE(SUM(COALESCE(precio_venta,0) * stock_actual), 0) AS valor_venta,
      COALESCE(SUM(COALESCE(precio_costo,0) * stock_actual), 0) AS valor_costo,
      COALESCE(SUM(CASE WHEN stock_minimo > 0 AND stock_actual <= stock_minimo THEN 1 ELSE 0 END), 0) AS bajo_minimo,
      COALESCE(SUM(CASE WHEN stock_actual <= 0 THEN 1 ELSE 0 END), 0) AS sin_stock
    FROM productos WHERE activo = 1
  `).get() as {
    productos: number; valor_venta: number; valor_costo: number; bajo_minimo: number; sin_stock: number
  }

  const vtot = db.prepare(`
    SELECT COUNT(*) AS cant, COALESCE(SUM(total), 0) AS total
    FROM ventas WHERE estado = 'completada'
  `).get() as { cant: number; total: number }

  const metodos = db.prepare(`
    SELECT metodo_pago AS metodo, COUNT(*) AS cant, COALESCE(SUM(total), 0) AS total
    FROM ventas WHERE estado = 'completada'
    GROUP BY metodo_pago ORDER BY total DESC
  `).all() as Array<{ metodo: string; cant: number; total: number }>

  const resumen: Array<Array<string | number>> = [
    ['Backup — Almacén Minimercado Gabriela'],
    ['Generado', new Date().toLocaleString('es-AR')],
    [],
    ['INVENTARIO'],
    ['Productos activos', inv.productos],
    ['Valor del stock (a precio de venta)', round2(inv.valor_venta)],
    ['Valor del stock (a costo)', round2(inv.valor_costo)],
    ['Productos bajo el mínimo', inv.bajo_minimo],
    ['Productos sin stock', inv.sin_stock],
    [],
    ['VENTAS (histórico de completadas)'],
    ['Cantidad de ventas', vtot.cant],
    ['Total facturado', round2(vtot.total)],
    [],
    ['VENTAS POR MÉTODO DE PAGO'],
    ['Método', 'Cantidad', 'Total'],
    ...metodos.map((m) => [m.metodo, m.cant, round2(m.total)]),
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumen),        'Resumen')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(inventario),    'Inventario')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(balanceDiario), 'Balance diario')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(turnos),        'Turnos de caja')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ventas),        'Ventas')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalle),       'Detalle de ventas')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(masVendidos),   'Productos vendidos')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(anulaciones),   'Anulaciones')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(usuarios),      'Usuarios')
  // Generamos el .xlsx en memoria y lo escribimos con el fs de Node. NO usar
  // XLSX.writeFile: depende del fs interno de SheetJS, que falla con la app
  // empaquetada (asar) y tira "cannot save file".
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  writeFileSync(destino, buf)
}

function limpiarAntiguos(): void {
  try {
    const dir = getBackupDir()
    if (!existsSync(dir)) return

    const carpetas = readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(e.name))
      .map((e) => e.name)
      .sort() // ascendente: las fechas ISO ordenan cronológicamente

    const sobran = carpetas.length - RETENTION_DAYS
    if (sobran <= 0) return

    for (const nombre of carpetas.slice(0, sobran)) {
      rmSync(join(dir, nombre), { recursive: true, force: true })
      log.info(`[Backup] Backup antiguo eliminado: ${nombre}`)
    }
  } catch (err) {
    log.warn(`[Backup] No se pudieron limpiar backups antiguos: ${(err as Error).message}`)
  }
}
