import type { SupabaseClient } from '@supabase/supabase-js'
import type Database from 'better-sqlite3'
import { getDb } from '../../db/client'
import { createProductosRepo } from '../../db/repositories/productos.repo'
import { SYNC_BATCH_SIZE } from '../../../shared/constants'
import type { SyncOp, SyncOpPayload, SyncOpTipo } from '../../../shared/types/sync.types'
import log from '../../utils/logger'

interface FilaOp {
  id: string
  tipo: SyncOpTipo
  producto_uuid: string | null
  payload: SyncOpPayload | null
}

// CAJA: baja las órdenes 'pendiente' de Supabase (sync_ops) y las aplica sobre la
// base local con los repos existentes. Idempotente: registra cada op aplicada en
// la tabla local sync_ops_log, de modo que aunque falle el marcado en Supabase la
// orden no se vuelve a aplicar (clave para 'sumar_stock', que es aditiva).
export class OpsExecutor {
  private readonly repo: ReturnType<typeof createProductosRepo>
  private readonly db: Database.Database
  private readonly stmtYaAplicada: Database.Statement
  private readonly stmtMarcarAplicada: Database.Statement

  constructor(private readonly sb: SupabaseClient) {
    this.db = getDb()
    this.repo = createProductosRepo(this.db)
    this.stmtYaAplicada = this.db.prepare('SELECT 1 FROM sync_ops_log WHERE op_id = ?')
    this.stmtMarcarAplicada = this.db.prepare('INSERT OR IGNORE INTO sync_ops_log (op_id) VALUES (?)')
  }

  // Devuelve cuántas órdenes procesó en este ciclo (0 si no había).
  async run(): Promise<number> {
    const { data, error } = await this.sb
      .from('sync_ops')
      .select('id, tipo, producto_uuid, payload')
      .eq('estado', 'pendiente')
      .order('created_at', { ascending: true })
      .limit(SYNC_BATCH_SIZE)

    if (error) {
      log.error('[OpsExecutor] Error al leer sync_ops:', error.message)
      return 0
    }
    const ops = (data ?? []) as FilaOp[]
    if (ops.length === 0) return 0

    let procesadas = 0
    for (const op of ops) {
      try {
        const yaEstaba = this.stmtYaAplicada.get(op.id) != null
        if (!yaEstaba) {
          this.aplicarLocal(op)
        }
        await this.marcarSupabase(op.id, 'aplicada')
        procesadas++
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        log.error(`[OpsExecutor] Orden ${op.id} (${op.tipo}) falló:`, msg)
        await this.marcarSupabase(op.id, 'error', msg)
      }
    }
    log.info(`[OpsExecutor] ${procesadas} órdenes aplicadas`)
    return procesadas
  }

  // Aplica la mutación y registra la op en el log dentro de UNA transacción local:
  // si la mutación falla, el log queda sin la op (se marcará 'error' en Supabase).
  private aplicarLocal(op: FilaOp): void {
    const tx = this.db.transaction((o: FilaOp) => {
      this.mutar(o)
      this.stmtMarcarAplicada.run(o.id)
    })
    tx(op)
  }

  private mutar(op: FilaOp): void {
    const p = (op.payload ?? {}) as SyncOpPayload

    if (op.tipo === 'crear') {
      const uuid = p.uuid ?? op.producto_uuid
      if (!uuid) throw new Error('crear sin uuid')
      if (!p.nombre || p.precio_venta == null) throw new Error('crear sin nombre/precio')
      // Idempotencia extra: si ya existe ese uuid, no duplicar.
      if (this.repo.buscarPorUuid(uuid)) return
      this.repo.crearConUuid(uuid, {
        codigo_barras: p.codigo_barras ?? null,
        nombre:        p.nombre,
        precio_venta:  p.precio_venta,
        stock_actual:  p.stock_actual ?? 0,
      })
      return
    }

    if (op.tipo === 'sumar_stock') {
      const uuid = op.producto_uuid ?? p.uuid
      if (!uuid) throw new Error('sumar_stock sin uuid')
      const cantidad = Number(p.cantidad)
      if (!Number.isFinite(cantidad) || cantidad === 0) throw new Error('sumar_stock con cantidad inválida')
      const r = this.repo.agregarStockPorUuid(uuid, cantidad)
      if (!r) throw new Error(`producto ${uuid} no encontrado`)
      return
    }

    if (op.tipo === 'actualizar') {
      const uuid = op.producto_uuid ?? p.uuid
      if (!uuid) throw new Error('actualizar sin uuid')
      const r = this.repo.actualizarCamposPorUuid(uuid, {
        nombre:       p.nombre,
        precio_venta: p.precio_venta,
      })
      if (!r) throw new Error(`producto ${uuid} no encontrado`)
      return
    }

    throw new Error(`tipo de orden desconocido: ${op.tipo as string}`)
  }

  private async marcarSupabase(id: string, estado: 'aplicada' | 'error', errorMsg?: string): Promise<void> {
    const { error } = await this.sb
      .from('sync_ops')
      .update({
        estado,
        error_msg: errorMsg ?? null,
        applied_at: new Date().toISOString(),
      })
      .eq('id', id)
    if (error) log.warn(`[OpsExecutor] No se pudo marcar la orden ${id} como ${estado}:`, error.message)
  }
}

// Exportado para que el outbox del Gestor arme el mismo shape de payload.
export type { SyncOp }
