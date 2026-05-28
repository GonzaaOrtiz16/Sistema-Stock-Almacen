import { useState } from 'react'
import type { ActualizacionMasiva } from '@shared/types/producto.types'

interface Props {
  onSuccess: (affected: number) => void
  onClose: () => void
}

export default function BulkPriceUpdate({ onSuccess, onClose }: Props) {
  const [tipo,        setTipo]        = useState<'porcentaje_global' | 'porcentaje_categoria'>('porcentaje_global')
  const [porcentaje,  setPorcentaje]  = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')

  const pct       = parseFloat(porcentaje) || 0
  const isAumento = pct > 0
  const preview   = pct !== 0
    ? `Un producto de $1.000 pasaría a $${(1000 * (1 + pct / 100)).toFixed(2)}`
    : ''

  async function handleAplicar() {
    if (!porcentaje || pct === 0) { setError('Ingresá un porcentaje distinto de cero'); return }
    if (tipo === 'porcentaje_categoria' && !categoriaId) {
      setError('Ingresá el ID de la categoría'); return
    }

    const confirmMsg = tipo === 'porcentaje_global'
      ? `¿Aplicar ${pct > 0 ? '+' : ''}${pct}% a TODOS los productos?`
      : `¿Aplicar ${pct > 0 ? '+' : ''}${pct}% a la categoría ${categoriaId}?`

    if (!window.confirm(confirmMsg)) return

    setLoading(true)
    setError('')
    try {
      const input: ActualizacionMasiva = {
        tipo,
        porcentaje: pct,
        ...(tipo === 'porcentaje_categoria' && { categoria_id: parseInt(categoriaId) }),
      }
      const affected = await window.electronAPI.productos.actualizarMasivo(input)
      onSuccess(affected)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar precios')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal bulk-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Actualización masiva de precios</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {/* Tipo */}
          <div className="field-group">
            <label className="form-label">Alcance</label>
            <div className="radio-group">
              <label className="radio-label">
                <input
                  type="radio" value="porcentaje_global"
                  checked={tipo === 'porcentaje_global'}
                  onChange={() => setTipo('porcentaje_global')}
                />
                Todos los productos
              </label>
              <label className="radio-label">
                <input
                  type="radio" value="porcentaje_categoria"
                  checked={tipo === 'porcentaje_categoria'}
                  onChange={() => setTipo('porcentaje_categoria')}
                />
                Por categoría
              </label>
            </div>
          </div>

          {tipo === 'porcentaje_categoria' && (
            <div className="field-group">
              <label className="form-label">ID de categoría</label>
              <input
                type="number" min="1"
                className="form-input"
                value={categoriaId}
                onChange={(e) => setCategoriaId(e.target.value)}
                placeholder="Ej: 3"
                autoFocus
              />
            </div>
          )}

          {/* Porcentaje */}
          <div className="field-group">
            <label className="form-label">
              Porcentaje {pct > 0 ? '(aumento)' : pct < 0 ? '(reducción)' : ''}
            </label>
            <div className="pct-input-row">
              <input
                type="number" step="0.1"
                className="form-input"
                value={porcentaje}
                onChange={(e) => { setPorcentaje(e.target.value); setError('') }}
                placeholder="Ej: 15 para subir 15%"
                autoFocus={tipo === 'porcentaje_global'}
              />
              <span className="pct-symbol">%</span>
            </div>
            {preview && (
              <p className={`pct-preview ${isAumento ? 'aumento' : 'reduccion'}`}>
                {preview}
              </p>
            )}
          </div>

          {/* Advertencia */}
          <div className="bulk-warning">
            Esta operación modifica los precios directamente en la base de datos
            y no puede deshacerse fácilmente.
          </div>

          {error && <p className="error-msg">{error}</p>}
        </div>

        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose} disabled={loading}>Cancelar</button>
          <button
            className={`btn-primary ${pct < 0 ? 'btn-reduccion' : ''}`}
            onClick={handleAplicar}
            disabled={loading || !porcentaje}
          >
            {loading ? 'Aplicando…' : `Aplicar ${pct >= 0 ? '+' : ''}${pct || 0}%`}
          </button>
        </div>
      </div>
    </div>
  )
}
