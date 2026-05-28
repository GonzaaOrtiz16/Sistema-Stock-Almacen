import { BrowserWindow } from 'electron'
import { IPC, SYNC_INTERVAL_MS } from '../../../shared/constants'
import type { SyncInfo } from '../../../shared/types/sync.types'
import { NetWatcher } from './NetWatcher'
import { PushWorker } from './PushWorker'
import { BackupWorker } from './BackupWorker'
import log from '../../utils/logger'

// ─────────────────────────────────────────────────────────────────────────────
// TODO Fase 4 — Implementación completa del SyncEngine
//
// Para activar el sync con Supabase:
// 1. Crear .env con VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY
// 2. En start(): inicializar createClient(@supabase/supabase-js) con esas variables
// 3. Conectar NetWatcher para detectar conectividad (cada 10s)
// 4. Cuando hay red: lanzar ciclos de PushWorker cada SYNC_INTERVAL_MS
// 5. Notificar al renderer vía notifyRenderer() con SYNC_ONLINE / SYNC_OFFLINE
// 6. En forceSync(): forzar un ciclo inmediato
// ─────────────────────────────────────────────────────────────────────────────

export class SyncEngine {
  private status: SyncInfo = { estado: 'idle', ultimo_sync: null, pendientes: 0 }
  private syncTimer: NodeJS.Timeout | null = null
  readonly netWatcher = new NetWatcher()
  readonly pushWorker = new PushWorker()
  readonly backupWorker = new BackupWorker()

  start(): void {
    const url = process.env.VITE_SUPABASE_URL
    if (!url) {
      log.warn('[SyncEngine] VITE_SUPABASE_URL no configurado — sync deshabilitado')
      log.warn('[SyncEngine] Completar .env para habilitar sincronización con Supabase')
      return
    }

    log.info(`[SyncEngine] Iniciando con intervalo ${SYNC_INTERVAL_MS}ms`)
    this.netWatcher.start()

    // TODO: suscribirse a eventos online/offline del NetWatcher
    // this.netWatcher.on('online', () => this.onOnline())
    // this.netWatcher.on('offline', () => this.onOffline())
  }

  stop(): void {
    if (this.syncTimer) clearInterval(this.syncTimer)
    this.syncTimer = null
    this.netWatcher.stop()
    log.info('[SyncEngine] Detenido')
  }

  async forceSync(): Promise<void> {
    if (!process.env.VITE_SUPABASE_URL) return
    log.debug('[SyncEngine] forceSync — pendiente implementación Fase 4')
  }

  getStatus(): SyncInfo {
    return { ...this.status }
  }

  private notifyRenderer(channel: string, payload?: unknown): void {
    BrowserWindow.getAllWindows().forEach(win => {
      if (!win.isDestroyed()) win.webContents.send(channel, payload)
    })
  }

  // Métodos listos para usar cuando se implemente Fase 4
  private setOnline(): void {
    this.status = { ...this.status, estado: 'online' }
    this.notifyRenderer(IPC.SYNC_ONLINE)
  }

  private setOffline(): void {
    this.status = { ...this.status, estado: 'offline' }
    this.notifyRenderer(IPC.SYNC_OFFLINE)
  }
}
