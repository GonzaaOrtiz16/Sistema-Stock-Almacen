import { ipcMain, dialog, BrowserWindow } from 'electron'
import { getDb } from '../db/client'
import { createProductosRepo } from '../db/repositories/productos.repo'
import { IPC } from '../../shared/constants'
import type { ProductoCreateInput, ProductoUpdateInput, ActualizacionMasiva } from '../../shared/types/producto.types'
import log from '../utils/logger'
import * as XLSX from 'xlsx'
import * as fs from 'fs'

export function registerProductosHandlers(): void {
  const db   = getDb()
  const repo = createProductosRepo(db)

  ipcMain.handle(IPC.PRODUCTOS_BUSCAR_BARCODE, (_e, barcode: string) => {
    return repo.buscarPorBarcode(barcode)
  })

  ipcMain.handle(IPC.PRODUCTOS_BUSCAR_NOMBRE, (_e, nombre: string) => {
    return repo.buscarPorNombre(nombre)
  })

  ipcMain.handle(IPC.PRODUCTOS_LISTAR, () => {
    return repo.listar()
  })

  ipcMain.handle(IPC.PRODUCTOS_CREAR, (_e, input: ProductoCreateInput) => {
    return repo.crear(input)
  })

  ipcMain.handle(IPC.PRODUCTOS_ACTUALIZAR, (_e, input: ProductoUpdateInput) => {
    return repo.actualizar(input)
  })

  ipcMain.handle(IPC.PRODUCTOS_ACTUALIZAR_MASIVO, (_e, input: ActualizacionMasiva) => {
    const affected = repo.actualizarPreciosMasivo(input)
    log.info(`[IPC] actualizar-masivo: ${affected} productos afectados (${input.tipo}, ${input.porcentaje}%)`)
    return affected
  })

  ipcMain.handle(IPC.PRODUCTOS_AGREGAR_STOCK, (_e, id: number, cantidad: number) => {
    return repo.agregarStock(id, cantidad)
  })

  ipcMain.handle(IPC.PRODUCTOS_PENDIENTES_LISTAR, () => {
    return repo.pendientesListar()
  })

  ipcMain.handle(IPC.PRODUCTOS_PENDIENTES_AGREGAR, (_e, codigo: string) => {
    return repo.pendientesAgregar(codigo)
  })

  ipcMain.handle(IPC.PRODUCTOS_PENDIENTES_ELIMINAR, (_e, codigo: string) => {
    return repo.pendientesEliminar(codigo)
  })

  ipcMain.handle(IPC.PRODUCTOS_IMPORTAR_EXCEL, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? undefined
    const result = await dialog.showOpenDialog(win!, {
      title: 'Seleccionar archivo de inventario',
      filters: [{ name: 'Excel', extensions: ['xlsx', 'xls'] }],
      properties: ['openFile'],
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { ok: false, error: 'Cancelado' }
    }

    const filePath = result.filePaths[0]
    try {
      const buffer = fs.readFileSync(filePath)
      const wb   = XLSX.read(buffer, { type: 'buffer' })
      const ws   = wb.Sheets[wb.SheetNames[0]]
      const rows = (XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][]).slice(1)

      const productos = rows
        .filter((r) => r[1] && String(r[1]).trim() !== '')
        .map((r) => ({
          barcode: r[0] ? String(r[0]).trim() : null,
          nombre:  String(r[1]).trim(),
          precio:  (r[2] && Number(r[2]) > 0) ? Number(r[2]) : 0,
          stock:   (r[3] && Number(r[3]) > 0) ? Number(r[3]) : 0,
        }))

      const insert = db.prepare(`
        INSERT INTO productos
          (codigo_barras, nombre, precio_venta, precio_costo, stock_actual, stock_minimo, unidad, categoria_id)
        VALUES
          (@barcode, @nombre, @precio, NULL, @stock, 0, 'unidad', NULL)
      `)

      let importados = 0
      db.transaction(() => {
        db.prepare('DELETE FROM anulaciones').run()
        db.prepare('DELETE FROM detalle_ventas').run()
        db.prepare('DELETE FROM ventas').run()
        db.prepare('DELETE FROM turnos_caja').run()
        db.prepare('DELETE FROM productos').run()
        db.prepare('DELETE FROM categorias').run()

        for (const p of productos) {
          try {
            insert.run({ barcode: p.barcode, nombre: p.nombre, precio: p.precio, stock: p.stock })
          } catch {
            insert.run({ barcode: null, nombre: p.nombre, precio: p.precio, stock: p.stock })
          }
          importados++
        }
      })()

      log.info(`[IPC] importar-excel: ${importados} productos importados desde ${filePath}`)
      return { ok: true, importados }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      log.error(`[IPC] importar-excel error: ${msg}`)
      return { ok: false, error: msg }
    }
  })
}
