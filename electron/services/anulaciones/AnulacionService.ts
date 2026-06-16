import { BrowserWindow } from 'electron'
import { createClient } from '@supabase/supabase-js'
import WebSocket from 'ws'
import { getDb } from '../../db/client'
import { createVentasRepo } from '../../db/repositories/ventas.repo'
import {
  validateAdminPin,
  getLockoutStatus,
  recordFailedAttempt,
  clearAttempts,
} from './PinValidator'
import { IPC, ANULACION_POLL_INTERVAL_MS, PIN_LOCKOUT_DURATION_MS } from '../../../shared/constants'
import log from '../../utils/logger'

function makeClient() {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: false },
    // Electron empaqueta Node 20, que no trae WebSocket nativo. supabase-js
    // crea un cliente Realtime que falla al conectar sin él; le pasamos `ws`
    // como transporte para evitarlo (este servicio solo usa REST + Edge Functions).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    realtime: { transport: WebSocket as any },
  })
}

export class AnulacionService {
  private pollingTimers = new Map<number, NodeJS.Timeout>()
  private remoteUuids   = new Map<number, string>()   // ventaId → uuid en Supabase
  private sb = makeClient()

  // ── PIN local (también cancela el remoto si estaba activo) ────────────────
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

    // Invalidar solicitud remota si había una activa (invalida los botones de email/Telegram)
    this.stopPolling(ventaId)
    const uuid = this.remoteUuids.get(ventaId)
    if (uuid) {
      this.remoteUuids.delete(ventaId)
      void this.invocarResolver(uuid, 'aprobada')
    }
  }

  // ── Remoto: sube a Supabase e inicia polling ──────────────────────────────
  async solicitarRemoto(
    ventaId: number,
    solicitanteId: number,
    motivo: string | null,
  ): Promise<void> {
    createVentasRepo(getDb()).setPendienteAnulacion(ventaId)

    if (!this.sb) {
      log.warn('[AnulacionService] Supabase no configurado — solo PIN local disponible')
      return
    }

    const db      = getDb()
    const venta   = db.prepare('SELECT * FROM ventas WHERE id = ?').get(ventaId) as Record<string, unknown>
    const usuario = db.prepare('SELECT nombre FROM usuarios WHERE id = ?').get(solicitanteId) as { nombre: string } | undefined
    const items   = db.prepare(`
      SELECT COALESCE(p.nombre, '(producto eliminado)') AS nombre,
             dv.cantidad, dv.subtotal
      FROM detalle_ventas dv
      LEFT JOIN productos p ON p.id = dv.producto_id
      WHERE dv.venta_id = ?
    `).all(ventaId) as Array<{ nombre: string; cantidad: number; subtotal: number }>

    const { data, error } = await this.sb
      .from('anulaciones')
      .insert({
        venta_uuid:  venta.uuid_local,
        total:       venta.total,
        venta_ts:    venta.timestamp,
        metodo_pago: venta.metodo_pago,
        cajero:      usuario?.nombre ?? 'Cajero',
        motivo,
        items,
        estado:      'pendiente',
      })
      .select('id')
      .single()

    if (error) {
      log.error('[AnulacionService] Error insertando en Supabase:', error.message)
    } else {
      this.remoteUuids.set(ventaId, data.id)
      log.info(`[AnulacionService] Solicitud enviada a Supabase id=${data.id}`)
    }

    this.startPolling(ventaId, solicitanteId, motivo)
  }

  // Cajero cancela la espera: detiene polling e invalida el registro en Supabase
  async cancelar(ventaId: number): Promise<void> {
    const uuid = this.remoteUuids.get(ventaId)
    this.stopPolling(ventaId)
    if (uuid) {
      this.remoteUuids.delete(ventaId)
      await this.invocarResolver(uuid, 'rechazada')
    }
  }

  stopPolling(ventaId: number): void {
    const t = this.pollingTimers.get(ventaId)
    if (t) { clearInterval(t); this.pollingTimers.delete(ventaId) }
    try {
      getDb()
        .prepare("UPDATE ventas SET estado = 'completada' WHERE id = ? AND estado = 'pendiente_anulacion'")
        .run(ventaId)
    } catch { /* best-effort */ }
  }

  private startPolling(ventaId: number, solicitanteId: number, motivo: string | null): void {
    if (this.pollingTimers.has(ventaId)) return

    const timer = setInterval(async () => {
      const uuid = this.remoteUuids.get(ventaId)
      if (!uuid || !this.sb) return

      try {
        const { data, error } = await this.sb
          .from('anulaciones')
          .select('estado')
          .eq('id', uuid)
          .single()

        if (error) { log.warn('[AnulacionService] Poll error:', error.message); return }

        if (data?.estado === 'aprobada') {
          this.remoteUuids.delete(ventaId)
          await this.onAprobada(ventaId, solicitanteId, motivo)
        } else if (data?.estado === 'rechazada') {
          this.remoteUuids.delete(ventaId)
          this.onRechazada(ventaId)
        }
      } catch (err) {
        log.error('[AnulacionService] Error en polling:', err)
      }
    }, ANULACION_POLL_INTERVAL_MS)

    this.pollingTimers.set(ventaId, timer)
  }

  private async onAprobada(ventaId: number, solicitanteId: number, motivo: string | null): Promise<void> {
    this.stopPolling(ventaId)
    try {
      createVentasRepo(getDb()).anular(ventaId, solicitanteId, motivo, 'remoto')
    } catch {
      // La venta ya fue anulada localmente con PIN — no es un error
      log.info(`[AnulacionService] Venta ${ventaId} ya anulada localmente, ignorando aprobación remota`)
      return
    }
    log.info(`[AnulacionService] Venta ${ventaId} aprobada remotamente`)
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

  private async invocarResolver(uuid: string, estado: 'aprobada' | 'rechazada'): Promise<void> {
    if (!this.sb) return
    const { error } = await this.sb.functions.invoke('resolver', {
      body: { id: uuid, estado },
    })
    if (error) log.warn('[AnulacionService] resolver error:', error.message)
    else log.info(`[AnulacionService] Supabase invalidado → ${estado}`)
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
