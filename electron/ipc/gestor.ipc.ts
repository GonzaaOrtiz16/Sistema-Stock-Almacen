import { ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import { getDb } from '../db/client'
import { createProductosRepo } from '../db/repositories/productos.repo'
import { createSyncOpsRepo } from '../db/repositories/syncOps.repo'
import { IPC } from '../../shared/constants'
import type {
  GestorCrearInput, GestorSumarStockInput, GestorActualizarInput, Producto,
} from '../../shared/types/producto.types'
import log from '../utils/logger'

// Handlers del Gestor remoto. NO escriben el catálogo definitivo: encolan una orden
// en el outbox local (que un worker sube a Supabase y la Caja ejecuta) y aplican un
// cambio OPTIMISTA en el espejo local para que la UI responda al instante. La verdad
// vuelve después por el catálogo (CatalogPull) y pisa el optimista.
export function registerGestorHandlers(): void {
  const db = getDb()
  const productos = createProductosRepo(db)
  const outbox = createSyncOpsRepo(db)

  ipcMain.handle(IPC.GESTOR_CREAR, (_e, input: GestorCrearInput): Producto => {
    const uuid = randomUUID()
    const stock = input.stock_actual ?? 0
    // Optimista: alta en el espejo local con el mismo uuid que viajará en la orden.
    const prod = productos.crearConUuid(uuid, {
      nombre:        input.nombre,
      precio_venta:  input.precio_venta,
      stock_actual:  stock,
      codigo_barras: input.codigo_barras ?? null,
    })
    outbox.encolar('crear', uuid, {
      uuid,
      nombre:        input.nombre,
      precio_venta:  input.precio_venta,
      stock_actual:  stock,
      codigo_barras: input.codigo_barras ?? null,
    })
    log.info(`[Gestor] crear "${input.nombre}" encolado (uuid ${uuid})`)
    return prod
  })

  ipcMain.handle(IPC.GESTOR_SUMAR_STOCK, (_e, input: GestorSumarStockInput): Producto => {
    const prod = productos.agregarStockPorUuid(input.uuid, input.cantidad)
    if (!prod) throw new Error('Producto no encontrado en el catálogo local')
    outbox.encolar('sumar_stock', input.uuid, { cantidad: input.cantidad })
    log.info(`[Gestor] sumar_stock +${input.cantidad} a ${input.uuid} encolado`)
    return prod
  })

  ipcMain.handle(IPC.GESTOR_ACTUALIZAR, (_e, input: GestorActualizarInput): Producto => {
    const prod = productos.actualizarCamposPorUuid(input.uuid, {
      nombre:       input.nombre,
      precio_venta: input.precio_venta,
    })
    if (!prod) throw new Error('Producto no encontrado en el catálogo local')
    outbox.encolar('actualizar', input.uuid, {
      nombre:       input.nombre,
      precio_venta: input.precio_venta,
    })
    log.info(`[Gestor] actualizar ${input.uuid} encolado`)
    return prod
  })
}
