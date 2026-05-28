export type SyncStatus = 'pending' | 'synced' | 'error'
export type SyncEstado = 'online' | 'offline' | 'syncing' | 'idle'

export interface SyncProgress {
  tabla: string
  total: number
  synced: number
}

export interface SyncInfo {
  estado: SyncEstado
  ultimo_sync: string | null
  pendientes: number
  error?: string
}
