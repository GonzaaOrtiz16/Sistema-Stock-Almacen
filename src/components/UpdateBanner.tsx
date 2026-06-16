import { useUpdateStore } from '../store/updateStore'

// Aviso global de actualización. El proceso main descarga la nueva versión
// automáticamente (autoDownload) y avisa por IPC; el estado se centraliza en
// updateStore (lo alimenta App). Acá sólo mostramos el banner según la fase.
export default function UpdateBanner() {
  const fase = useUpdateStore((s) => s.fase)
  const nuevaVersion = useUpdateStore((s) => s.nuevaVersion)

  if (fase !== 'descargando' && fase !== 'listo') return null

  return (
    <div className={`update-banner${fase === 'listo' ? ' listo' : ''}`}>
      {fase === 'descargando' ? (
        <span className="update-banner-text">
          Descargando actualización {nuevaVersion}…
        </span>
      ) : (
        <>
          <span className="update-banner-text">
            Actualización {nuevaVersion} lista para instalar.
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
