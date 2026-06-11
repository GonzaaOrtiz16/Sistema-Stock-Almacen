import { ipcMain } from 'electron'
import { getDb } from '../db/client'
import { createUsuariosRepo } from '../db/repositories/usuarios.repo'
import { IPC } from '../../shared/constants'
import type { UsuarioCreateInput, UsuarioUpdateInput } from '../../shared/types/venta.types'
import log from '../utils/logger'

export function registerUsuariosHandlers(): void {
  const repo = createUsuariosRepo(getDb())

  ipcMain.handle(IPC.USUARIOS_LISTAR, () => {
    return repo.listar()
  })

  ipcMain.handle(IPC.USUARIOS_CREAR, (_e, input: UsuarioCreateInput) => {
    const u = repo.crear(input)
    log.info(`[IPC] usuario creado id=${u.id} nombre="${u.nombre}" rol=${u.rol}`)
    return u
  })

  ipcMain.handle(IPC.USUARIOS_ACTUALIZAR, (_e, input: UsuarioUpdateInput) => {
    const u = repo.actualizar(input)
    log.info(`[IPC] usuario actualizado id=${u.id} nombre="${u.nombre}"`)
    return u
  })
}
