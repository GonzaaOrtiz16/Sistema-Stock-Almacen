import log from '../../utils/logger'

// TODO Fase 4: subir .db comprimido a Supabase Storage al cerrar turno
// Si no hay internet, encolar el backup para enviar cuando vuelva la conexión.
export class BackupWorker {
  async backup(dbPath: string): Promise<void> {
    log.debug(`[BackupWorker] stub — pendiente configurar Supabase Storage (${dbPath})`)
  }
}
