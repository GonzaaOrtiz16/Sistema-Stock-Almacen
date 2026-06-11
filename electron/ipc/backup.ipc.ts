import { ipcMain, shell } from 'electron'
import { IPC } from '../../shared/constants'
import { ejecutarBackup } from '../services/backup/BackupService'

export function registerBackupHandlers(): void {
  // Backup manual ("Hacer backup ahora"). Al terminar, abre la carpeta del día.
  ipcMain.handle(IPC.BACKUP_EJECUTAR, async () => {
    const r = await ejecutarBackup()
    if (r.ok && r.carpeta) shell.openPath(r.carpeta).catch(() => undefined)
    return r
  })
}
