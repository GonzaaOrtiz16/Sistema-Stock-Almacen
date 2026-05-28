import { SYNC_BATCH_SIZE } from '../../../shared/constants'
import log from '../../utils/logger'

// TODO Fase 4: implementar push real a Supabase
// Orden de sync: ventas → detalle_ventas → productos → turnos_caja → anulaciones
// Usar upsert con onConflict en uuid_local / codigo_barras según la tabla.
// Batch size: SYNC_BATCH_SIZE registros por ciclo.
export class PushWorker {
  async push(): Promise<number> {
    log.debug(`[PushWorker] stub — batch size ${SYNC_BATCH_SIZE}`)
    return 0
  }
}
