import { BrowserWindow } from 'electron'
import { IPC, SYNC_INTERVAL_MS, SYNC_BATCH_SIZE } from '../../../shared/constants'
import type { SyncInfo } from '../../../shared/types/sync.types'
import type { AppRole } from '../../../shared/types/app.types'
import { getDb } from '../../db/client'
import { createConfigRepo } from '../../db/repositories/config.repo'
import { getSupabase } from '../supabase'
import { CatalogPushWorker } from './CatalogPushWorker'
import log from '../../utils/logger'

// Orquesta la sincronización de productos por Supabase. Según el rol:
//  · caja   → publica su catálogo (CatalogPushWorker) y (Etapa 5) ejecuta órdenes.
//  · gestor → (Etapa 3) baja el catálogo y (Etapa 4) empuja sus órdenes.
// Corre un ciclo al arrancar y después cada SYNC_INTERVAL_MS.
export class SyncEngine {
  private status: SyncInfo = { estado: 'idle', ultimo_sync: null, pendientes: 0 }
  private timer: NodeJS.Timeout | null = null
  private running = false
  private role: AppRole = 'caja'
  private catalogPush: CatalogPushWorker | null = null

  start(): void {
    const sb = getSupabase()
    if (!sb) {
      log.warn('[SyncEngine] Supabase no configurado (faltan credenciales) — sync deshabilitado')
      return
    }

    this.role = createConfigRepo(getDb()).getRole()
    this.catalogPush = new CatalogPushWorker(sb)
    log.info(`[SyncEngine] Iniciando (rol=${this.role}, intervalo ${SYNC_INTERVAL_MS}ms)`)

    void this.tick()
    this.timer = setInterval(() => void this.tick(), SYNC_INTERVAL_MS)
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null }
    log.info('[SyncEngine] Detenido')
  }

  async forceSync(): Promise<void> {
    await this.tick()
  }

  getStatus(): SyncInfo {
    return { ...this.status }
  }

  // ── Ciclo de sincronización ────────────────────────────────────────────────
  private async tick(): Promise<void> {
    if (this.running || !this.catalogPush) return
    this.running = true
    try {
      this.setSyncing()

      if (this.role === 'caja') {
        // Drenamos por lotes: si un lote vino lleno, quedan más por subir.
        let subidos: number
        do {
          subidos = await this.catalogPush.push()
        } while (subidos >= SYNC_BATCH_SIZE)
        // Etapa 5: await this.opsExecutor.run()
      }
      // Etapas 3/4 (gestor): bajar catálogo + empujar órdenes.

      this.setOnline()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log.error('[SyncEngine] Error en ciclo de sync:', msg)
      this.setOffline(msg)
    } finally {
      this.running = false
    }
  }

  private countPendientes(): number {
    try {
      const row = getDb()
        .prepare("SELECT COUNT(*) AS n FROM productos WHERE sync_status = 'pending'")
        .get() as { n: number }
      return row.n
    } catch {
      return 0
    }
  }

  // ── Estado + notificación al renderer (puntito online/offline) ──────────────
  private setSyncing(): void {
    this.status = { ...this.status, estado: 'syncing' }
    this.notify(IPC.SYNC_PROGRESS, {
      tabla: 'productos',
      total: this.countPendientes(),
      synced: 0,
    })
  }

  private setOnline(): void {
    this.status = {
      estado: 'online',
      ultimo_sync: new Date().toISOString(),
      pendientes: this.countPendientes(),
    }
    this.notify(IPC.SYNC_ONLINE)
  }

  private setOffline(error?: string): void {
    this.status = { ...this.status, estado: 'offline', error }
    this.notify(IPC.SYNC_OFFLINE)
  }

  private notify(channel: string, payload?: unknown): void {
    BrowserWindow.getAllWindows().forEach((w) => {
      if (!w.isDestroyed()) w.webContents.send(channel, payload)
    })
  }
}
