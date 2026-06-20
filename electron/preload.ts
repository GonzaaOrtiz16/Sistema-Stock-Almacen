import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/constants'
import type {
  Producto, ProductoCreateInput, ProductoUpdateInput, ActualizacionMasiva, PendienteCodigo,
  GestorCrearInput, GestorSumarStockInput, GestorActualizarInput,
} from '../shared/types/producto.types'
import type {
  Promocion, PromocionCreateInput, PromocionUpdateInput,
} from '../shared/types/promocion.types'
import type {
  Venta, TurnoCaja, Usuario, CrearVentaInput,
  AnulacionRequest, AnulacionLocal, ResumenTurno, LineaVenta,
  UsuarioCreateInput, UsuarioUpdateInput,
} from '../shared/types/venta.types'
import type { SyncInfo, SyncProgress } from '../shared/types/sync.types'
import type { ResumenPeriodo, VentaDiaria, TopProducto } from '../shared/types/reporte.types'
import type { AppRole } from '../shared/types/app.types'

contextBridge.exposeInMainWorld('electronAPI', {

  productos: {
    buscarBarcode:   (b: string)                  => ipcRenderer.invoke(IPC.PRODUCTOS_BUSCAR_BARCODE,    b) as Promise<Producto | null>,
    buscarNombre:    (n: string)                  => ipcRenderer.invoke(IPC.PRODUCTOS_BUSCAR_NOMBRE,     n) as Promise<Producto[]>,
    listar:          ()                           => ipcRenderer.invoke(IPC.PRODUCTOS_LISTAR)              as Promise<Producto[]>,
    crear:           (i: ProductoCreateInput)     => ipcRenderer.invoke(IPC.PRODUCTOS_CREAR,             i) as Promise<Producto>,
    actualizar:      (i: ProductoUpdateInput)     => ipcRenderer.invoke(IPC.PRODUCTOS_ACTUALIZAR,        i) as Promise<Producto>,
    actualizarMasivo:(i: ActualizacionMasiva)     => ipcRenderer.invoke(IPC.PRODUCTOS_ACTUALIZAR_MASIVO, i) as Promise<number>,
    agregarStock:    (id: number, cantidad: number) => ipcRenderer.invoke(IPC.PRODUCTOS_AGREGAR_STOCK, id, cantidad) as Promise<import('../shared/types/producto.types').Producto>,
    importarExcel:   ()                             => ipcRenderer.invoke(IPC.PRODUCTOS_IMPORTAR_EXCEL) as Promise<{ ok: boolean; importados?: number; error?: string }>,
    pendientesListar:   ()             => ipcRenderer.invoke(IPC.PRODUCTOS_PENDIENTES_LISTAR)          as Promise<PendienteCodigo[]>,
    pendientesAgregar:  (c: string)    => ipcRenderer.invoke(IPC.PRODUCTOS_PENDIENTES_AGREGAR,  c)    as Promise<PendienteCodigo[]>,
    pendientesEliminar: (c: string)    => ipcRenderer.invoke(IPC.PRODUCTOS_PENDIENTES_ELIMINAR, c)    as Promise<PendienteCodigo[]>,
  },

  gestor: {
    crear:       (i: GestorCrearInput)      => ipcRenderer.invoke(IPC.GESTOR_CREAR,       i) as Promise<Producto>,
    sumarStock:  (i: GestorSumarStockInput) => ipcRenderer.invoke(IPC.GESTOR_SUMAR_STOCK, i) as Promise<Producto>,
    actualizar:  (i: GestorActualizarInput) => ipcRenderer.invoke(IPC.GESTOR_ACTUALIZAR,  i) as Promise<Producto>,
  },

  promociones: {
    listar:        ()                          => ipcRenderer.invoke(IPC.PROMOCIONES_LISTAR)              as Promise<Promocion[]>,
    listarActivas: ()                          => ipcRenderer.invoke(IPC.PROMOCIONES_LISTAR_ACTIVAS)      as Promise<Promocion[]>,
    crear:         (i: PromocionCreateInput)   => ipcRenderer.invoke(IPC.PROMOCIONES_CREAR,      i)       as Promise<Promocion>,
    actualizar:    (i: PromocionUpdateInput)   => ipcRenderer.invoke(IPC.PROMOCIONES_ACTUALIZAR, i)       as Promise<Promocion>,
    setActiva:     (id: number, activa: boolean) => ipcRenderer.invoke(IPC.PROMOCIONES_SET_ACTIVA, id, activa) as Promise<Promocion>,
    eliminar:      (id: number)                => ipcRenderer.invoke(IPC.PROMOCIONES_ELIMINAR,   id)      as Promise<boolean>,
  },

  ventas: {
    crear:          (i: CrearVentaInput)   => ipcRenderer.invoke(IPC.VENTAS_CREAR,        i) as Promise<Venta>,
    listarPorTurno: (id: number, incluirAnuladas?: boolean) => ipcRenderer.invoke(IPC.VENTAS_LISTAR_TURNO, id, incluirAnuladas) as Promise<Venta[]>,
    detalle:        (id: number)           => ipcRenderer.invoke(IPC.VENTAS_DETALLE, id) as Promise<LineaVenta[]>,
    anular:         (r: AnulacionRequest)  => ipcRenderer.invoke(IPC.VENTAS_ANULAR,       r) as Promise<void>,
    anularLocal:    (r: AnulacionLocal)    => ipcRenderer.invoke(IPC.VENTAS_ANULAR_LOCAL, r) as Promise<void>,
  },

  caja: {
    abrirTurno:  (uid: number, m: number)                      => ipcRenderer.invoke(IPC.CAJA_ABRIR,        uid, m)    as Promise<TurnoCaja>,
    cerrarTurno: (tid: number, m: number, obs?: string)        => ipcRenderer.invoke(IPC.CAJA_CERRAR,       tid, m, obs) as Promise<TurnoCaja>,
    turnoActivo: (uid: number)                                 => ipcRenderer.invoke(IPC.CAJA_TURNO_ACTIVO, uid)        as Promise<TurnoCaja | null>,
    resumen:     (tid: number)                                 => ipcRenderer.invoke(IPC.CAJA_RESUMEN,      tid)        as Promise<ResumenTurno>,
  },

  auth: {
    listarUsuarios: () => ipcRenderer.invoke(IPC.AUTH_LISTAR_USUARIOS) as Promise<Array<{ id: number; nombre: string; rol: string }>>,
    login:  (pin: string) => ipcRenderer.invoke(IPC.AUTH_LOGIN,  pin) as Promise<Usuario | null>,
    logout: ()            => ipcRenderer.invoke(IPC.AUTH_LOGOUT)      as Promise<void>,
  },

  usuarios: {
    listar:     ()                      => ipcRenderer.invoke(IPC.USUARIOS_LISTAR)         as Promise<Usuario[]>,
    crear:      (i: UsuarioCreateInput) => ipcRenderer.invoke(IPC.USUARIOS_CREAR,      i)  as Promise<Usuario>,
    actualizar: (i: UsuarioUpdateInput) => ipcRenderer.invoke(IPC.USUARIOS_ACTUALIZAR, i)  as Promise<Usuario>,
  },

  printer: {
    listar:        ()                => ipcRenderer.invoke(IPC.PRINTER_LISTAR),
    getConfig:     ()                => ipcRenderer.invoke(IPC.PRINTER_CONFIG_GET),
    setConfig:     (config: unknown) => ipcRenderer.invoke(IPC.PRINTER_CONFIG_SET, config),
    test:          (config?: unknown)=> ipcRenderer.invoke(IPC.PRINTER_TEST, config),
    imprimirVenta: (data: unknown)   => ipcRenderer.invoke(IPC.PRINTER_IMPRIMIR_VENTA, data),
    reimprimir:    (data: unknown)   => ipcRenderer.invoke(IPC.PRINTER_REIMPRIMIR, data),
  },

  anulaciones: {
    solicitarRemoto: (r: AnulacionRequest) => ipcRenderer.invoke(IPC.ANULACIONES_SOLICITAR_REMOTO, r)        as Promise<void>,
    cancelarRemoto:  (id: number)          => ipcRenderer.invoke(IPC.ANULACIONES_CANCELAR_REMOTO,  id)       as Promise<void>,
    onAprobada:  (cb: (d: { ventaId: number }) => void) => {
      ipcRenderer.on(IPC.ANULACION_APROBADA,  (_e, d) => cb(d))
    },
    onRechazada: (cb: (d: { ventaId: number }) => void) => {
      ipcRenderer.on(IPC.ANULACION_RECHAZADA, (_e, d) => cb(d))
    },
    removeListeners: () => {
      ipcRenderer.removeAllListeners(IPC.ANULACION_APROBADA)
      ipcRenderer.removeAllListeners(IPC.ANULACION_RECHAZADA)
    },
  },

  sync: {
    estado:  ()                                        => ipcRenderer.invoke(IPC.SYNC_ESTADO) as Promise<SyncInfo>,
    forzar:  ()                                        => ipcRenderer.invoke(IPC.SYNC_FORZAR) as Promise<void>,
    onOnline:   (cb: () => void)                       => { ipcRenderer.on(IPC.SYNC_ONLINE,   () => cb()) },
    onOffline:  (cb: () => void)                       => { ipcRenderer.on(IPC.SYNC_OFFLINE,  () => cb()) },
    onProgress: (cb: (p: SyncProgress) => void)        => { ipcRenderer.on(IPC.SYNC_PROGRESS, (_e, p: SyncProgress) => cb(p)) },
    removeListeners: () => {
      ipcRenderer.removeAllListeners(IPC.SYNC_ONLINE)
      ipcRenderer.removeAllListeners(IPC.SYNC_OFFLINE)
      ipcRenderer.removeAllListeners(IPC.SYNC_PROGRESS)
    },
  },

  reportes: {
    resumen:       (d: string, h: string) => ipcRenderer.invoke(IPC.REPORTES_RESUMEN,        d, h) as Promise<ResumenPeriodo>,
    historial:     (d: string, h: string) => ipcRenderer.invoke(IPC.REPORTES_HISTORIAL,      d, h) as Promise<VentaDiaria[]>,
    topProductos:  (d: string, h: string) => ipcRenderer.invoke(IPC.REPORTES_TOP_PRODUCTOS,  d, h) as Promise<TopProducto[]>,
  },

  backup: {
    ejecutar: () => ipcRenderer.invoke(IPC.BACKUP_EJECUTAR) as Promise<{ ok: boolean; carpeta?: string; archivos?: string[]; error?: string }>,
  },

  app: {
    getVersion: ()             => ipcRenderer.invoke(IPC.APP_VERSION)        as Promise<string>,
    getRole:    ()             => ipcRenderer.invoke(IPC.APP_GET_ROLE)       as Promise<AppRole>,
    setRole:    (r: AppRole)   => ipcRenderer.invoke(IPC.APP_SET_ROLE, r)    as Promise<AppRole>,
  },

  updater: {
    onAvailable:  (cb: (info: { version: string }) => void) => { ipcRenderer.on(IPC.UPDATER_AVAILABLE,  (_e, i) => cb(i)) },
    onDescargado: (cb: (info: { version: string }) => void) => { ipcRenderer.on(IPC.UPDATER_DOWNLOADED, (_e, i) => cb(i)) },
    onError:      (cb: (info: { message: string }) => void) => { ipcRenderer.on(IPC.UPDATER_ERROR,      (_e, i) => cb(i)) },
    instalar:     () => ipcRenderer.send(IPC.UPDATER_INSTALL),
    removeListeners: () => {
      ipcRenderer.removeAllListeners(IPC.UPDATER_AVAILABLE)
      ipcRenderer.removeAllListeners(IPC.UPDATER_DOWNLOADED)
      ipcRenderer.removeAllListeners(IPC.UPDATER_ERROR)
    },
  },
})
