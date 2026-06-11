import { useState } from 'react'
import type { Unidad } from '@shared/types/producto.types'

interface Props {
  codigo: string
  onSuccess: (codigo: string) => void
  onClose: () => void
}

const UNIDADES: Unidad[] = ['unidad', 'kg', 'lt', 'gr']

/** Alta rápida de un producto a partir de un código que se escaneó y no existía. */
export default function AltaRapidaModal({ codigo, onSuccess, onClose }: Props) {
  const [nombre,   setNombre]   = useState('')
  const [precio,   setPrecio]   = useState('')
  const [stock,    setStock]    = useState('')
  const [unidad,   setUnidad]   = useState<Unidad>('unidad')
  const [guardando, setGuardando] = useState(false)
  const [error,     setError]     = useState('')

  const valido = nombre.trim().length > 0

  async function confirmar() {
    if (!valido) return
    setGuardando(true)
    setError('')
    try {
      await window.electronAPI.productos.crear({
        codigo_barras: codigo,
        nombre:        nombre.trim(),
        precio_venta:  parseFloat(precio) > 0 ? parseFloat(precio) : 0,
        stock_actual:  parseInt(stock, 10) > 0 ? parseInt(stock, 10) : 0,
        unidad,
      })
      onSuccess(codigo)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear el producto')
      setGuardando(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal payment-modal" onClick={(e) => e.stopPropagation()}>

        <div className="modal-header">
          <h2>Alta rápida</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <label className="form-label">Código de barras</label>
          <input className="form-input" value={codigo} readOnly />

          <label className="form-label" style={{ marginTop: 12 }}>Nombre</label>
          <input
            className="form-input"
            placeholder="Nombre del producto"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            autoFocus
          />

          <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
            <div style={{ flex: 1 }}>
              <label className="form-label">Precio de venta</label>
              <input
                className="form-input"
                type="number"
                min="0"
                step="any"
                placeholder="0"
                value={precio}
                onChange={(e) => setPrecio(e.target.value)}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label className="form-label">Stock inicial</label>
              <input
                className="form-input"
                type="number"
                min="0"
                step="1"
                placeholder="0"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
              />
            </div>
            <div style={{ width: 100 }}>
              <label className="form-label">Unidad</label>
              <select
                className="form-input"
                value={unidad}
                onChange={(e) => setUnidad(e.target.value as Unidad)}
              >
                {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>

          {error && <p className="error-msg" style={{ marginTop: 12 }}>{error}</p>}
        </div>

        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose} disabled={guardando}>Cancelar</button>
          <button className="btn-confirm" onClick={confirmar} disabled={!valido || guardando}>
            {guardando ? 'Guardando…' : 'Crear producto'}
          </button>
        </div>

      </div>
    </div>
  )
}
