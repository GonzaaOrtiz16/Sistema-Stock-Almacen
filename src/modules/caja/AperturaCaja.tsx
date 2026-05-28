import { useState } from 'react'
import { useCajaStore } from '../../store/cajaStore'

export default function AperturaCaja() {
  const [monto, setMonto]     = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const { usuario, setTurnoActivo, logout } = useCajaStore()

  async function handleAbrir() {
    const montoNum = parseFloat(monto) || 0
    if (montoNum < 0) { setError('El monto no puede ser negativo'); return }
    setLoading(true)
    setError('')
    try {
      const turno = await window.electronAPI.caja.abrirTurno(usuario!.id, montoNum)
      setTurnoActivo(turno)
    } catch {
      setError('Error al abrir el turno — verificá los logs')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="apertura-screen">
      <div className="apertura-card">
        <h2 className="apertura-title">Apertura de Caja</h2>
        <p className="apertura-user">Cajero: <strong>{usuario?.nombre}</strong></p>

        <label htmlFor="monto-apertura" className="form-label">
          Efectivo inicial en caja
        </label>
        <input
          id="monto-apertura"
          type="number"
          min="0"
          step="0.01"
          placeholder="0.00"
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAbrir()}
          autoFocus
          className="form-input"
        />

        {error && <p className="error-msg">{error}</p>}

        <div className="apertura-actions">
          <button onClick={handleAbrir} disabled={loading} className="btn-primary">
            {loading ? 'Abriendo...' : 'Abrir Caja'}
          </button>
          <button onClick={logout} className="btn-ghost">
            Cambiar usuario
          </button>
        </div>
      </div>
    </div>
  )
}
