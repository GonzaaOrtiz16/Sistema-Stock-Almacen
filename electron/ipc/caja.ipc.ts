import { ipcMain } from 'electron'
import { getDb } from '../db/client'
import { createCajaRepo } from '../db/repositories/caja.repo'
import { IPC } from '../../shared/constants'
import type { Usuario } from '../../shared/types/venta.types'
import log from '../utils/logger'

export function registerCajaHandlers(): void {
  const repo = createCajaRepo(getDb())

  // ── Auth ─────────────────────────────────────────────────────────────────

  ipcMain.handle(IPC.AUTH_LISTAR_USUARIOS, () => {
    return getDb()
      .prepare('SELECT id, nombre, rol FROM usuarios WHERE activo = 1 ORDER BY nombre')
      .all()
  })

  ipcMain.handle(IPC.AUTH_LOGIN, async (_e, pin: string): Promise<Usuario | null> => {
    const bcrypt = await import('bcrypt')
    const usuarios = repo.listarUsuariosActivos()

    for (const u of usuarios) {
      if (await bcrypt.compare(pin, u.pin_hash)) {
        log.info(`[IPC] login OK usuario="${u.nombre}" rol=${u.rol}`)
        // Devolver usuario SIN pin_hash
        return { id: u.id, nombre: u.nombre, rol: u.rol as Usuario['rol'], activo: u.activo, created_at: u.created_at }
      }
    }

    log.warn('[IPC] login fallido (PIN incorrecto)')
    return null
  })

  ipcMain.handle(IPC.AUTH_LOGOUT, (_e) => {
    log.info('[IPC] logout')
  })

  // ── Caja ─────────────────────────────────────────────────────────────────

  ipcMain.handle(IPC.CAJA_ABRIR, (_e, usuario_id: number, monto_apertura: number) => {
    const turno = repo.abrirTurno(usuario_id, monto_apertura)
    log.info(`[IPC] turno abierto id=${turno.id} usuario=${usuario_id} apertura=$${monto_apertura}`)
    return turno
  })

  ipcMain.handle(IPC.CAJA_CERRAR, (_e, turno_id: number, monto_cierre: number, observaciones?: string) => {
    const turno = repo.cerrarTurno(turno_id, monto_cierre, observaciones)
    log.info(`[IPC] turno cerrado id=${turno_id} cierre=$${monto_cierre}`)
    return turno
  })

  ipcMain.handle(IPC.CAJA_TURNO_ACTIVO, (_e, usuario_id: number) => {
    return repo.turnoActivo(usuario_id)
  })

  ipcMain.handle(IPC.CAJA_RESUMEN, (_e, turno_id: number) => {
    return repo.resumenTurno(turno_id)
  })
}
