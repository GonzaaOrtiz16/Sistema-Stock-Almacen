import { EventEmitter } from 'events'
import { NETWORK_CHECK_INTERVAL_MS } from '../../../shared/constants'
import log from '../../utils/logger'

// TODO Fase 4: sustituir stub por ping real a Supabase
// Cuando VITE_SUPABASE_URL esté configurado, usar dns.resolve o
// fetch(`${process.env.VITE_SUPABASE_URL}/health`) para detectar conectividad.
export class NetWatcher extends EventEmitter {
  private timer: NodeJS.Timeout | null = null

  start(): void {
    log.debug(`[NetWatcher] stub activo — intervalo ${NETWORK_CHECK_INTERVAL_MS}ms`)
    // No hace ping hasta tener credenciales
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }
}
