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

      // Seguridad: nunca borramos el inventario actual si el archivo no trae
      // productos válidos (Excel vacío, mal formato o columnas equivocadas).
      // Sin esta guarda, un archivo erróneo dejaría el almacén sin productos.
      if (productos.length === 0) {
        log.warn(`[IPC] importar-excel: archivo sin productos válidos, importación abortada (${filePath})`)
        return { ok: false, error: 'El archivo no contiene productos válidos. No se borró nada.' }
      }

      // Merge NO destructivo: no se borra nada. Comparamos por código de barras
      // (y por nombre cuando la fila no tiene código). Si el producto ya existe,
      // se deja tal cual está en el sistema. Sólo se dan de alta los que faltan.
      const existeBarcode = db.prepare('SELECT 1 FROM productos WHERE codigo_barras = ?')
      const existeNombre  = db.prepare(
        'SELECT 1 FROM productos WHERE activo = 1 AND lower(nombre) = lower(?)',
      )
      const normNombre = (s: string) =>
        s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()

      // Clave de identidad: el código si hay, si no el nombre normalizado. Sirve
      // para no insertar dos veces algo repetido dentro del mismo Excel.
      const vistos = new Set<string>()
      const nuevos: typeof productos = []
      for (const p of productos) {
        const clave = p.barcode ? `b:${p.barcode}` : `n:${normNombre(p.nombre)}`
        if (vistos.has(clave)) continue
        vistos.add(clave)

        const yaExiste = p.barcode
          ? existeBarcode.get(p.barcode)
          : existeNombre.get(p.nombre)
        if (!yaExiste) nuevos.push(p)
      }

      const existentes = productos.length - nuevos.length

      if (nuevos.length === 0) {
        log.info(`[IPC] importar-excel: 0 nuevos (${existentes} ya existían) desde ${filePath}`)
        return { ok: true, importados: 0, existentes }
      }

      // Confirmación: acción segura (sólo agrega), pero confirmamos igual para
      // que quede claro qué va a pasar.
      const confirm = await dialog.showMessageBox(win!, {
        type: 'question',
        buttons: ['Cancelar', `Agregar ${nuevos.length} nuevos`],
        defaultId: 1,
        cancelId: 0,
        title: 'Importar desde Excel',
        message: `Se agregarán ${nuevos.length} productos nuevos.`,
        detail: `Los ${existentes} que ya existen no se modifican. No se borra nada (ni productos ni ventas). ¿Continuar?`,
      })
      if (confirm.response !== 1) {
        return { ok: false, error: 'Cancelado' }
      }

      const insert = db.prepare(`
        INSERT INTO productos
          (uuid, codigo_barras, nombre, precio_venta, precio_costo, stock_actual, stock_minimo, unidad, categoria_id)
        VALUES
          (lower(hex(randomblob(16))), @barcode, @nombre, @precio, NULL, @stock, 0, 'unidad', NULL)
      `)

      let importados = 0
      db.transaction(() => {
        for (const p of nuevos) {
          try {
            insert.run({ barcode: p.barcode, nombre: p.nombre, precio: p.precio, stock: p.stock })
          } catch {
            // Choque de código único u otro problema puntual: lo damos de alta
            // sin código antes que perder el producto.
            insert.run({ barcode: null, nombre: p.nombre, precio: p.precio, stock: p.stock })
          }
          importados++
        }
      })()

      log.info(`[IPC] importar-excel: ${importados} nuevos agregados, ${existentes} ya existían (${filePath})`)
      return { ok: true, importados, existentes }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      log.error(`[IPC] importar-excel error: ${msg}`)
      return { ok: false, error: msg }
    }
  })
}
