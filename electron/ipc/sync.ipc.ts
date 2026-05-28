import { ipcMain } from 'electron'
import { IPC } from '../../shared/constants'
import type { SyncEngine } from '../services/sync/SyncEngine'
import type { SyncInfo } from '../../shared/types/sync.types'

export function registerSyncHandlers(syncEngine: SyncEngine): void {
  ipcMain.handle(IPC.SYNC_ESTADO, (): SyncInfo => {
    return syncEngine.getStatus()
  })

  ipcMain.handle(IPC.SYNC_FORZAR, async () => {
    await syncEngine.forceSync()
  })
}
