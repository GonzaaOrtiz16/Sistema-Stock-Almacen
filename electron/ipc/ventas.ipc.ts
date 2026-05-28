import { ipcMain } from 'electron'
import { getDb } from '../db/client'
import { createVentasRepo } from '../db/repositories/ventas.repo'
import { getAnulacionService } from '../services/anulaciones/AnulacionService'
import { IPC } from '../../shared/constants'
import type { CrearVentaInput, AnulacionRequest, AnulacionLocal } from '../../shared/types/venta.types'
import log from '../utils/logger'

export function registerVentasHandlers(): void {
  const repo = createVentasRepo(getDb())

  ipcMain.handle(IPC.VENTAS_CREAR, (_e, input: CrearVentaInput) => {
    const venta = repo.crear(input)
    log.info(`[IPC] venta creada id=${venta.id} total=${venta.total} metodo=${venta.metodo_pago}`)
    return venta
  })

  ipcMain.handle(IPC.VENTAS_LISTAR_TURNO, (_e, turno_id: number) => {
    return repo.listarPorTurno(turno_id)
  })

  // Usado cuando la anulación ya fue aprobada (remotamente por el admin)
  ipcMain.handle(IPC.VENTAS_ANULAR, (_e, request: AnulacionRequest) => {
    repo.anular(request.venta_id, request.solicitante_id, request.motivo ?? null, 'remoto')
    log.info(`[IPC] venta anulada id=${request.venta_id}`)
  })

  // Modo offline: valida PIN con bloqueo — delega en AnulacionService
  ipcMain.handle(IPC.VENTAS_ANULAR_LOCAL, async (_e, request: AnulacionLocal) => {
    await getAnulacionService().anularConPin(
      request.venta_id,
      request.solicitante_id,
      request.motivo ?? null,
      request.pin_admin,
    )
    log.info(`[IPC] venta anulada local id=${request.venta_id}`)
  })

  // Modo online: marca pendiente e inicia polling
  ipcMain.handle(IPC.ANULACIONES_SOLICITAR_REMOTO, async (_e, request: AnulacionRequest) => {
    await getAnulacionService().solicitarRemoto(
      request.venta_id,
      request.solicitante_id,
      request.motivo ?? null,
    )
  })

  // Cajero cancela la espera de aprobación
  ipcMain.handle(IPC.ANULACIONES_CANCELAR_REMOTO, (_e, ventaId: number) => {
    getAnulacionService().stopPolling(ventaId)
    log.info(`[IPC] anulación remota cancelada venta=${ventaId}`)
  })
}
