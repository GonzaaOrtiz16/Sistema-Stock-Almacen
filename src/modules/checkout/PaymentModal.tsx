import { useMemo, useState } from 'react'
import { useCartStore, selectTotal, selectSubtotal } from '../../store/cartStore'
import { aplicarPromociones } from '@shared/types/promocion.types'
import { useCajaStore } from '../../store/cajaStore'
import type { MetodoPago, Venta } from '@shared/types/venta.types'
import { formatPrecio } from '../../utils/format'

interface Props {
  onSuccess: (venta: Venta) => void
  onClose: () => void
}

const METODOS: Array<{ key: MetodoPago; label: string }> = [
  { key: 'efectivo', label: 'Efectivo' },
  { key: 'debito',   label: 'Débito' },
  { key: 'credito',  label: 'Crédito' },
  { key: 'qr',       label: 'QR' },
  { key: 'mixto',    label: 'Mixto' },
]

export default function PaymentModal({ onSuccess, onClose }: Props) {
  const { items, descuento, clear } = useCartStore()
  const { usuario, turnoActivo } = useCajaStore()

  const promociones = useCartStore((s) => s.promociones)
  const subtotal   = useCartStore(selectSubtotal)
  const total      = useCartStore(selectTotal)
  const promos     = useMemo(() => aplicarPromociones(items, promociones), [items, promociones])
  const descPromos = promos.descuentoTotal

  const [metodo,         setMetodo]         = useState<MetodoPago>('efectivo')
  const [montoEfectivo,  setMontoEfectivo]  = useState('')
  const [mixtoEfectivo,  setMixtoEfectivo]  = useState('')
  const [loading,        setLoading]        = useState(false)
  const [error,          setError]          = useState('')

  const efectivoNum  = parseFloat(montoEfectivo)  || 0
  const mixtoEfNum   = parseFloat(mixtoEfectivo)  || 0
  const vuelto       = metodo === 'efectivo' ? efectivoNum - total : 0
  const mixtoTarjeta = Math.max(0, total - mixtoEfNum)

  function canConfirm(): boolean {
    if (items.length === 0) return false
    if (metodo === 'efectivo') return efectivoNum >= total
    if (metodo === 'mixto')    return mixtoEfNum >= 0 && mixtoEfNum <= total
    return true
  }

  async function handleConfirm() {
    if (!usuario || !turnoActivo) return
    setLoading(true)
    setError('')
    try {
      const venta = await window.electronAPI.ventas.crear({
        turno_id:   turnoActivo.id,
        usuario_id: usuario.id,
        items: items.map((i) => ({
          producto_id:    i.es_manual ? 0 : i.producto_id,
          cantidad:       i.cantidad,
          precio_unitario: i.precio_unitario,
          // El ahorro de las promociones se registra como descuento de cada línea:
          // el precio unitario queda como el normal y el descuento queda asentado.
          descuento_item: promos.descuentoPorProducto[i.producto_id] ?? 0,
          es_manual:      i.es_manual,
        })),
        metodo_pago:    metodo,
        descuento:      descuento,
        monto_recibido: metodo === 'efectivo' ? efectivoNum
                      : metodo === 'mixto'    ? mixtoEfNum + mixtoTarjeta
                      : undefined,
      })

      // Imprimir ticket en la tiquetera (no bloquea ni revierte la venta).
      // El subtotal de cada línea descuenta el ahorro de promos para que la suma
      // de las líneas coincida con el total cobrado.
      const ticketItems = items.map((i) => ({
        nombre:          i.nombre,
        cantidad:        i.cantidad,
        precio_unitario: i.precio_unitario,
        subtotal:        i.subtotal - (promos.descuentoPorProducto[i.producto_id] ?? 0),
      }))
      void window.electronAPI.printer
        .imprimirVenta({
          ventaId:    venta.id,
          fechaISO:   venta.timestamp,
          cajero:     usuario.nombre,
          items:      ticketItems,
          total:      venta.total,
          metodoPago: venta.metodo_pago,
          recibido:   venta.monto_recibido ?? 0,
          vuelto:     venta.vuelto ?? 0,
        })
        .then((r) => {
          if (!r.ok && r.error && r.error !== 'impresion-deshabilitada') {
            setError('Venta ok, pero no se pudo imprimir el ticket')
          }
        })

      clear()
      onSuccess(venta)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al procesar el cobro')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal payment-modal" onClick={(e) => e.stopPropagation()}>

        <div className="modal-header">
          <h2>Cobrar</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {/* Totales */}
          <div className="payment-totals">
            {(descuento > 0 || descPromos > 0) && (
              <div className="payment-row">
                <span>Subtotal</span>
                <span>{formatPrecio(subtotal)}</span>
              </div>
            )}
            {promos.aplicadas.map((a) => (
              <div key={a.promocion_id} className="payment-row discount">
                <span>🏷️ {a.nombre}{a.veces > 1 ? ` ×${a.veces}` : ''}</span>
                <span>− {formatPrecio(a.descuento)}</span>
              </div>
            ))}
            {descuento > 0 && (
              <div className="payment-row discount">
                <span>Descuento</span>
                <span>− {formatPrecio(descuento)}</span>
              </div>
            )}
            <div className="payment-row total">
              <span>TOTAL</span>
              <span>{formatPrecio(total)}</span>
            </div>
          </div>

          {/* Selección de método */}
          <div className="payment-methods">
            {METODOS.map(({ key, label }) => (
              <button
                key={key}
                className={`method-tab${metodo === key ? ' active' : ''}`}
                onClick={() => setMetodo(key)}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Panel según método */}
          {metodo === 'efectivo' && (
            <div className="method-panel">
              <label className="form-label">Monto recibido</label>
              <input
                type="number"
                min={total}
                step="0.01"
                placeholder={total.toFixed(2)}
                value={montoEfectivo}
                onChange={(e) => setMontoEfectivo(e.target.value)}
                className="form-input payment-input"
                autoFocus
              />
              {efectivoNum >= total && (
                <div className="vuelto-display">
                  <span>Vuelto</span>
                  <span className="vuelto-amount">{formatPrecio(vuelto)}</span>
                </div>
              )}
              {efectivoNum > 0 && efectivoNum < total && (
                <p className="error-msg">El monto es menor al total</p>
              )}
            </div>
          )}

          {(metodo === 'debito' || metodo === 'credito' || metodo === 'qr') && (
            <div className="method-panel method-panel-card">
              <p>Presentar terminal de pago</p>
              <p className="method-card-total">{formatPrecio(total)}</p>
            </div>
          )}

          {metodo === 'mixto' && (
            <div className="method-panel">
              <div className="mixto-row">
                <label className="form-label">Efectivo</label>
                <input
                  type="number"
                  min="0"
                  max={total}
                  step="0.01"
                  placeholder="0.00"
                  value={mixtoEfectivo}
                  onChange={(e) => setMixtoEfectivo(e.target.value)}
                  className="form-input"
                  autoFocus
                />
              </div>
              <div className="mixto-row">
                <label className="form-label">Tarjeta / QR</label>
                <span className="mixto-rest">{formatPrecio(mixtoTarjeta)}</span>
              </div>
            </div>
          )}

          {error && <p className="error-msg">{error}</p>}
        </div>

        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose} disabled={loading}>
            Cancelar
          </button>
          <button
            className="btn-confirm"
            onClick={handleConfirm}
            disabled={!canConfirm() || loading}
          >
            {loading ? 'Procesando...' : `Confirmar cobro ${formatPrecio(total)}`}
          </button>
        </div>

      </div>
    </div>
  )
}
