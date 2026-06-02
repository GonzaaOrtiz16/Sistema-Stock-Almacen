import { ipcMain } from 'electron'
import { IPC } from '../../shared/constants'
import { loadPrinterConfig, savePrinterConfig } from '../services/printer/configStore'
import { listarImpresoras, imprimirTicket } from '../services/printer/TicketPrinter'
import type { PrinterConfig, TicketData } from '../../shared/types/printer.types'
import log from '../utils/logger'

// Ticket de prueba con datos ficticios para verificar la impresora
const TICKET_PRUEBA: TicketData = {
  ventaId: 0,
  fechaISO: new Date().toISOString(),
  cajero: 'Prueba',
  items: [
    { nombre: 'Producto de prueba', cantidad: 2, precio_unitario: 150, subtotal: 300 },
    { nombre: 'Otro artículo', cantidad: 1, precio_unitario: 99.5, subtotal: 99.5 },
  ],
  total: 399.5,
  metodoPago: 'efectivo',
  recibido: 500,
  vuelto: 100.5,
}

export function registerPrinterHandlers(): void {
  // Listar impresoras del sistema
  ipcMain.handle(IPC.PRINTER_LISTAR, async () => {
    try {
      return { ok: true, data: await listarImpresoras() }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  // Leer configuración actual
  ipcMain.handle(IPC.PRINTER_CONFIG_GET, async () => {
    return { ok: true, data: loadPrinterConfig() }
  })

  // Guardar configuración
  ipcMain.handle(IPC.PRINTER_CONFIG_SET, async (_e, config: PrinterConfig) => {
    try {
      savePrinterConfig(config)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  // Imprimir ticket de prueba (usa la config recibida o la guardada)
  ipcMain.handle(IPC.PRINTER_TEST, async (_e, config?: PrinterConfig) => {
    const cfg = config ?? loadPrinterConfig()
    return imprimirTicket(
      { ...TICKET_PRUEBA, fechaISO: new Date().toISOString() },
      cfg,
    )
  })

  // Imprimir el ticket de una venta real. Respeta el flag 'habilitado'.
  ipcMain.handle(IPC.PRINTER_IMPRIMIR_VENTA, async (_e, data: TicketData) => {
    const cfg = loadPrinterConfig()
    if (!cfg.habilitado) {
      log.info('[Printer] Impresión deshabilitada — se omite ticket')
      return { ok: false, error: 'impresion-deshabilitada' }
    }
    return imprimirTicket(data, cfg)
  })

  // Reimpresión manual desde el historial: el usuario la pide explícitamente,
  // así que NO depende del flag de auto-impresión.
  ipcMain.handle(IPC.PRINTER_REIMPRIMIR, async (_e, data: TicketData) => {
    log.info(`[Printer] Reimpresión manual ticket venta=${data.ventaId}`)
    return imprimirTicket(data, loadPrinterConfig())
  })
}
