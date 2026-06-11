import { useState } from 'react'
import type { Producto } from '@shared/types/producto.types'

interface Props {
  producto: Producto
  onConfirm: (precio: number) => void
  onClose: () => void
}

/**
 * Se dispara al escanear un producto que existe pero no tiene precio cargado.
 * Pide el precio, lo agrega a la venta y lo deja guardado en el producto.
 */
export default function PrecioProductoModal({ producto, onConfirm, onClose }: Props) {
  const [precio, setPrecio] = useState('')

  const precioNum = parseFloat(precio) || 0
  const valido    = precioNum > 0

  function confirmar() {
    if (!valido) return
    onConfirm(precioNum)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal payment-modal" onClick={(e) => e.stopPropagation()}>

        <div className="modal-header">
          <h2>Falta el precio</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <p className="payment-row" style={{ fontWeight: 600 }}>{producto.nombre}</p>
          <p className="form-label" style={{ marginTop: 4 }}>
            Este producto no tiene precio. Ingresalo para venderlo y guardarlo.
          </p>

          <label className="form-label" style={{ marginTop: 12 }}>Precio de venta</label>
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={precio}
            onChange={(e) => setPrecio(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); confirmar() }
            }}
            className="form-input payment-input"
            autoFocus
          />
        </div>

        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn-confirm" onClick={confirmar} disabled={!valido}>
            Agregar y guardar precio
          </button>
        </div>

      </div>
    </div>
  )
}
