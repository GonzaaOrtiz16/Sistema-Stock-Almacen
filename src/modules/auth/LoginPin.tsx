import { useEffect, useRef, useState } from 'react'
import { useCajaStore } from '../../store/cajaStore'

interface UsuarioPublico {
  id: number
  nombre: string
  rol: string
}

const ROL_LABEL: Record<string, string> = {
  admin:      'Administrador',
  supervisor: 'Supervisor',
  cajero:     'Cajero',
}

// ── Paso 1: elegir usuario ───────────────────────────────────────────────────
function UserSelector({ onSelect }: { onSelect: (u: UsuarioPublico) => void }) {
  const [usuarios, setUsuarios] = useState<UsuarioPublico[]>([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    window.electronAPI.auth.listarUsuarios()
      .then(setUsuarios)
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="login-card">
      <h1 className="login-title">Almacén Minimercado Gabriela</h1>
      <p className="login-subtitle">¿Quién sos?</p>

      {loading ? (
        <p className="pin-loading">Cargando usuarios…</p>
      ) : (
        <div className="user-list">
          {usuarios.map((u) => (
            <button
              key={u.id}
              className="user-btn"
              onClick={() => onSelect(u)}
            >
              <span className="user-btn-name">{u.nombre}</span>
              <span className="user-btn-rol">{ROL_LABEL[u.rol] ?? u.rol}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Paso 2: ingresar PIN ─────────────────────────────────────────────────────
function PinEntry({
  usuario,
  onSuccess,
  onBack,
}: {
  usuario: UsuarioPublico
  onSuccess: () => void
  onBack: () => void
}) {
  const [pin,     setPin]     = useState('')
  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)
  const { setUsuario, setTurnoActivo } = useCajaStore()

  const pinRef     = useRef(pin)
  const loadingRef = useRef(loading)
  pinRef.current     = pin
  loadingRef.current = loading

  async function handleLogin(code: string) {
    setLoading(true)
    setError('')
    try {
      const result = await window.electronAPI.auth.login(code)
      // Validar que el PIN corresponde al usuario seleccionado
      if (!result || result.id !== usuario.id) {
        setError('PIN incorrecto')
        setPin('')
        return
      }
      const turno = await window.electronAPI.caja.turnoActivo(result.id)
      setUsuario(result)
      setTurnoActivo(turno)
      onSuccess()
    } catch {
      setError('Error interno — revisá los logs')
      setPin('')
    } finally {
      setLoading(false)
    }
  }

  function pressDigit(d: string) {
    if (loadingRef.current) return
    const next = pinRef.current.length < 4 ? pinRef.current + d : pinRef.current
    pinRef.current = next
    setPin(next)
    setError('')
    if (next.length === 4) handleLogin(next)
  }

  function pressBack() {
    if (loadingRef.current) return
    const next = pinRef.current.slice(0, -1)
    pinRef.current = next
    setPin(next)
    setError('')
  }

  // Teclado físico
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (loadingRef.current) return
      if (/^\d$/.test(e.key)) pressDigit(e.key)
      else if (e.key === 'Backspace') pressBack()
      else if (e.key === 'Escape') onBack()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, []) // usa refs — seguro con deps vacío

  const NUMPAD = ['1','2','3','4','5','6','7','8','9','←','0','OK'] as const

  return (
    <div className="login-card">
      <h1 className="login-title">Hola, {usuario.nombre}</h1>
      <p className="login-subtitle">Ingresá tu PIN</p>

      <div className="pin-dots" aria-label="PIN ingresado">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`pin-dot${i < pin.length ? ' filled' : ''}`} />
        ))}
      </div>

      {error   && <p className="pin-error"   role="alert">{error}</p>}
      {loading && <p className="pin-loading">Verificando…</p>}

      <div className="numpad" role="group" aria-label="Teclado numérico">
        {NUMPAD.map((k) => (
          <button
            key={k}
            className={`numpad-btn${k === '←' || k === 'OK' ? ' numpad-action' : ''}`}
            onClick={() => {
              if (k === '←') pressBack()
              else if (k === 'OK') { if (pinRef.current.length === 4) handleLogin(pinRef.current) }
              else pressDigit(k)
            }}
            disabled={loading}
          >
            {k}
          </button>
        ))}
      </div>

      <button className="btn-ghost login-back" onClick={onBack}>
        ← Cambiar usuario
      </button>
    </div>
  )
}

// ── Componente principal ─────────────────────────────────────────────────────
export default function LoginPin() {
  const [selected, setSelected] = useState<UsuarioPublico | null>(null)

  return (
    <div className="login-screen">
      {selected === null ? (
        <UserSelector onSelect={setSelected} />
      ) : (
        <PinEntry
          usuario={selected}
          onSuccess={() => { /* cajaStore ya fue actualizado en PinEntry */ }}
          onBack={() => setSelected(null)}
        />
      )}
    </div>
  )
}
