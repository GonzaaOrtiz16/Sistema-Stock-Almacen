import { useSyncStore } from '../store/syncStore'

export function useNetworkStatus(): boolean {
  const estado = useSyncStore((s) => s.info.estado)
  return estado === 'online' || estado === 'syncing'
}
