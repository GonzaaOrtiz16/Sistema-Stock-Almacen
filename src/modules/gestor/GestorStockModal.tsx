import { useState } from 'react'
import type { Producto } from '@shared/types/producto.types'
import { formatPrecio } from '../../utils/format'

interface Props {
  producto: Producto
  onSuccess: (p: Producto) => void
  onClose: () => void
}

// Carga de stock (recepción de mercadería): SIEMPRE suma (+N) al stock actual.
export default function GestorStockModal({ producto, onSuccess, onClose }: Props) {
  const [cantidad, setCantidad] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const cant = parseFloat(cantidad)
  const nuevoStock = producto.stock_actual + (Number.isFinite(cant) ? cant : 0)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!cantidad || Number.isNaN(cant) || cant <= 0) { setError('Ingresá una cantidad mayor a 0'); return }
    setLoading(true)
    setError('')
    try {
      const saved = await window.electronAPI.gestor.sumarStock({ uuid: producto.uuid, cantidad: cant })
      onSuccess(saved)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar stock')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ width: 380 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Cargar stock</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <form className="modal-body" onSubmit={handleSubmit}>
          <div className="gestor-stock-prod">
            <span className="gestor-stock-nombre">{producto.nombre}</span>
            <span className="gestor-stock-precio">{formatPrecio(producto.precio_venta)}</span>
          </div>

          <div className="field-group">
            <label className="form-label">Cantidad a sumar (+)</label>
            <input
              type="number" min="0" step="0.001"
              className="form-input"
              value={cantidad}
              onChange={(e) => { setCantidad(e.target.value); setError('') }}
              placeholder="0"
              autoFocus
            />
          </div>

          <div className="gestor-stock-resumen">
            <span>Stock actual: <b>{producto.stock_actual}</b></span>
            <span>Quedará: <b>{Number.isFinite(cant) && cant > 0 ? nuevoStock : producto.stock_actual}</b></span>
          </div>

          {error && <p className="error-msg">{error}</p>}

          <div className="modal-footer" style={{ padding: 0, borderTop: 'none', marginTop: 4 }}>
            <button type="button" className="btn-ghost" onClick={onClose} disabled={loading}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Cargando…' : 'Sumar stock'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
