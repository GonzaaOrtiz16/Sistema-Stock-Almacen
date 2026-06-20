import { ipcMain } from 'electron'
import { getDb } from '../db/client'
import { createPromocionesRepo } from '../db/repositories/promociones.repo'
import { IPC } from '../../shared/constants'
import type { PromocionCreateInput, PromocionUpdateInput } from '../../shared/types/promocion.types'
import log from '../utils/logger'

export function registerPromocionesHandlers(): void {
  const repo = createPromocionesRepo(getDb())

  ipcMain.handle(IPC.PROMOCIONES_LISTAR, () => repo.listar())

  ipcMain.handle(IPC.PROMOCIONES_LISTAR_ACTIVAS, () => repo.listarActivas())

  ipcMain.handle(IPC.PROMOCIONES_CREAR, (_e, input: PromocionCreateInput) => {
    const promo = repo.crear(input)
    log.info(`[IPC] promociones:crear "${promo.nombre}" (${promo.items.length} ítems)`)
    return promo
  })

  ipcMain.handle(IPC.PROMOCIONES_ACTUALIZAR, (_e, input: PromocionUpdateInput) => {
    return repo.actualizar(input)
  })

  ipcMain.handle(IPC.PROMOCIONES_SET_ACTIVA, (_e, id: number, activa: boolean) => {
    return repo.setActiva(id, activa)
  })

  ipcMain.handle(IPC.PROMOCIONES_ELIMINAR, (_e, id: number) => {
    repo.eliminar(id)
    return true
  })
}
