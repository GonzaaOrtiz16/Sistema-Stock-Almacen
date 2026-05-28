import { useEffect, useState } from 'react'
import { useCajaStore } from '../../store/cajaStore'
import type { ResumenTurno } from '@shared/types/venta.types'
import { formatPrecio, formatFecha } from '../../utils/format'

interface Props {
  onCancel: () => void
}

export default function CierreCaja({ onCancel }: Props) {
  const { turnoActivo, logout } = useCajaStore()

  const [resumen,        setResumen]        = useState<ResumenTurno | null>(null)
  const [montoCierre,    setMontoCierre]    = useState('')
  const [observaciones,  setObservaciones]  = useState('')
  const [loading,        setLoading]        = useState(false)
  const [error,          setError]          = useState('')

  useEffect(() => {
    if (!turnoActivo) return
    window.electronAPI.caja.resumen(turnoActivo.id).then(setResumen).catch(() => {
      setError('No se pudo cargar el resumen del turno')
    })
  }, [turnoActivo])

  const montoNum       = parseFloat(montoCierre) || 0
  const efectivoEsper  = resumen ? (turnoActivo?.monto_apertura ?? 0) + resumen.por_metodo.efectivo : 0
  const diferencia     = resumen ? montoNum - efectivoEsper : 0
  const diferenciaFmt  = `${diferencia >= 0 ? '+' : ''}${formatPrecio(diferencia)}`

  async function handleCerrar() {
    if (!turnoActivo) return
    setLoading(true)
    setError('')
    try {
      await window.electronAPI.caja.cerrarTurno(
        turnoActivo.id,
        montoNum,
        observaciones || undefined,
      )
      logout()
    } catch {
      setError('Error al cerrar el turno — verificá los logs')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="cierre-screen">
      <div className="cierre-card">
        <h2 className="cierre-title">Cierre de Caja</h2>

        {turnoActivo && (
          <p className="cierre-subtitle">
            Turno #{turnoActivo.id} · abierto {formatFecha(turnoActivo.apertura_ts)}
          </p>
        )}

        {!resumen && !error && <p className="pin-loading">Cargando resumen…</p>}
        {error && <p className="error-msg">{error}</p>}

        {resumen && (
          <>
            {/* Resumen de ventas */}
            <div className="resumen-block">
              <div className="resumen-row resumen-total">
                <span>Total vendido</span>
                <span>{formatPrecio(resumen.total_ventas)}</span>
              </div>
              <div className="resumen-row">
                <span>Cantidad de ventas</span>
                <span>{resumen.cantidad_ventas}</span>
              </div>
            </div>

            <div className="resumen-block">
              <p className="resumen-label">Por método de pago</p>
              {(Object.entries(resumen.por_metodo) as [string, number][])
                .filter(([, v]) => v > 0)
                .map(([metodo, monto]) => (
                  <div key={metodo} className="resumen-row">
                    <span className="resumen-metodo">{metodo}</span>
                    <span>{formatPrecio(monto)}</span>
                  </div>
                ))}
            </div>

            {/* Conteo de caja */}
            <div className="resumen-block">
              <label className="form-label">Efectivo en caja contado</label>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder={efectivoEsper.toFixed(2)}
                value={montoCierre}
                onChange={(e) => setMontoCierre(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCerrar()}
                className="form-input"
                autoFocus
              />

              {montoCierre !== '' && (
                <div className={`diferencia ${diferencia < 0 ? 'negativa' : 'positiva'}`}>
                  <span>Diferencia</span>
                  <span>{diferenciaFmt}</span>
                </div>
              )}
            </div>

            <div className="resumen-block">
              <label className="form-label">Observaciones (opcional)</label>
              <textarea
                className="form-input"
                rows={2}
                placeholder="Notas del cierre…"
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
              />
            </div>
          </>
        )}

        <div className="cierre-actions">
          <button className="btn-ghost" onClick={onCancel} disabled={loading}>
            Volver
          </button>
          <button
            className="btn-danger"
            onClick={handleCerrar}
            disabled={loading || !resumen}
          >
            {loading ? 'Cerrando…' : 'Cerrar turno y salir'}
          </button>
        </div>
      </div>
    </div>
  )
}
