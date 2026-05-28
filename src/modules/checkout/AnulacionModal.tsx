import { useEffect, useRef, useState } from 'react'
import { useCajaStore } from '../../store/cajaStore'
import { useNetworkStatus } from '../../hooks/useNetworkStatus'
import type { Venta } from '@shared/types/venta.types'
import { formatFecha, formatPrecio } from '../../utils/format'
import { PIN_LOCKOUT_ATTEMPTS } from '@shared/constants'

interface Props {
  venta: Venta
  onSuccess: () => void
  onClose: () => void
}

// ── Espera aprobación remota ─────────────────────────────────────────────────
function WaitingApproval({
  venta,
  onForzarOffline,
  onSuccess,
  onClose,
}: {
  venta: Venta
  onForzarOffline: () => void
  onSuccess: () => void
  onClose: () => void
}) {
  const [rejected, setRejected] = useState(false)

  useEffect(() => {
    const api = window.electronAPI.anulaciones
    api.onAprobada(({ ventaId }) => { if (ventaId === venta.id) onSuccess() })
    api.onRechazada(({ ventaId }) => { if (ventaId === venta.id) setRejected(true) })
    return () => api.removeListeners()
  }, [venta.id, onSuccess])

  if (rejected) {
    return (
      <div className="anulacion-waiting">
        <p className="pin-error">El administrador rechazó la solicitud.</p>
        <button className="btn-ghost" onClick={onClose}>Cerrar</button>
      </div>
    )
  }

  return (
    <div className="anulacion-waiting">
      <div className="spinner" />
      <p>Esperando aprobación del administrador…</p>
      <p className="anulacion-hint">
        La solicitud fue enviada. El admin puede aprobarla desde cualquier
        dispositivo con Supabase configurado.
      </p>
      <button className="btn-ghost" onClick={onForzarOffline}>
        Usar PIN local
      </button>
    </div>
  )
}

// ── PIN pad offline ──────────────────────────────────────────────────────────
function PinOffline({
  ventaId, solicitanteId, motivo, onSuccess, onError,
}: {
  ventaId: number
  solicitanteId: number
  motivo: string
  onSuccess: () => void
  onError: (msg: string) => void
}) {
  const [pin, setPin]         = useState('')
  const [loading, setLoading] = useState(false)
  const [attempts, setAttempts] = useState(0)
  const pinRef     = useRef(pin)
  const loadingRef = useRef(loading)
  pinRef.current     = pin
  loadingRef.current = loading

  const bloqueado = attempts >= PIN_LOCKOUT_ATTEMPTS

  async function tryPin(code: string) {
    setLoading(true)
    try {
      await window.electronAPI.ventas.anularLocal({
        venta_id: ventaId, solicitante_id: solicitanteId,
        motivo: motivo || undefined, pin_admin: code,
      })
      onSuccess()
    } catch (err) {
      const next = attempts + 1
      setAttempts(next)
      pinRef.current = ''
      setPin('')
      onError(err instanceof Error ? err.message : 'PIN incorrecto')
    } finally {
      setLoading(false)
    }
  }

  function pressDigit(d: string) {
    if (loadingRef.current || bloqueado) return
    const next = pinRef.current.length < 4 ? pinRef.current + d : pinRef.current
    pinRef.current = next
    setPin(next)
    if (next.length === 4) tryPin(next)
  }

  function pressBack() {
    if (loadingRef.current) return
    const next = pinRef.current.slice(0, -1)
    pinRef.current = next
    setPin(next)
  }

  if (bloqueado) {
    return (
      <p className="error-msg" style={{ textAlign: 'center', padding: '16px 0' }}>
        Máximo de intentos alcanzado. Contactá al administrador.
      </p>
    )
  }

  return (
    <div className="anulacion-pin">
      <p className="form-label" style={{ textAlign: 'center' }}>PIN del administrador</p>
      <div className="pin-dots">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`pin-dot${i < pin.length ? ' filled' : ''}`} />
        ))}
      </div>
      {loading && <p className="pin-loading">Verificando…</p>}
      <div className="numpad numpad-sm">
        {(['1','2','3','4','5','6','7','8','9','←','0','OK'] as const).map((k) => (
          <button
            key={k}
            className={`numpad-btn${k === '←' || k === 'OK' ? ' numpad-action' : ''}`}
            onClick={() => {
              if (k === '←') pressBack()
              else if (k === 'OK') { if (pinRef.current.length === 4) tryPin(pinRef.current) }
              else pressDigit(k)
            }}
            disabled={loading || bloqueado}
          >{k}</button>
        ))}
      </div>
    </div>
  )
}

// ── Modal principal ──────────────────────────────────────────────────────────
export default function AnulacionModal({ venta, onSuccess, onClose }: Props) {
  const { usuario }   = useCajaStore()
  const isOnline      = useNetworkStatus()

  const [motivo,       setMotivo]       = useState('')
  const [forzoOffline, setForzoOffline] = useState(false)
  const [onlineMode,   setOnlineMode]   = useState(false)
  const [pinError,     setPinError]     = useState('')

  const usarOnline = isOnline && !forzoOffline

  async function handleSolicitarOnline() {
    await window.electronAPI.anulaciones.solicitarRemoto({
      venta_id: venta.id,
      solicitante_id: usuario!.id,
      motivo: motivo || undefined,
    })
    setOnlineMode(true)
  }

  async function handleCancelarRemoto() {
    await window.electronAPI.anulaciones.cancelarRemoto(venta.id)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal anulacion-modal" onClick={(e) => e.stopPropagation()}>

        <div className="modal-header">
          <h2>Anular venta</h2>
          <button className="modal-close" onClick={onlineMode ? handleCancelarRemoto : onClose}>×</button>
        </div>

        <div className="modal-body">
          {/* Info de la venta */}
          <div className="anulacion-info">
            <div className="anulacion-row"><span>Fecha</span><span>{formatFecha(venta.timestamp)}</span></div>
            <div className="anulacion-row"><span>Total</span><span className="anulacion-total">{formatPrecio(venta.total)}</span></div>
            <div className="anulacion-row"><span>Método</span><span>{venta.metodo_pago}</span></div>
          </div>

          {!onlineMode && (
            <>
              <label className="form-label">Motivo (opcional)</label>
              <input
                className="form-input"
                placeholder="Ej: error de precio, devolución…"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
              />
            </>
          )}

          {/* Modo online: solicitar y esperar */}
          {usarOnline && !onlineMode && (
            <div className="anulacion-online-info">
              <p>Red disponible — la solicitud se enviará al administrador para aprobación.</p>
              <button className="btn-ghost" onClick={() => setForzoOffline(true)}>
                Usar PIN local
              </button>
            </div>
          )}

          {onlineMode && (
            <WaitingApproval
              venta={venta}
              onForzarOffline={() => { setOnlineMode(false); setForzoOffline(true) }}
              onSuccess={onSuccess}
              onClose={handleCancelarRemoto}
            />
          )}

          {/* Modo offline: PIN pad */}
          {(!usarOnline || forzoOffline) && !onlineMode && (
            <>
              {pinError && <p className="error-msg">{pinError}</p>}
              <PinOffline
                ventaId={venta.id}
                solicitanteId={usuario!.id}
                motivo={motivo}
                onSuccess={onSuccess}
                onError={(msg) => setPinError(msg)}
              />
            </>
          )}
        </div>

        {!onlineMode && usarOnline && !forzoOffline && (
          <div className="modal-footer">
            <button className="btn-ghost" onClick={onClose}>Cancelar</button>
            <button className="btn-danger" onClick={handleSolicitarOnline}>
              Solicitar anulación
            </button>
          </div>
        )}

        {onlineMode && (
          <div className="modal-footer">
            <button className="btn-ghost" onClick={handleCancelarRemoto}>
              Cancelar solicitud
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
