import { create } from 'zustand'
import type { SyncInfo } from '@shared/types/sync.types'

interface SyncState {
  info: SyncInfo
  setInfo: (info: Partial<SyncInfo>) => void
}

export const useSyncStore = create<SyncState>((set) => ({
  info: { estado: 'idle', ultimo_sync: null, pendientes: 0 },
  setInfo: (partial) => set((s) => ({ info: { ...s.info, ...partial } })),
}))
