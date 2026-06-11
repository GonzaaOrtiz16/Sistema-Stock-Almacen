import { useCallback, useEffect, useState } from 'react'
import type { Usuario } from '@shared/types/venta.types'
import { useCajaStore } from '../../store/cajaStore'
import UsuarioForm from './UsuarioForm'

const ROL_LABEL: Record<string, string> = {
  admin:      'Administrador',
  supervisor: 'Supervisor',
  cajero:     'Vendedor',
}

export default function UsuariosPage() {
  const { usuario: actual, setUsuario } = useCajaStore()
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [loading,  setLoading]  = useState(false)
  const [editar,   setEditar]   = useState<Usuario | null>(null)
  const [creando,  setCreando]  = useState(false)
  const [toast,    setToast]    = useState('')

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      setUsuarios(await window.electronAPI.usuarios.listar())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { cargar() }, [cargar])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  function onGuardado(u: Usuario) {
    // Si se editó al usuario logueado, refrescar la sesión (nombre en la barra)
    if (actual && u.id === actual.id) setUsuario({ ...actual, nombre: u.nombre })
    setUsuarios((prev) => {
      const idx = prev.findIndex((x) => x.id === u.id)
      return idx >= 0 ? prev.map((x) => (x.id === u.id ? u : x)) : [...prev, u]
    })
    const eraCreacion = creando
    setEditar(null)
    setCreando(false)
    showToast(eraCreacion ? `Vendedor "${u.nombre}" creado` : `Usuario "${u.nombre}" actualizado`)
  }

  return (
    <div className="usuarios-page">
      <header className="usuarios-header">
        <h2 className="usuarios-title">Usuarios</h2>
        {toast && <span className="scan-toast">{toast}</span>}
        <button className="btn-primary" onClick={() => setCreando(true)}>
          + Nuevo vendedor
        </button>
      </header>

      <div className="usuarios-list">
        {loading ? (
          <p className="inv-loading">Cargando…</p>
        ) : usuarios.length === 0 ? (
          <p className="inv-empty">No hay usuarios cargados</p>
        ) : (
          usuarios.map((u) => (
            <div key={u.id} className="usuario-card">
              <div className="usuario-info">
                <span className="usuario-nombre">{u.nombre}</span>
                <span className={`usuario-rol rol-${u.rol}`}>{ROL_LABEL[u.rol] ?? u.rol}</span>
                {actual && u.id === actual.id && <span className="usuario-yo">vos</span>}
              </div>
              <button className="btn-ghost" onClick={() => setEditar(u)}>
                Editar
              </button>
            </div>
          ))
        )}
      </div>

      {creando && (
        <UsuarioForm
          onSuccess={onGuardado}
          onClose={() => setCreando(false)}
        />
      )}

      {editar && (
        <UsuarioForm
          usuario={editar}
          selfEdit={!!actual && editar.id === actual.id}
          onSuccess={onGuardado}
          onClose={() => setEditar(null)}
        />
      )}
    </div>
  )
}
