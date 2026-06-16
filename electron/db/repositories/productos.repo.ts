import type Database from 'better-sqlite3'
import type {
  Producto,
  ProductoCreateInput,
  ProductoUpdateInput,
  ActualizacionMasiva,
  PendienteCodigo,
} from '../../../shared/types/producto.types'

export type ProductosRepo = ReturnType<typeof createProductosRepo>

export function createProductosRepo(db: Database.Database) {
  // Prepared statements compilados una sola vez para máxima performance
  const stmtByBarcode = db.prepare(
    'SELECT * FROM productos WHERE codigo_barras = ? AND activo = 1',
  )
  // Normaliza igual que la función SQL `unaccent`: sin acentos y en minúsculas.
  const normalizar = (s: string): string =>
    s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const stmtAll = db.prepare(
    'SELECT * FROM productos WHERE activo = 1 ORDER BY nombre COLLATE NOCASE',
  )
  const stmtById = db.prepare('SELECT * FROM productos WHERE id = ?')

  const stmtInsert = db.prepare(`
    INSERT INTO productos
      (codigo_barras, nombre, precio_venta, precio_costo, stock_actual, stock_minimo, unidad, categoria_id)
    VALUES
      (@codigo_barras, @nombre, @precio_venta, @precio_costo, @stock_actual, @stock_minimo, @unidad, @categoria_id)
  `)

  const stmtUpdate = db.prepare(`
    UPDATE productos SET
      codigo_barras = @codigo_barras,
      nombre        = @nombre,
      precio_venta  = @precio_venta,
      precio_costo  = @precio_costo,
      stock_actual  = @stock_actual,
      stock_minimo  = @stock_minimo,
      unidad        = @unidad,
      categoria_id  = @categoria_id,
      updated_at    = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
      sync_status   = 'pending'
    WHERE id = @id
  `)

  const stmtMasivoClobal = db.prepare(`
    UPDATE productos
    SET precio_venta = ROUND(precio_venta * (1 + CAST(? AS REAL) / 100.0), 2),
        updated_at  = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
        sync_status = 'pending'
    WHERE activo = 1
  `)

  const stmtMasivoCategoria = db.prepare(`
    UPDATE productos
    SET precio_venta = ROUND(precio_venta * (1 + CAST(? AS REAL) / 100.0), 2),
        updated_at  = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
        sync_status = 'pending'
    WHERE activo = 1 AND categoria_id = ?
  `)

  const stmtDecrStock = db.prepare(
    'UPDATE productos SET stock_actual = stock_actual - @cantidad WHERE id = @producto_id',
  )

  const stmtIncrStock = db.prepare(
    'UPDATE productos SET stock_actual = stock_actual + @cantidad, updated_at = strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\'), sync_status = \'pending\' WHERE id = @id',
  )

  // Códigos pendientes (escaneados en caja sin producto asociado)
  const stmtPendListar = db.prepare(
    'SELECT * FROM pendientes_codigo ORDER BY created_at DESC',
  )
  const stmtPendUpsert = db.prepare(`
    INSERT INTO pendientes_codigo (codigo_barras) VALUES (@codigo)
    ON CONFLICT(codigo_barras) DO UPDATE SET veces = veces + 1
  `)
  const stmtPendEliminar = db.prepare('DELETE FROM pendientes_codigo WHERE codigo_barras = @codigo')

  return {
    buscarPorBarcode(barcode: string): Producto | null {
      return (stmtByBarcode.get(barcode) as Producto | undefined) ?? null
    },

    // Búsqueda inteligente para la caja:
    //  · tolera acentos y mayúsculas (vía la función SQL `unaccent`)
    //  · acepta varias palabras en cualquier orden ("coca grande" → "Coca Cola Grande")
    //  · cada palabra puede coincidir con el nombre o con el código de barras
    //  · ordena por relevancia: coincidencia exacta › empieza con › palabra › contiene,
    //    y entre iguales prioriza los que tienen stock
    buscarPorNombre(nombre: string): Producto[] {
      const full = normalizar(nombre.trim())
      if (!full) return []

      const tokens = full.split(/\s+/).filter(Boolean).slice(0, 6)
      if (tokens.length === 0) return []

      // Cada token debe aparecer en el nombre (sin acentos) o en el código.
      const where = tokens
        .map(() => '(unaccent(nombre) LIKE ? OR codigo_barras LIKE ?)')
        .join(' AND ')

      const tokenParams: string[] = []
      for (const t of tokens) {
        tokenParams.push(`%${t}%`, `%${t}%`)
      }

      const sql = `
        SELECT *,
          CASE
            WHEN unaccent(nombre) = ?                  THEN 0
            WHEN unaccent(nombre) LIKE ? || '%'        THEN 1
            WHEN unaccent(nombre) LIKE '%' || ? || '%' AND unaccent(nombre) LIKE '% ' || ? || '%' THEN 2
            ELSE 3
          END AS _rank
        FROM productos
        WHERE activo = 1 AND (${where})
        ORDER BY _rank ASC, (stock_actual <= 0) ASC, nombre COLLATE NOCASE
        LIMIT 30
      `

      const rankParams = [full, full, full, full]
      const rows = db.prepare(sql).all(...rankParams, ...tokenParams) as Array<
        Producto & { _rank?: number }
      >
      return rows.map(({ _rank, ...p }) => p as Producto)
    },

    listar(): Producto[] {
      return stmtAll.all() as Producto[]
    },

    crear(input: ProductoCreateInput): Producto {
      const row = {
        codigo_barras: input.codigo_barras ?? null,
        nombre:        input.nombre,
        precio_venta:  input.precio_venta,
        precio_costo:  input.precio_costo ?? null,
        stock_actual:  input.stock_actual ?? 0,
        stock_minimo:  input.stock_minimo ?? 0,
        unidad:        input.unidad ?? 'unidad',
        categoria_id:  input.categoria_id ?? null,
      }
      const res = stmtInsert.run(row)
      return stmtById.get(Number(res.lastInsertRowid)) as Producto
    },

    actualizar(input: ProductoUpdateInput): Producto {
      const current = stmtById.get(input.id) as Producto | undefined
      if (!current) throw new Error(`Producto ${input.id} no encontrado`)

      stmtUpdate.run({
        id:            input.id,
        codigo_barras: input.codigo_barras ?? current.codigo_barras,
        nombre:        input.nombre        ?? current.nombre,
        precio_venta:  input.precio_venta  ?? current.precio_venta,
        precio_costo:  input.precio_costo  ?? current.precio_costo,
        stock_actual:  input.stock_actual  ?? current.stock_actual,
        stock_minimo:  input.stock_minimo  ?? current.stock_minimo,
        unidad:        input.unidad        ?? current.unidad,
        categoria_id:  input.categoria_id  ?? current.categoria_id,
      })
      return stmtById.get(input.id) as Producto
    },

    actualizarPreciosMasivo(input: ActualizacionMasiva): number {
      let result: Database.RunResult
      if (input.tipo === 'porcentaje_global') {
        result = stmtMasivoClobal.run(input.porcentaje)
      } else {
        if (input.categoria_id == null) throw new Error('categoria_id requerido para actualización por categoría')
        result = stmtMasivoCategoria.run(input.porcentaje, input.categoria_id)
      }
      return result.changes
    },

    decrementarStock(producto_id: number, cantidad: number): void {
      stmtDecrStock.run({ cantidad, producto_id })
    },

    agregarStock(id: number, cantidad: number): Producto {
      stmtIncrStock.run({ id, cantidad })
      return stmtById.get(id) as Producto
    },

    pendientesListar(): PendienteCodigo[] {
      return stmtPendListar.all() as PendienteCodigo[]
    },

    pendientesAgregar(codigo: string): PendienteCodigo[] {
      stmtPendUpsert.run({ codigo })
      return stmtPendListar.all() as PendienteCodigo[]
    },

    pendientesEliminar(codigo: string): PendienteCodigo[] {
      stmtPendEliminar.run({ codigo })
      return stmtPendListar.all() as PendienteCodigo[]
    },
  }
}
