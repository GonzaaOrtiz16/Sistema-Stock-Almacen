import type { SupabaseClient } from '@supabase/supabase-js'
import { getDb } from '../../db/client'
import { SYNC_BATCH_SIZE } from '../../../shared/constants'
import log from '../../utils/logger'

// Publica el catálogo de la caja (única dueña) a Supabase. Sube los productos
// marcados `sync_status='pending'` a la tabla `sync_catalogo` (upsert por uuid)
// y los marca `synced`. El gestor remoto lee esa tabla para ver los productos.
interface FilaProducto {
  uuid: string
  codigo_barras: string | null
  nombre: string
  precio_venta: number
  precio_costo: number | null
  stock_actual: number
  stock_minimo: number
  unidad: string
  activo: number
  updated_at: string
}

export class CatalogPushWorker {
  constructor(private readonly sb: SupabaseClient) {}

  // Devuelve cuántos productos publicó en este ciclo (0 si no había nada).
  async push(): Promise<number> {
    const db = getDb()

    const filas = db
      .prepare(
        `SELECT uuid, codigo_barras, nombre, precio_venta, precio_costo,
                stock_actual, stock_minimo, unidad, activo, updated_at
         FROM productos
         WHERE sync_status = 'pending' AND uuid IS NOT NULL
         ORDER BY updated_at
         LIMIT ?`,
      )
      .all(SYNC_BATCH_SIZE) as FilaProducto[]

    if (filas.length === 0) return 0

    const payload = filas.map((f) => ({
      uuid:          f.uuid,
      codigo_barras: f.codigo_barras,
      nombre:        f.nombre,
      precio_venta:  f.precio_venta,
      precio_costo:  f.precio_costo,
      stock_actual:  f.stock_actual,
      stock_minimo:  f.stock_minimo,
      unidad:        f.unidad,
      activo:        f.activo === 1,
      updated_at:    f.updated_at,
    }))

    const { error } = await this.sb
      .from('sync_catalogo')
      .upsert(payload, { onConflict: 'uuid' })

    if (error) {
      log.error('[CatalogPush] Error al subir catálogo:', error.message)
      return 0
    }

    // Marcamos synced SOLO las filas que no cambiaron mientras subíamos (la subida
    // es async y entremedio puede entrar una venta que vuelva a tocar el stock).
    // El guard por updated_at deja esas filas en 'pending' para el próximo ciclo.
    const marcar = db.prepare(
      `UPDATE productos SET sync_status = 'synced'
       WHERE uuid = @uuid AND updated_at = @updated_at AND sync_status = 'pending'`,
    )
    const marcarTodas = db.transaction((fs: FilaProducto[]) => {
      for (const f of fs) marcar.run({ uuid: f.uuid, updated_at: f.updated_at })
    })
    marcarTodas(filas)

    log.info(`[CatalogPush] ${filas.length} productos publicados a Supabase`)
    return filas.length
  }
}
