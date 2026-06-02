import type { MetodoPago } from './venta.types'

// Ancho de papel térmico soportado (mm)
export type AnchoPapel = 58 | 80

// Línea de producto tal como se imprime en el ticket
export interface TicketItem {
  nombre: string
  cantidad: number
  precio_unitario: number
  subtotal: number
}

// Datos del negocio que se imprimen en el encabezado/pie del ticket
export interface NegocioInfo {
  nombre: string
  direccion: string
  telefono: string
  mensajePie: string
}

// Configuración de impresión persistida en userData/printer-config.json
export interface PrinterConfig {
  // Si está deshabilitado, la venta NO dispara impresión automática
  habilitado: boolean
  // Nombre del dispositivo según Windows (deviceName). Vacío = impresora por defecto
  deviceName: string
  anchoMm: AnchoPapel
  // Papel en blanco que avanza al final del ticket (mm) para que el corte
  // caiga después del contenido. Compensa la distancia cabezal→cuchilla.
  avanceFinalMm: number
  negocio: NegocioInfo
}

// Información de una impresora detectada en el sistema
export interface ImpresoraInfo {
  name: string
  displayName: string
  isDefault: boolean
}

// Datos necesarios para componer e imprimir un ticket de venta
export interface TicketData {
  ventaId: number
  fechaISO: string
  cajero: string
  items: TicketItem[]
  total: number
  metodoPago: MetodoPago
  recibido: number
  vuelto: number
}

export interface PrintResult {
  ok: boolean
  error?: string
}

export const DEFAULT_PRINTER_CONFIG: PrinterConfig = {
  habilitado: false,
  deviceName: '',
  anchoMm: 80,
  avanceFinalMm: 3,
  negocio: {
    nombre: 'Almacén Minimercado Gabriela',
    direccion: '',
    telefono: '',
    mensajePie: '¡Gracias por su compra!',
  },
}
