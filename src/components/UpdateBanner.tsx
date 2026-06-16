import { useEffect, useState } from 'react'

// Aviso global de actualización. El proceso main descarga la nueva versión
// automáticamente (autoDownload) y avisa por IPC; acá mostramos el estado y,
// cuando ya está descargada, el botón para reiniciar e instalar.
type Estado =
  | { fase: 'oculto' }
  | { fase: 'descargando'; version: string }
  | { fase: 'listo'; version: string }

export default function UpdateBanner() {
  const [estado, setEstado] = useState<Estado>({ fase: 'oculto' })

  useEffect(() => {
    const api = window.electronAPI.updater
    api.onAvailable((i) => setEstado({ fase: 'descargando', version: i.version }))
    api.onDescargado((i) => setEstado({ fase: 'listo', version: i.version }))
    return () => api.removeListeners()
  }, [])

  if (estado.fase === 'oculto') return null

  return (
    <div className={`update-banner${estado.fase === 'listo' ? ' listo' : ''}`}>
      {estado.fase === 'descargando' ? (
        <span className="update-banner-text">
          Descargando actualización {estado.version}…
        </span>
      ) : (
        <>
          <span className="update-banner-text">
            Actualización {estado.version} lista para instalar.
          </span>
          <button
            className="update-banner-btn"
            onClick={() => window.electronAPI.updater.instalar()}
          >
            Reiniciar e instalar
          </button>
        </>
      )}
    </div>
  )
}
