import { app } from 'electron'
import { join } from 'path'
import { writeFileSync } from 'fs'
import { spawn } from 'child_process'
import log from '../../utils/logger'

// Envía bytes RAW (ESC/POS) directo a una impresora de Windows usando la API
// winspool vía PowerShell P/Invoke. No requiere módulos nativos npm y evita el
// render gráfico de Chromium, que el driver POS-80C descarta.

const PS_SENDER = `param([string]$PrinterName, [string]$FilePath)
$ErrorActionPreference = 'Stop'
if (-not $PrinterName) {
  $d = Get-CimInstance Win32_Printer -Filter "Default=true"
  if ($d) { $PrinterName = $d.Name }
}
$code = @"
using System;
using System.Runtime.InteropServices;
public class RawPrinterHelper {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct DOCINFOA {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
  }
  [DllImport("winspool.Drv", EntryPoint="OpenPrinterW", SetLastError=true, CharSet=CharSet.Unicode)]
  public static extern bool OpenPrinter(string src, out IntPtr hPrinter, IntPtr pd);
  [DllImport("winspool.Drv", EntryPoint="ClosePrinter", SetLastError=true)]
  public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="StartDocPrinterW", SetLastError=true, CharSet=CharSet.Unicode)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, int level, ref DOCINFOA di);
  [DllImport("winspool.Drv", EntryPoint="EndDocPrinter", SetLastError=true)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="StartPagePrinter", SetLastError=true)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="EndPagePrinter", SetLastError=true)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="WritePrinter", SetLastError=true)]
  public static extern bool WritePrinter(IntPtr hPrinter, byte[] pBytes, int dwCount, out int dwWritten);
  public static bool SendBytes(string printer, byte[] bytes) {
    IntPtr h;
    if (!OpenPrinter(printer, out h, IntPtr.Zero)) return false;
    DOCINFOA di = new DOCINFOA();
    di.pDocName = "Ticket Venta";
    di.pDataType = "RAW";
    bool ok = false;
    if (StartDocPrinter(h, 1, ref di)) {
      if (StartPagePrinter(h)) {
        int written;
        ok = WritePrinter(h, bytes, bytes.Length, out written);
        EndPagePrinter(h);
      }
      EndDocPrinter(h);
    }
    ClosePrinter(h);
    return ok;
  }
}
"@
Add-Type -TypeDefinition $code -Language CSharp
$bytes = [System.IO.File]::ReadAllBytes($FilePath)
if ([RawPrinterHelper]::SendBytes($PrinterName, $bytes)) { exit 0 } else { exit 2 }
`

export function rawPrint(deviceName: string, data: Buffer): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    try {
      const tmp = app.getPath('temp')
      const ps1 = join(tmp, 'amg_rawprint.ps1')
      const bin = join(tmp, `amg_ticket_${Date.now()}.bin`)
      writeFileSync(ps1, PS_SENDER, 'utf-8')
      writeFileSync(bin, data)

      const child = spawn('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-File', ps1,
        '-PrinterName', deviceName || '',
        '-FilePath', bin,
      ], { windowsHide: true })

      let stderr = ''
      child.stderr.on('data', (d) => { stderr += d.toString() })

      child.on('error', (err) => {
        log.error('[Printer] spawn powershell falló:', err.message)
        resolve({ ok: false, error: err.message })
      })

      child.on('close', (code) => {
        if (code === 0) resolve({ ok: true })
        else {
          const msg = stderr.trim() || `PowerShell salió con código ${code}`
          log.warn('[Printer] rawPrint falló:', msg)
          resolve({ ok: false, error: msg })
        }
      })
    } catch (err) {
      resolve({ ok: false, error: (err as Error).message })
    }
  })
}
