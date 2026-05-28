import { BrowserWindow } from 'electron'
import { getDb } from '../../db/client'
import { createVentasRepo } from '../../db/repositories/ventas.repo'
import {
  validateAdminPin,
  getLockoutStatus,
  recordFailedAttempt,
  clearAttempts,
} from './PinValidator'
import { IPC, ANULACION_POLL_INTERVAL_MS } from '../../../shared/constants'
import log from '../../utils/logger'

export class AnulacionService {
  private pollingTimers = new Map<number, NodeJS.Timeout>()

  // ── Modo offline: valida PIN con bloqueo por intentos ─────────────────────
  async anularConPin(
    ventaId: number,
    solicitanteId: number,
    motivo: string | null,
    pin: string,
  ): Promise<void> {
    const lockout = getLockoutStatus(ventaId)
    if (lockout.locked) {
      const mins = Math.ceil(lockout.remainingMs / 60000)
      throw new Error(`Bloqueado por ${mins} minuto(s). Intentá de nuevo más tarde.`)
    }

    const valid = await validateAdminPin(pin)
    if (!valid) {
      const status = recordFailedAttempt(ventaId)
      if (status.locked) {
        const mins = PIN_LOCKOUT_DURATION_MS / 60000
        throw new Error(`PIN incorrecto. Bloqueado por ${mins} minutos.`)
      }
      throw new Error(`PIN incorrecto. Intentos restantes: ${status.attemptsLeft}`)
    }

    clearAttempts(ventaId)
    createVentasRepo(getDb()).anular(ventaId, solicitanteId, motivo, 'local_pin')
    log.info(`[AnulacionService] Venta ${ventaId} anulada con PIN local`)
  }

  // ── Modo online: marca pendiente e inicia polling ─────────────────────────
  async solicitarRemoto(
    ventaId: number,
    solicitanteId: number,
    motivo: string | null,
  ): Promise<void> {
    createVentasRepo(getDb()).setPendienteAnulacion(ventaId)
    log.info(`[AnulacionService] Venta ${ventaId} marcada pendiente_anulacion — esperando admin`)
    // TODO Fase 4: POST a Supabase tabla anulaciones con modo='remoto'
    this.startPolling(ventaId, solicitanteId, motivo)
  }

  stopPolling(ventaId: number): void {
    const t = this.pollingTimers.get(ventaId)
    if (t) { clearInterval(t); this.pollingTimers.delete(ventaId) }
    // Revertir a 'completada' si el cajero cancela la espera
    try {
      getDb().prepare("UPDATE ventas SET estado = 'completada' WHERE id = ? AND estado = 'pendiente_anulacion'").run(ventaId)
    } catch { /* best-effort */ }
  }

  private startPolling(ventaId: number, solicitanteId: number, motivo: string | null): void {
    if (this.pollingTimers.has(ventaId)) return

    const timer = setInterval(async () => {
      try {
        // TODO Fase 4: consultar Supabase por el estado de la anulación
        // const { data } = await supabase
        //   .from('anulaciones')
        //   .select('estado')
        //   .eq('venta_id', ventaId)
        //   .single()
        // if (data?.estado === 'aprobada') await this.onAprobada(ventaId, solicitanteId, motivo)
        // if (data?.estado === 'rechazada') await this.onRechazada(ventaId)
        log.debug(`[AnulacionService] polling venta ${ventaId} — Supabase pendiente de configurar`)
      } catch (err) {
        log.error('[AnulacionService] Error en polling:', err)
      }
    }, ANULACION_POLL_INTERVAL_MS)

    this.pollingTimers.set(ventaId, timer)
  }

  private async onAprobada(ventaId: number, solicitanteId: number, motivo: string | null): Promise<void> {
    this.stopPolling(ventaId)
    createVentasRepo(getDb()).anular(ventaId, solicitanteId, motivo, 'remoto')
    log.info(`[AnulacionService] Venta ${ventaId} aprobada y anulada remotamente`)
    this.notify(IPC.ANULACION_APROBADA, { ventaId })
  }

  private onRechazada(ventaId: number): void {
    this.stopPolling(ventaId)
    getDb()
      .prepare("UPDATE ventas SET estado = 'completada', sync_status = 'pending' WHERE id = ?")
      .run(ventaId)
    log.info(`[AnulacionService] Venta ${ventaId} rechazada — restaurada a completada`)
    this.notify(IPC.ANULACION_RECHAZADA, { ventaId })
  }

  private notify(channel: string, payload?: unknown): void {
    BrowserWindow.getAllWindows().forEach((w) => {
      if (!w.isDestroyed()) w.webContents.send(channel, payload)
    })
  }
}

let _instance: AnulacionService | null = null
export function getAnulacionService(): AnulacionService {
  if (!_instance) _instance = new AnulacionService()
  return _instance
}
