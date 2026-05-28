import { autoUpdater } from 'electron-updater'
import { BrowserWindow } from 'electron'
import log from '../../utils/logger'

// Configura electron-updater para publicaciones en GitHub Releases.
// Para activar:
// 1. Completar electron-builder.yml → publish con owner/repo
// 2. Crear GitHub release con el binario publicado
// Los usuarios con la app instalada recibirán la notificación automáticamente.
export function setupAutoUpdater(): void {
  const hasPublishConfig = !!process.env.GH_TOKEN

  if (!hasPublishConfig && process.env.NODE_ENV !== 'development') {
    log.info('[AutoUpdater] Sin GH_TOKEN — auto-update deshabilitado')
    return
  }

  autoUpdater.logger = log
  autoUpdater.autoDownload = false           // el usuario decide cuándo descargar
  autoUpdater.autoInstallOnAppQuit = true    // instala al cerrar si ya se descargó

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
  })

  // Verificar al inicio (falla silenciosamente si no hay configuración de publish)
  autoUpdater.checkForUpdatesAndNotify().catch((err) => {
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
