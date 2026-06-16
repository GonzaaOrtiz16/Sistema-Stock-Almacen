import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'
import { getDb, closeDb, checkpointDb } from './db/client'
import { seedIfEmpty } from './db/seed'
import { SyncEngine } from './services/sync/SyncEngine'
import { setupAutoUpdater, installUpdate } from './services/updater/AutoUpdater'
import log from './utils/logger'
import { registerProductosHandlers } from './ipc/productos.ipc'
import { registerVentasHandlers } from './ipc/ventas.ipc'
import { registerCajaHandlers } from './ipc/caja.ipc'
import { registerUsuariosHandlers } from './ipc/usuarios.ipc'
import { registerSyncHandlers } from './ipc/sync.ipc'
import { registerReportesHandlers } from './ipc/reportes.ipc'
import { registerPrinterHandlers } from './ipc/printer.ipc'
import { registerBackupHandlers } from './ipc/backup.ipc'
import { startBackupScheduler, stopBackupScheduler } from './services/backup/BackupService'
import { IPC } from '../shared/constants'

let mainWindow: BrowserWindow | null = null
let syncEngine: SyncEngine | null = null
let checkpointTimer: ReturnType<typeof setInterval> | null = null

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) { app.quit(); process.exit(0) }

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1024,
    minHeight: 680,
    title: 'Almacén Minimercado Gabriela',
    backgroundColor: '#0f0f1a',
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: join(__dirname, 'preload.js'),
      spellcheck: false,
    },
  })

  if (!process.env.VITE_DEV_SERVER_URL) mainWindow.setMenu(null)

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => { mainWindow = null })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../dist/index.html'))
  }
}

function registerIpcHandlers(): void {
  registerProductosHandlers()
  registerVentasHandlers()
  registerCajaHandlers()
  registerUsuariosHandlers()
  registerSyncHandlers(syncEngine!)
  registerReportesHandlers()
  registerPrinterHandlers()
  registerBackupHandlers()

  // Instalar actualización cuando el renderer lo solicite
  ipcMain.on(IPC.UPDATER_INSTALL, () => installUpdate())
}

app.whenReady().then(() => {
  log.info(`[Main] Almacén Gabriela v${app.getVersion()} iniciando`)
  log.info(`[Main] userData: ${app.getPath('userData')}`)

  const db = getDb()
  seedIfEmpty(db)

  syncEngine = new SyncEngine()
  registerIpcHandlers()
  syncEngine.start()

  // Backup diario automático de toda la data (ventas, stock y reportes)
  startBackupScheduler()

  // Red de seguridad: volcamos el WAL a la base principal cada 30 s. Así, aunque
  // la PC se apague de golpe o el proceso muera sin cerrar limpio, lo cargado
  // queda en gabriela.db y no se pierde al reabrir.
  checkpointTimer = setInterval(checkpointDb, 30_000)

  createWindow()

  // Auto-updater (solo en producción)
  if (!process.env.VITE_DEV_SERVER_URL) {
    setupAutoUpdater()
  }
})

// `before-quit` cubre TODA salida (cerrar ventana, Alt+F4, apagado de Windows,
// quit del updater), no sólo window-all-closed. Cerramos la base acá para
// garantizar el checkpoint final en cualquier caso de cierre ordenado.
app.on('before-quit', () => {
  if (checkpointTimer) { clearInterval(checkpointTimer); checkpointTimer = null }
  syncEngine?.stop()
  stopBackupScheduler()
  closeDb()
  log.info('[Main] Cerrando aplicación')
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
