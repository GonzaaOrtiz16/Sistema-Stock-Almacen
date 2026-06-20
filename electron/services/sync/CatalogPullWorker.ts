import type { SupabaseClient } from '@supabase/supabase-js'
import { getDb } from '../../db/client'
import { createProductosRepo } from '../../db/repositories/productos.repo'
import { createConfigRepo } from '../../db/repositories/config.repo'
import { SYNC_BATCH_SIZE } from '../../../shared/constants'
import log from '../../utils/logger'

interface FilaCatalogo {
  uuid: string
  codigo_barras: string | null
  nombre: string
  precio_venta: number
  precio_costo: number | null
  stock_actual: number
  stock_minimo: number
  unidad: string
  activo: boolean
  updated_at: string
}

interface Cursor { ts: string; uuid: string }
const CURSOR_KEY = 'catalog_pull_cursor'
const CURSOR_INICIAL: Cursor = { ts: '1970-01-01T00:00:00Z', uuid: '' }

// GESTOR: baja el catálogo publicado por la Caja (sync_catalogo) y lo refleja en
// la base local para poder buscar/seleccionar productos. Paginación keyset por
// (updated_at, uuid): avanza siempre y no se saltea filas aunque muchas compartan
// el mismo updated_at (típico de una importación masiva). Upsert idempotente.
export class CatalogPullWorker {
  private readonly repo = createProductosRepo(getDb())
  private readonly config = createConfigRepo(getDb())

  constructor(private readonly sb: SupabaseClient) {}

  // Devuelve cuántas filas reflejó en este ciclo (0 si no había novedades).
  async pull(): Promise<number> {
    const cursor = this.leerCursor()

    const { data, error } = await this.sb
      .from('sync_catalogo')
      .select('uuid, codigo_barras, nombre, precio_venta, precio_costo, stock_actual, stock_minimo, unidad, activo, updated_at')
      .or(`updated_at.gt.${cursor.ts},and(updated_at.eq.${cursor.ts},uuid.gt.${cursor.uuid})`)
      .order('updated_at', { ascending: true })
      .order('uuid', { ascending: true })
      .limit(SYNC_BATCH_SIZE)

    if (error) {
      log.error('[CatalogPull] Error al leer catálogo:', error.message)
      return 0
    }
    const filas = (data ?? []) as FilaCatalogo[]
    if (filas.length === 0) return 0

    const guardar = getDb().transaction((rows: FilaCatalogo[]) => {
      for (const f of rows) {
        this.repo.upsertCatalogo({
          uuid:          f.uuid,
          codigo_barras: f.codigo_barras,
          nombre:        f.nombre,
          precio_venta:  Number(f.precio_venta),
          precio_costo:  f.precio_costo != null ? Number(f.precio_costo) : null,
          stock_actual:  Number(f.stock_actual),
          stock_minimo:  Number(f.stock_minimo),
          unidad:        f.unidad,
          activo:        f.activo ? 1 : 0,
          updated_at:    f.updated_at,
        })
      }
    })
    guardar(filas)

    const ultima = filas[filas.length - 1]
    this.guardarCursor({ ts: ultima.updated_at, uuid: ultima.uuid })

    log.info(`[CatalogPull] ${filas.length} productos reflejados desde el catálogo`)
    return filas.length
  }

  private leerCursor(): Cursor {
    const raw = this.config.get(CURSOR_KEY)
    if (!raw) return CURSOR_INICIAL
    try {
      const c = JSON.parse(raw) as Cursor
      return c.ts ? c : CURSOR_INICIAL
    } catch {
      return CURSOR_INICIAL
    }
  }

  private guardarCursor(c: Cursor): void {
    this.config.set(CURSOR_KEY, JSON.stringify(c))
  }
}
