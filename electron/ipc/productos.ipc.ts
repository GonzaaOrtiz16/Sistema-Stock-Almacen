import { ipcMain } from 'electron'
import { getDb } from '../db/client'
import { createProductosRepo } from '../db/repositories/productos.repo'
import { IPC } from '../../shared/constants'
import type { ProductoCreateInput, ProductoUpdateInput, ActualizacionMasiva } from '../../shared/types/producto.types'
import log from '../utils/logger'

export function registerProductosHandlers(): void {
  const repo = createProductosRepo(getDb())

  ipcMain.handle(IPC.PRODUCTOS_BUSCAR_BARCODE, (_e, barcode: string) => {
    return repo.buscarPorBarcode(barcode)
  })

  ipcMain.handle(IPC.PRODUCTOS_BUSCAR_NOMBRE, (_e, nombre: string) => {
    return repo.buscarPorNombre(nombre)
  })

  ipcMain.handle(IPC.PRODUCTOS_LISTAR, () => {
    return repo.listar()
  })

  ipcMain.handle(IPC.PRODUCTOS_CREAR, (_e, input: ProductoCreateInput) => {
    return repo.crear(input)
  })

  ipcMain.handle(IPC.PRODUCTOS_ACTUALIZAR, (_e, input: ProductoUpdateInput) => {
    return repo.actualizar(input)
  })

  ipcMain.handle(IPC.PRODUCTOS_ACTUALIZAR_MASIVO, (_e, input: ActualizacionMasiva) => {
    const affected = repo.actualizarPreciosMasivo(input)
    log.info(`[IPC] actualizar-masivo: ${affected} productos afectados (${input.tipo}, ${input.porcentaje}%)`)
    return affected
  })
}
