import { useState } from 'react'
import type { Producto } from '@shared/types/producto.types'

interface Props {
  producto?: Producto    // undefined = nuevo; presente = editar (solo nombre/precio)
  onSuccess: (p: Producto) => void
  onClose: () => void
}

// Alta de producto nuevo o edición de nombre/precio de uno existente. El Gestor
// no toca costo, categoría ni código de existentes (solo lo permitido).
export default function GestorProductoModal({ producto, onSuccess, onClose }: Props) {
  const editar = !!producto
  const [nombre, setNombre] = useState(producto?.nombre ?? '')
  const [precio, setPrecio] = useState(producto?.precio_venta != null ? String(producto.precio_venta) : '')
  const [stock, setStock] = useState('0')
  const [codigo, setCodigo] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nombre.trim()) { setError('El nombre es obligatorio'); return }
    const precioNum = parseFloat(precio)
    if (!precio || Number.isNaN(precioNum) || precioNum < 0) { setError('Ingresá un precio válido'); return }

    setLoading(true)
    setError('')
    try {
      let saved: Producto
      if (editar && producto) {
        saved = await window.electronAPI.gestor.actualizar({
          uuid: producto.uuid,
          nombre: nombre.trim(),
          precio_venta: precioNum,
        })
      } else {
        saved = await window.electronAPI.gestor.crear({
          nombre: nombre.trim(),
          precio_venta: precioNum,
          stock_actual: parseFloat(stock) || 0,
          codigo_barras: codigo.trim() || null,
        })
      }
      onSuccess(saved)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal product-form-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{editar ? 'Editar producto' : 'Nuevo producto'}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <form className="modal-body" onSubmit={handleSubmit}>
          <div className="field-group">
            <label className="form-label">Nombre *</label>
            <input className="form-input" value={nombre} onChange={(e) => { setNombre(e.target.value); setError('') }} placeholder="Leche entera 1L" autoFocus />
          </div>

          <div className="field-group">
            <label className="form-label">Precio de venta *</label>
            <input type="number" min="0" step="0.01" className="form-input" value={precio} onChange={(e) => { setPrecio(e.target.value); setError('') }} placeholder="0.00" />
          </div>

          {!editar && (
            <div className="field-row">
              <div className="field-group">
                <label className="form-label">Stock inicial</label>
                <input type="number" min="0" step="0.001" className="form-input" value={stock} onChange={(e) => setStock(e.target.value)} />
              </div>
              <div className="field-group">
                <label className="form-label">Código de barras</label>
                <input className="form-input" value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Opcional" />
              </div>
            </div>
          )}

          {editar && (
            <p className="promo-hint">Para cargar stock usá el botón <b>+ Stock</b> (se suma). Acá solo cambiás nombre y precio.</p>
          )}

          {error && <p className="error-msg">{error}</p>}

          <div className="modal-footer" style={{ padding: 0, borderTop: 'none', marginTop: 4 }}>
            <button type="button" className="btn-ghost" onClick={onClose} disabled={loading}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Guardando…' : editar ? 'Guardar cambios' : 'Crear producto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
