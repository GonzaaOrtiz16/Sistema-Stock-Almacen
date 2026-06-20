import { create } from 'zustand'
import type { Usuario, TurnoCaja } from '@shared/types/venta.types'

export type AdminPage = 'checkout' | 'inventario' | 'stock' | 'promociones' | 'reportes' | 'usuarios' | 'config'

interface CajaState {
  usuario: Usuario | null
  turnoActivo: TurnoCaja | null
  /** Hay un turno abierto previo (encontrado al loguear) que aún requiere decisión del usuario */
  turnoPendiente: boolean
  adminPage: AdminPage

  setUsuario: (u: Usuario | null) => void
  setTurnoActivo: (t: TurnoCaja | null) => void
  /** Tras login: si hay un turno abierto previo, lo marca como pendiente de decisión */
  cargarTurnoLogin: (t: TurnoCaja | null) => void
  /** El usuario eligió continuar el turno preexistente */
  confirmarTurnoPendiente: () => void
  navigateAdmin: (page: AdminPage) => void
  logout: () => void
}

export const useCajaStore = create<CajaState>((set) => ({
  usuario:        null,
  turnoActivo:    null,
  turnoPendiente: false,
  adminPage:      'checkout',

  setUsuario:    (usuario)      => set({ usuario }),
  // Turno nuevo (apertura) o ya confirmado: queda activo sin pedir decisión
  setTurnoActivo:(turnoActivo)  => set({ turnoActivo, turnoPendiente: false }),
  cargarTurnoLogin: (turno)     => set({ turnoActivo: turno, turnoPendiente: turno !== null }),
  confirmarTurnoPendiente:      () => set({ turnoPendiente: false }),
  navigateAdmin: (adminPage)    => set({ adminPage }),

  logout() {
    set({ usuario: null, turnoActivo: null, turnoPendiente: false, adminPage: 'checkout' })
    window.electronAPI.auth.logout().catch(() => undefined)
  },
}))
