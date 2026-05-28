import type {
  Producto, ProductoCreateInput, ProductoUpdateInput, ActualizacionMasiva,
} from '../shared/types/producto.types'
import type {
  Venta, TurnoCaja, Usuario, CrearVentaInput,
  AnulacionRequest, AnulacionLocal, ResumenTurno,
} from '../shared/types/venta.types'
import type { SyncInfo, SyncProgress } from '../shared/types/sync.types'
import type { ResumenPeriodo, VentaDiaria, TopProducto } from '../shared/types/reporte.types'

declare global {
  interface Window {
    electronAPI: {
      productos: {
        buscarBarcode:    (barcode: string)             => Promise<Producto | null>
        buscarNombre:     (nombre: string)              => Promise<Producto[]>
        listar:           ()                            => Promise<Producto[]>
        crear:            (i: ProductoCreateInput)      => Promise<Producto>
        actualizar:       (i: ProductoUpdateInput)      => Promise<Producto>
        actualizarMasivo: (i: ActualizacionMasiva)      => Promise<number>
      }
      ventas: {
        crear:          (i: CrearVentaInput)    => Promise<Venta>
        listarPorTurno: (turno_id: number)      => Promise<Venta[]>
        anular:         (r: AnulacionRequest)   => Promise<void>
        anularLocal:    (r: AnulacionLocal)     => Promise<void>
      }
      caja: {
        abrirTurno:  (uid: number, monto: number)                      => Promise<TurnoCaja>
        cerrarTurno: (tid: number, monto: number, obs?: string)        => Promise<TurnoCaja>
        turnoActivo: (uid: number)                                     => Promise<TurnoCaja | null>
        resumen:     (tid: number)                                     => Promise<ResumenTurno>
      }
      auth: {
        listarUsuarios: () => Promise<Array<{ id: number; nombre: string; rol: string }>>
        login:  (pin: string)  => Promise<Usuario | null>
        logout: ()             => Promise<void>
      }
      anulaciones: {
        solicitarRemoto: (r: AnulacionRequest)                          => Promise<void>
        cancelarRemoto:  (ventaId: number)                              => Promise<void>
        onAprobada:      (cb: (d: { ventaId: number }) => void)         => void
        onRechazada:     (cb: (d: { ventaId: number }) => void)         => void
        removeListeners: ()                                             => void
      }
      sync: {
        estado:          ()                                    => Promise<SyncInfo>
        forzar:          ()                                    => Promise<void>
        onOnline:        (cb: () => void)                      => void
        onOffline:       (cb: () => void)                      => void
        onProgress:      (cb: (p: SyncProgress) => void)      => void
        removeListeners: ()                                    => void
      }
      reportes: {
        resumen:      (desde: string, hasta: string) => Promise<ResumenPeriodo>
        historial:    (desde: string, hasta: string) => Promise<VentaDiaria[]>
        topProductos: (desde: string, hasta: string) => Promise<TopProducto[]>
      }
      updater: {
        onAvailable:     (cb: (info: { version: string }) => void) => void
        onDescargado:    (cb: (info: { version: string }) => void) => void
        instalar:        ()                                        => void
        removeListeners: ()                                        => void
      }
    }
  }
}

export {}
