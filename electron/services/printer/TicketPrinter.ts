import { BrowserWindow } from 'electron'
import { buildTicketEscpos } from './escpos'
import { rawPrint } from './rawPrint'
import type {
  PrinterConfig,
  TicketData,
  ImpresoraInfo,
  PrintResult,
} from '../../../shared/types/printer.types'
import log from '../../utils/logger'

// Lista las impresoras instaladas en el sistema (requiere un webContents vivo).
export async function listarImpresoras(): Promise<ImpresoraInfo[]> {
  const win = new BrowserWindow({ show: false })
  try {
    const printers = await win.webContents.getPrintersAsync()
    return printers.map((p) => ({
      name: p.name,
      displayName: p.displayName || p.name,
      isDefault: p.isDefault,
    }))
  } catch (err) {
    log.error('[Printer] Error al listar impresoras:', err)
    return []
  } finally {
    if (!win.isDestroyed()) win.destroy()
  }
}

// Imprime un ticket de venta enviando comandos ESC/POS crudos al driver.
// El driver POS-80C es modo texto/ESC-POS y descarta los trabajos gráficos
// (HTML renderizado por Chromium), por eso se imprime en bytes ESC/POS.
// No lanza: devuelve { ok, error } para que un fallo nunca tumbe la venta.
export async function imprimirTicket(
  data: TicketData,
  config: PrinterConfig,
): Promise<PrintResult> {
  try {
    const bytes = buildTicketEscpos(data, config)
    const result = await rawPrint(config.deviceName, bytes)
    if (result.ok) log.info(`[Printer] Ticket #${data.ventaId} enviado (ESC/POS)`)
    else log.warn(`[Printer] Ticket #${data.ventaId} no impreso: ${result.error}`)
    return result
  } catch (err) {
    const msg = (err as Error).message
    log.error('[Printer] Error al imprimir ticket:', msg)
    return { ok: false, error: msg }
  }
}
