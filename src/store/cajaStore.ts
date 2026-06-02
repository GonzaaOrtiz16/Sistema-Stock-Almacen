import { create } from 'zustand'
import type { Usuario, TurnoCaja } from '@shared/types/venta.types'

export type AdminPage = 'checkout' | 'inventario' | 'reportes' | 'config'

interface CajaState {
  usuario: Usuario | null
  turnoActivo: TurnoCaja | null
  adminPage: AdminPage

  setUsuario: (u: Usuario | null) => void
  setTurnoActivo: (t: TurnoCaja | null) => void
  navigateAdmin: (page: AdminPage) => void
  logout: () => void
}

export const useCajaStore = create<CajaState>((set) => ({
  usuario:      null,
  turnoActivo:  null,
  adminPage:    'checkout',

  setUsuario:    (usuario)      => set({ usuario }),
  setTurnoActivo:(turnoActivo)  => set({ turnoActivo }),
  navigateAdmin: (adminPage)    => set({ adminPage }),

  logout() {
    set({ usuario: null, turnoActivo: null, adminPage: 'checkout' })
    window.electronAPI.auth.logout().catch(() => undefined)
  },
}))
