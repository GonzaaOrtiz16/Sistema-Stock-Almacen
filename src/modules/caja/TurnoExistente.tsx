import { useState } from 'react'
import { useCajaStore } from '../../store/cajaStore'
import { formatPrecio, formatFecha } from '../../utils/format'
import CierreCaja from './CierreCaja'

/**
 * Se muestra al iniciar sesión cuando el usuario ya tiene un turno abierto sin
 * cerrar (porque solo cerró sesión o cerró la app sin hacer el cierre de caja).
 * Le permite elegir: continuar ese turno, o cerrarlo y abrir uno nuevo.
 */
export default function TurnoExistente() {
  const { turnoActivo, confirmarTurnoPendiente, setTurnoActivo } = useCajaStore()
  const [cerrando, setCerrando] = useState(false)

  if (!turnoActivo) return null

  // El usuario eligió cerrar la caja anterior → pasamos por el cierre normal y,
  // al terminar, dejamos el turno en null para que aparezca la apertura.
  if (cerrando) {
    return (
      <CierreCaja
        onCancel={() => setCerrando(false)}
        onClosed={() => setTurnoActivo(null)}
      />
    )
  }

  return (
    <div className="apertura-screen">
      <div className="apertura-card">
        <h2 className="apertura-title">Turno abierto sin cerrar</h2>
        <p className="apertura-user">
          Ya tenés un turno abierto (#{turnoActivo.id}) desde el{' '}
          <strong>{formatFecha(turnoActivo.apertura_ts)}</strong>.
        </p>
        <p className="apertura-user">
          Efectivo de apertura: <strong>{formatPrecio(turnoActivo.monto_apertura)}</strong>
        </p>
        <p className="apertura-user">¿Qué querés hacer?</p>

        <div className="apertura-actions" style={{ flexDirection: 'column', gap: '0.75rem' }}>
          <button className="btn-primary" onClick={confirmarTurnoPendiente}>
            Continuar este turno
          </button>
          <button className="btn-ghost" onClick={() => setCerrando(true)}>
            Cerrar caja anterior y abrir una nueva
          </button>
        </div>
      </div>
    </div>
  )
}
