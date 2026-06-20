import type { SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import { getDb } from '../../db/client'
import { createSyncOpsRepo } from '../../db/repositories/syncOps.repo'
import { createConfigRepo } from '../../db/repositories/config.repo'
import { SYNC_BATCH_SIZE } from '../../../shared/constants'
import log from '../../utils/logger'

// GESTOR: sube las órdenes del outbox local a Supabase (sync_ops). Usa el id del
// outbox como id de la orden en Supabase → upsert idempotente (re-subir la misma
// orden no la duplica). Marca cada una 'enviada' en el outbox al confirmar.
export class OpsPushWorker {
  private readonly outbox = createSyncOpsRepo(getDb())
  private readonly config = createConfigRepo(getDb())

  constructor(private readonly sb: SupabaseClient) {}

  // Identificador estable de esta PC (para saber qué gestor originó cada orden).
  private origen(): string {
    let id = this.config.get('pc_id')
    if (!id) { id = randomUUID(); this.config.set('pc_id', id) }
    return id
  }

  // Devuelve cuántas órdenes envió en este ciclo (0 si no había).
  async push(): Promise<number> {
    const pendientes = this.outbox.pendientes(SYNC_BATCH_SIZE)
    if (pendientes.length === 0) return 0

    const origen = this.origen()
    const payload = pendientes.map((op) => ({
      id:            op.id,
      tipo:          op.tipo,
      producto_uuid: op.producto_uuid,
      payload:       op.payload,
      origen,
    }))

    const { error } = await this.sb.from('sync_ops').upsert(payload, { onConflict: 'id' })
    if (error) {
      log.error('[OpsPush] Error al subir órdenes:', error.message)
      return 0
    }

    for (const op of pendientes) this.outbox.marcarEnviada(op.id)
    log.info(`[OpsPush] ${pendientes.length} órdenes enviadas a Supabase`)
    return pendientes.length
  }
}
