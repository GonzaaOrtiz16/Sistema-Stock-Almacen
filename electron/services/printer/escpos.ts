import type { PrinterConfig, TicketData } from '../../../shared/types/printer.types'

// Generador de comandos ESC/POS crudos para impresoras térmicas (POS-80C y compatibles).
// Se evita el render gráfico de Chromium: el driver POS es modo texto/ESC-POS y descarta
// los trabajos gráficos. Mandando bytes ESC/POS imprime texto y ejecuta el corte real.

const ESC = 0x1b
const GS = 0x1d
const LF = 0x0a

const METODO_LABEL: Record<string, string> = {
  efectivo: 'Efectivo',
  debito: 'Debito',
  credito: 'Credito',
  qr: 'QR / Billetera',
  mixto: 'Mixto',
}

// Quita acentos/ñ y cualquier carácter no ASCII para imprimir limpio en CP437
function ascii(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7e]/g, '?')
}

function precio(n: number): string {
  return '$' + n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fecha(iso: string): string {
  const d = new Date(iso)
  const p = (x: number) => String(x).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

class Builder {
  private chunks: number[] = []
  push(...bytes: number[]) { this.chunks.push(...bytes); return this }
  text(s: string) {
    const buf = Buffer.from(ascii(s), 'latin1')
    for (const b of buf) this.chunks.push(b)
    return this
  }
  line(s = '') { return this.text(s).push(LF) }
  init() { return this.push(ESC, 0x40) }                 // ESC @  reset
  align(n: 0 | 1 | 2) { return this.push(ESC, 0x61, n) } // 0=izq 1=centro 2=der
  bold(on: boolean) { return this.push(ESC, 0x45, on ? 1 : 0) }
  size(n: number) { return this.push(GS, 0x21, n) }      // GS ! tamaño
  feed(lines: number) { for (let i = 0; i < lines; i++) this.chunks.push(LF); return this }
  cut() { return this.push(GS, 0x56, 66, 0x00) }         // GS V 66 0: avanza y corte parcial
  build(): Buffer { return Buffer.from(this.chunks) }
}

// Formatea "izquierda ........... derecha" dentro del ancho de columnas
function lr(left: string, right: string, width: number): string {
  left = ascii(left); right = ascii(right)
  const space = width - left.length - right.length
  if (space < 1) {
    const maxLeft = Math.max(0, width - right.length - 1)
    return left.slice(0, maxLeft) + ' ' + right
  }
  return left + ' '.repeat(space) + right
}

export function buildTicketEscpos(data: TicketData, config: PrinterConfig): Buffer {
  const width = config.anchoMm <= 58 ? 32 : 48
  const sep = '-'.repeat(width)
  const { negocio } = config
  const b = new Builder()

  b.init()

  // Encabezado: nombre del negocio en grande y centrado
  b.align(1).bold(true).size(0x11).line(negocio.nombre)
  b.size(0x00).bold(false)
  if (negocio.direccion) b.line(negocio.direccion)
  if (negocio.telefono) b.line('Tel: ' + negocio.telefono)

  // Metadatos de la venta (alineado a la izquierda)
  b.align(0).line(sep)
  b.line(lr('Ticket', '#' + data.ventaId, width))
  b.line(lr('Fecha', fecha(data.fechaISO), width))
  b.line(lr('Cajero', data.cajero, width))
  b.line(sep)

  // Detalle de productos
  for (const it of data.items) {
    b.line(it.nombre)
    b.line(lr(`  ${it.cantidad} x ${precio(it.precio_unitario)}`, precio(it.subtotal), width))
  }
  b.line(sep)

  // Total en grande
  b.bold(true).size(0x11).line(lr('TOTAL', precio(data.total), Math.floor(width / 2)))
  b.size(0x00).bold(false)

  // Pago
  b.line(lr('Pago', METODO_LABEL[data.metodoPago] ?? data.metodoPago, width))
  if (data.metodoPago === 'efectivo') {
    b.line(lr('Recibido', precio(data.recibido), width))
    b.line(lr('Vuelto', precio(data.vuelto), width))
  }
  b.line(sep)

  // Pie
  b.align(1)
  if (negocio.mensajePie) b.line(negocio.mensajePie)
  b.line('Comprobante no valido como factura')

  // Avance final + corte
  const feedLines = Math.max(2, Math.round((config.avanceFinalMm ?? 3) / 1.5))
  b.feed(feedLines).cut()

  return b.build()
}
