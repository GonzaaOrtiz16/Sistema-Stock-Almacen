import { autoUpdater } from 'electron-updater'
import { BrowserWindow } from 'electron'
import log from '../../utils/logger'

// Configura electron-updater para publicaciones en GitHub Releases.
// Para activar:
// 1. Completar electron-builder.yml → publish con owner/repo
// 2. Crear GitHub release con el binario publicado
// Los usuarios con la app instalada recibirán la notificación automáticamente.
export function setupAutoUpdater(): void {
  autoUpdater.logger = log
  autoUpdater.autoDownload = true         // descarga la actualización apenas la detecta
  autoUpdater.autoInstallOnAppQuit = true // instala al cerrar si ya se descargó

  // La app NO está firmada digitalmente. En Windows, electron-updater verifica
  // la firma del instalador descargado y, al fallar, descarta la actualización
  // (quedaba "descargando" para siempre). Como no hay firma que verificar,
  // sobreescribimos la verificación para que no bloquee. Reactivar SOLO si en el
  // futuro se firma el instalador con un certificado real.
  ;(autoUpdater as unknown as {
    verifyUpdateCodeSignature: () => Promise<string | null>
  }).verifyUpdateCodeSignature = () => Promise.resolve(null)

  autoUpdater.on('checking-for-update', () => {
    log.info('[AutoUpdater] Buscando actualizaciones…')
  })

  autoUpdater.on('update-available', (info) => {
    log.info(`[AutoUpdater] Nueva versión disponible: ${info.version}`)
    notify('updater:available', { version: info.version, releaseDate: info.releaseDate })
  })

  autoUpdater.on('update-not-available', () => {
    log.info('[AutoUpdater] La app está actualizada')
  })

  autoUpdater.on('download-progress', (progress) => {
    log.debug(`[AutoUpdater] Descargando… ${Math.round(progress.percent)}%`)
    notify('updater:progress', { percent: Math.round(progress.percent) })
  })

  autoUpdater.on('update-downloaded', (info) => {
    log.info(`[AutoUpdater] Versión ${info.version} descargada — lista para instalar`)
    notify('updater:downloaded', { version: info.version })
  })

  autoUpdater.on('error', (err) => {
    log.error('[AutoUpdater] Error:', err.message)
    // Avisamos al renderer para que no quede mostrando "descargando" sin fin.
    notify('updater:error', { message: err.message })
  })

  autoUpdater.checkForUpdates().catch((err) => {
    log.debug('[AutoUpdater] No se pudo verificar actualizaciones:', err.message)
  })
}

export function downloadUpdate(): void {
  autoUpdater.downloadUpdate().catch((err) => {
    log.error('[AutoUpdater] Error al descargar:', err)
  })
}

export function installUpdate(): void {
  autoUpdater.quitAndInstall(false, true)
}

function notify(channel: string, payload: unknown): void {
  BrowserWindow.getAllWindows().forEach((w) => {
    if (!w.isDestroyed()) w.webContents.send(channel, payload)
  })
}
