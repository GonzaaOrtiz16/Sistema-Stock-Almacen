import { useState } from 'react'

interface Props {
  onConfirm: (monto: number, descripcion: string) => void
  onClose: () => void
}

/** Carga de un monto a cobrar sin código de barras (producto suelto, pesable, etc.). */
export default function MontoManualModal({ onConfirm, onClose }: Props) {
  const [monto,       setMonto]       = useState('')
  const [descripcion, setDescripcion] = useState('')

  const montoNum = parseFloat(monto) || 0
  const valido   = montoNum > 0

  function confirmar() {
    if (!valido) return
    onConfirm(montoNum, descripcion.trim())
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal payment-modal" onClick={(e) => e.stopPropagation()}>

        <div className="modal-header">
          <h2>Monto manual</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <label className="form-label">Monto a cobrar</label>
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); confirmar() }
            }}
            className="form-input payment-input"
            autoFocus
          />

          <label className="form-label" style={{ marginTop: 12 }}>Descripción (opcional)</label>
          <input
            type="text"
            placeholder="Ej: verdura, pan suelto…"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); confirmar() }
            }}
            className="form-input"
          />
        </div>

        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn-confirm" onClick={confirmar} disabled={!valido}>
            Agregar al carrito
          </button>
        </div>

      </div>
    </div>
  )
}
