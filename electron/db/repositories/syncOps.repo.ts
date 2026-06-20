import type Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import type { SyncOp, SyncOpPayload, SyncOpTipo } from '../../../shared/types/sync.types'

// Bandeja de salida local del Gestor (sync_ops_outbox). Las órdenes se guardan acá
// primero (sobrevive a estar sin internet) y un worker las sube a Supabase.
export type SyncOpsRepo = ReturnType<typeof createSyncOpsRepo>

export function createSyncOpsRepo(db: Database.Database) {
  const stmtInsert = db.prepare(`
    INSERT INTO sync_ops_outbox (id, tipo, producto_uuid, payload)
    VALUES (@id, @tipo, @producto_uuid, @payload)
  `)
  const stmtPendientes = db.prepare(
    "SELECT id, tipo, producto_uuid, payload FROM sync_ops_outbox WHERE estado = 'pendiente' ORDER BY created_at LIMIT ?",
  )
  const stmtMarcarEnviada = db.prepare("UPDATE sync_ops_outbox SET estado = 'enviada' WHERE id = ?")
  const stmtCount = db.prepare("SELECT COUNT(*) AS n FROM sync_ops_outbox WHERE estado = 'pendiente'")

  return {
    // Encola una orden y devuelve su id.
    encolar(tipo: SyncOpTipo, producto_uuid: string | null, payload: SyncOpPayload): string {
      const id = randomUUID()
      stmtInsert.run({ id, tipo, producto_uuid, payload: JSON.stringify(payload) })
      return id
    },

    pendientes(limit: number): SyncOp[] {
      const rows = stmtPendientes.all(limit) as Array<{
        id: string; tipo: SyncOpTipo; producto_uuid: string | null; payload: string
      }>
      return rows.map((r) => ({
        id: r.id,
        tipo: r.tipo,
        producto_uuid: r.producto_uuid,
        payload: safeParse(r.payload),
      }))
    },

    marcarEnviada(id: string): void {
      stmtMarcarEnviada.run(id)
    },

    countPendientes(): number {
      return (stmtCount.get() as { n: number }).n
    },
  }
}

function safeParse(s: string): SyncOpPayload {
  try { return JSON.parse(s) as SyncOpPayload } catch { return {} }
}
