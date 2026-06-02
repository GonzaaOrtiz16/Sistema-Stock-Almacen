import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { DEFAULT_PRINTER_CONFIG, type PrinterConfig } from '../../../shared/types/printer.types'
import log from '../../utils/logger'

// Persistencia simple de la configuración de impresora en un JSON dentro de userData.
// Se evita una tabla SQLite/migración: es config de la instalación, no dato de negocio.

function configPath(): string {
  return join(app.getPath('userData'), 'printer-config.json')
}

export function loadPrinterConfig(): PrinterConfig {
  try {
    const path = configPath()
    if (!existsSync(path)) return { ...DEFAULT_PRINTER_CONFIG }
    const raw = JSON.parse(readFileSync(path, 'utf-8'))
    // Merge defensivo: completa campos faltantes con los defaults
    return {
      ...DEFAULT_PRINTER_CONFIG,
      ...raw,
      negocio: { ...DEFAULT_PRINTER_CONFIG.negocio, ...(raw?.negocio ?? {}) },
    }
  } catch (err) {
    log.error('[Printer] No se pudo leer printer-config.json, usando defaults:', err)
    return { ...DEFAULT_PRINTER_CONFIG }
  }
}

export function savePrinterConfig(config: PrinterConfig): void {
  try {
    writeFileSync(configPath(), JSON.stringify(config, null, 2), 'utf-8')
    log.info('[Printer] Configuración guardada')
  } catch (err) {
    log.error('[Printer] No se pudo guardar printer-config.json:', err)
    throw err
  }
}
