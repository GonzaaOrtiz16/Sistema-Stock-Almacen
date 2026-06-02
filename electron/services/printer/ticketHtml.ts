import type { PrinterConfig, TicketData } from '../../../shared/types/printer.types'

const METODO_LABEL: Record<string, string> = {
  efectivo: 'Efectivo',
  debito: 'Débito',
  credito: 'Crédito',
  qr: 'QR / Billetera',
  mixto: 'Mixto',
}

// Formato de precio en pesos argentinos sin depender del renderer
function precio(n: number): string {
  return '$' + n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fecha(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// Construye el HTML del ticket dimensionado para papel térmico (58/80mm).
// Tipografía monoespaciada y ancho en mm para que el corte por contenido sea exacto.
export function buildTicketHtml(data: TicketData, config: PrinterConfig): string {
  const { negocio, anchoMm } = config
  // Margen lateral interno: papel imprimible ~ ancho - 6mm
  const contentMm = anchoMm - 6
  const fontSize = anchoMm <= 58 ? 11 : 12
  // Avance de papel al final para que el corte caiga debajo del contenido
  const avanceMm = config.avanceFinalMm ?? 30

  const filas = data.items.map((it) => {
    const nombre = escape(it.nombre)
    const linea1 = `<div class="item-nombre">${nombre}</div>`
    const linea2 =
      `<div class="item-detalle">` +
      `<span>${it.cantidad} x ${precio(it.precio_unitario)}</span>` +
      `<span>${precio(it.subtotal)}</span>` +
      `</div>`
    return `<div class="item">${linea1}${linea2}</div>`
  }).join('')

  const headerNegocio =
    `<div class="center bold negocio">${escape(negocio.nombre)}</div>` +
    (negocio.direccion ? `<div class="center small">${escape(negocio.direccion)}</div>` : '') +
    (negocio.telefono ? `<div class="center small">Tel: ${escape(negocio.telefono)}</div>` : '')

  const pago =
    `<div class="linea"><span>Pago</span><span>${METODO_LABEL[data.metodoPago] ?? data.metodoPago}</span></div>` +
    (data.metodoPago === 'efectivo'
      ? `<div class="linea"><span>Recibido</span><span>${precio(data.recibido)}</span></div>` +
        `<div class="linea"><span>Vuelto</span><span>${precio(data.vuelto)}</span></div>`
      : '')

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { size: ${anchoMm}mm auto; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${anchoMm}mm; }
  body {
    width: ${contentMm}mm;
    margin: 0 auto;
    padding: 2mm 0 4mm;
    font-family: 'Consolas', 'Courier New', monospace;
    font-size: ${fontSize}px;
    line-height: 1.35;
    color: #000;
  }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  .small { font-size: ${fontSize - 2}px; }
  .negocio { font-size: ${fontSize + 2}px; margin-bottom: 1mm; }
  .sep { border-top: 1px dashed #000; margin: 2mm 0; }
  .meta { font-size: ${fontSize - 1}px; }
  .meta div { display: flex; justify-content: space-between; }
  .item { margin-bottom: 1mm; }
  .item-nombre { word-break: break-word; }
  .item-detalle { display: flex; justify-content: space-between; }
  .linea { display: flex; justify-content: space-between; }
  .total { display: flex; justify-content: space-between; font-size: ${fontSize + 3}px; font-weight: bold; margin: 1mm 0; }
  .pie { margin-top: 3mm; text-align: center; }
</style>
</head>
<body>
  ${headerNegocio}
  <div class="sep"></div>
  <div class="meta">
    <div><span>Ticket</span><span>#${data.ventaId}</span></div>
    <div><span>Fecha</span><span>${fecha(data.fechaISO)}</span></div>
    <div><span>Cajero</span><span>${escape(data.cajero)}</span></div>
  </div>
  <div class="sep"></div>
  ${filas}
  <div class="sep"></div>
  <div class="total"><span>TOTAL</span><span>${precio(data.total)}</span></div>
  ${pago}
  <div class="sep"></div>
  ${negocio.mensajePie ? `<div class="pie">${escape(negocio.mensajePie)}</div>` : ''}
  <div class="pie small">Comprobante no válido como factura</div>
  <div class="avance" style="height:${avanceMm}mm"></div>
</body>
</html>`
}
