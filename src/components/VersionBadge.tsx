import { useUpdateStore } from '../store/updateStore'

// Insignia fija que muestra SIEMPRE la versión instalada. Cuando el auto-updater
// detecta una nueva versión, agrega un ícono de descarga y un signo de
// admiración amarillo. Si la actualización ya se descargó, queda clickeable para
// reiniciar e instalar.
export default function VersionBadge() {
  const version = useUpdateStore((s) => s.version)
  const fase = useUpdateStore((s) => s.fase)
  const nuevaVersion = useUpdateStore((s) => s.nuevaVersion)
  const error = useUpdateStore((s) => s.error)

  const hayUpdate = fase === 'descargando' || fase === 'listo'
  const listo = fase === 'listo'
  const fallo = fase === 'error'

  const titulo = listo
    ? `Actualización ${nuevaVersion} lista — clic para reiniciar e instalar`
    : fase === 'descargando'
      ? `Descargando actualización ${nuevaVersion}…`
      : fallo
        ? `No se pudo actualizar: ${error ?? 'error desconocido'}`
        : `Versión ${version || '—'}`

  return (
    <div
      className={`version-badge${hayUpdate ? ' tiene-update' : ''}${fallo ? ' fallo' : ''}${listo ? ' clickable' : ''}`}
      title={titulo}
      onClick={listo ? () => window.electronAPI.updater.instalar() : undefined}
    >
      <span className="version-badge-text">v{version || '—'}</span>

      {hayUpdate && (
        <span className="version-badge-update">
          {/* Ícono de descarga */}
          <svg
            className="version-badge-icon"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 3v12" />
            <path d="m7 10 5 5 5-5" />
            <path d="M5 21h14" />
          </svg>
          {/* Signo de admiración amarillo */}
          <span className="version-badge-bang" aria-label="Actualización pendiente">!</span>
        </span>
      )}

      {fallo && (
        <span className="version-badge-bang fallo" aria-label="Error al actualizar">!</span>
      )}
    </div>
  )
}
