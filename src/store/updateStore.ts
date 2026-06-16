import { create } from 'zustand'

// Estado global de versión y actualizaciones. Se llena una sola vez desde App
// (versión actual + eventos del auto-updater) y lo consumen VersionBadge y
// UpdateBanner sin pisarse los listeners de IPC.
type Fase = 'idle' | 'descargando' | 'listo'

interface UpdateState {
  version: string                 // versión instalada actualmente (ej. "1.0.7")
  fase: Fase                      // estado de la actualización
  nuevaVersion: string | null     // versión disponible cuando hay update
  setVersion: (v: string) => void
  setDescargando: (v: string) => void
  setListo: (v: string) => void
}

export const useUpdateStore = create<UpdateState>((set) => ({
  version: '',
  fase: 'idle',
  nuevaVersion: null,
  setVersion: (version) => set({ version }),
  setDescargando: (nuevaVersion) => set({ fase: 'descargando', nuevaVersion }),
  setListo: (nuevaVersion) => set({ fase: 'listo', nuevaVersion }),
}))
