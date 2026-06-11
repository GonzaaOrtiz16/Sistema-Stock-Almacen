import { useState } from 'react'
import type { Usuario } from '@shared/types/venta.types'

interface Props {
  usuario?: Usuario     // presente → modo edición
  selfEdit?: boolean    // el usuario edita su propio perfil
  onSuccess: (u: Usuario) => void
  onClose: () => void
}

const soloDigitos = (v: string) => v.replace(/\D/g, '').slice(0, 4)

export default function UsuarioForm({ usuario, selfEdit, onSuccess, onClose }: Props) {
  const editar = !!usuario
  const [nombre,     setNombre]     = useState(usuario?.nombre ?? '')
  const [pin,        setPin]        = useState('')
  const [confirmar,  setConfirmar]  = useState('')
  const [guardando,  setGuardando]  = useState(false)
  const [error,      setError]      = useState('')

  const titulo = selfEdit ? 'Mi perfil' : editar ? 'Editar usuario' : 'Nuevo vendedor'

  function validar(): string | null {
    if (!nombre.trim()) return 'Ingresá el nombre'
    // En alta el PIN es obligatorio; en edición es opcional (vacío = no cambiar)
    if (!editar && pin.length === 0) return 'Ingresá un PIN'
    if (pin.length > 0) {
      if (pin.length !== 4) return 'El PIN debe tener 4 dígitos'
      if (pin !== confirmar) return 'El PIN y su confirmación no coinciden'
    }
    return null
  }

  async function guardar() {
    const err = validar()
    if (err) { setError(err); return }
    setGuardando(true)
    setError('')
    try {
      const u = editar
        ? await window.electronAPI.usuarios.actualizar({
            id:     usuario!.id,
            nombre: nombre.trim(),
            pin:    pin.length === 4 ? pin : undefined,
          })
        : await window.electronAPI.usuarios.crear({ nombre: nombre.trim(), pin })
      onSuccess(u)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar')
      setGuardando(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal payment-modal" onClick={(e) => e.stopPropagation()}>

        <div className="modal-header">
          <h2>{titulo}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <label className="form-label">Nombre</label>
          <input
            className="form-input"
            placeholder="Nombre del vendedor"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            autoFocus
          />

          <label className="form-label" style={{ marginTop: 14 }}>
            {editar ? 'Nuevo PIN (4 dígitos)' : 'PIN (4 dígitos)'}
          </label>
          <input
            className="form-input"
            type="password"
            inputMode="numeric"
            placeholder={editar ? 'Dejar vacío para no cambiarlo' : '••••'}
            value={pin}
            onChange={(e) => setPin(soloDigitos(e.target.value))}
          />

          <label className="form-label" style={{ marginTop: 14 }}>Confirmar PIN</label>
          <input
            className="form-input"
            type="password"
            inputMode="numeric"
            placeholder="Repetir el PIN"
            value={confirmar}
            onChange={(e) => setConfirmar(soloDigitos(e.target.value))}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); guardar() } }}
          />

          {error && <p className="error-msg" style={{ marginTop: 12 }}>{error}</p>}
        </div>

        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose} disabled={guardando}>Cancelar</button>
          <button className="btn-confirm" onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando…' : editar ? 'Guardar cambios' : 'Crear vendedor'}
          </button>
        </div>

      </div>
    </div>
  )
}
