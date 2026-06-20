import { useEffect, useState } from 'react'
import type { Venta, LineaVenta } from '@shared/types/venta.types'
import { formatPrecio, formatFecha } from '../../utils/format'

interface Props {
  venta: Venta
  cacheLineas?: LineaVenta[]
  onLoaded?: (ventaId: number, lineas: LineaVenta[]) => void
  onReimprimir: (v: Venta) => void
  onAnular: (v: Venta) => void
  onClose: () => void
}

// Detalle completo de una venta del historial, en un modal con espacio de sobra
// (la columna de la caja es angosta y cortaba el desglose). Scrollea si hace falta.
export default function VentaDetalleModal({ venta, cacheLineas, onLoaded, onReimprimir, onAnular, onClose }: Props) {
  const [lineas, setLineas] = useState<LineaVenta[] | undefined>(cacheLineas)

  useEffect(() => {
    if (lineas !== undefined) return
    let vivo = true
    window.electronAPI.ventas.detalle(venta.id).then((ls) => {
      if (!vivo) return
      setLineas(ls)
      onLoaded?.(venta.id, ls)
    })
    return () => { vivo = false }
  }, [venta.id, lineas, onLoaded])

  const anulada    = venta.estado === 'anulada'
  const esEfectivo = venta.metodo_pago === 'efectivo'

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal venta-detalle-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="venta-detalle-titulo">
            <h2>Venta #{venta.id}</h2>
            <span className="venta-detalle-fecha">{formatFecha(venta.timestamp)}</span>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body venta-detalle-body">
          <div className="venta-detalle-tags">
            <span className={`metodo-pill metodo-${venta.metodo_pago}`}>{venta.metodo_pago}</span>
            {venta.usuario_nombre && <span className="historial-cajero">{venta.usuario_nombre}</span>}
            {anulada && <span className="historial-badge">Anulada</span>}
          </div>

          <div className="venta-detalle-lineas">
            {lineas === undefined ? (
              <p className="detalle-cargando">Cargando…</p>
            ) : lineas.length === 0 ? (
              <p className="detalle-cargando">Sin ítems</p>
            ) : (
              lineas.map((l) => (
                <div key={l.producto_id} className="detalle-linea">
                  <span className="detalle-cant">{l.cantidad}×</span>
                  <span className="detalle-nombre">{l.nombre}</span>
                  <span className="detalle-unit">{formatPrecio(l.precio_unitario)}</span>
                  <span className="detalle-sub">{formatPrecio(l.subtotal)}</span>
                </div>
              ))
            )}
          </div>

          <div className="detalle-pago">
            <div className="detalle-pago-row">
              <span>Total</span>
              <span>{formatPrecio(venta.total)}</span>
            </div>
            {esEfectivo && venta.monto_recibido != null && (
              <>
                <div className="detalle-pago-row">
                  <span>Recibido</span>
                  <span>{formatPrecio(venta.monto_recibido)}</span>
                </div>
                <div className="detalle-pago-row">
                  <span>Vuelto</span>
                  <span>{formatPrecio(venta.vuelto ?? 0)}</span>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="historial-info" onClick={() => onReimprimir(venta)}>🖨  Reimprimir</button>
          {!anulada && (
            <button className="historial-anular" onClick={() => onAnular(venta)}>✕  Anular</button>
          )}
          <button className="btn-ghost" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  )
}
