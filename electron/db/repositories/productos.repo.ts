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
  const stmtByUuid = db.prepare('SELECT * FROM productos WHERE uuid = ?')

  const stmtInsert = db.prepare(`
    INSERT INTO productos
      (uuid, codigo_barras, nombre, precio_venta, precio_costo, stock_actual, stock_minimo, unidad, categoria_id)
    VALUES
      (lower(hex(randomblob(16))), @codigo_barras, @nombre, @precio_venta, @precio_costo, @stock_actual, @stock_minimo, @unidad, @categoria_id)
  `)

  // Insert con uuid provisto (lo usa la Caja al ejecutar una orden 'crear' del
  // Gestor: ambos comparten el uuid → idempotente y consistente en el catálogo).
  const stmtInsertConUuid = db.prepare(`
    INSERT INTO productos
      (uuid, codigo_barras, nombre, precio_venta, precio_costo, stock_actual, stock_minimo, unidad, categoria_id)
    VALUES
      (@uuid, @codigo_barras, @nombre, @precio_venta, @precio_costo, @stock_actual, @stock_minimo, @unidad, @categoria_id)
  `)

  const stmtIncrStockUuid = db.prepare(`
    UPDATE productos SET stock_actual = stock_actual + @cantidad,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), sync_status = 'pending'
    WHERE uuid = @uuid
  `)

  // Actualiza SOLO nombre y precio (lo que el Gestor puede modificar de existentes).
  const stmtUpdateCamposUuid = db.prepare(`
    UPDATE productos SET
      nombre       = @nombre,
      precio_venta = @precio_venta,
      updated_at   = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
      sync_status  = 'pending'
    WHERE uuid = @uuid
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

  // La venta baja el stock y marca el producto como 'pending' para que el catálogo
  // publicado en Supabase refleje el stock actualizado (lo que ve el gestor remoto).
  const stmtDecrStock = db.prepare(
    `UPDATE productos SET stock_actual = stock_actual - @cantidad,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), sync_status = 'pending'
     WHERE id = @producto_id`,
  )

  const stmtIncrStock = db.prepare(
    'UPDATE productos SET stock_actual = stock_actual + @cantidad, updated_at = strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\'), sync_status = \'pending\' WHERE id = @id',
  )

  // Refleja una fila del catálogo (Supabase) en la base local del Gestor. Upsert
  // por uuid; queda 'synced' (el Gestor nunca publica el catálogo, solo lo lee).
  const stmtUpsertCatalogo = db.prepare(`
    INSERT INTO productos
      (uuid, codigo_barras, nombre, precio_venta, precio_costo, stock_actual, stock_minimo, unidad, activo, updated_at, sync_status)
    VALUES
      (@uuid, @codigo_barras, @nombre, @precio_venta, @precio_costo, @stock_actual, @stock_minimo, @unidad, @activo, @updated_at, 'synced')
    ON CONFLICT(uuid) DO UPDATE SET
      codigo_barras = excluded.codigo_barras,
      nombre        = excluded.nombre,
      precio_venta  = excluded.precio_venta,
      precio_costo  = excluded.precio_costo,
      stock_actual  = excluded.stock_actual,
      stock_minimo  = excluded.stock_minimo,
      unidad        = excluded.unidad,
      activo        = excluded.activo,
      updated_at    = excluded.updated_at,
      sync_status   = 'synced'
  `)

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

    // ── Helpers por uuid (sincronización Caja ↔ Gestor) ──────────────────────
    buscarPorUuid(uuid: string): Producto | null {
      return (stmtByUuid.get(uuid) as Producto | undefined) ?? null
    },

    crearConUuid(uuid: string, input: ProductoCreateInput): Producto {
      stmtInsertConUuid.run({
        uuid,
        codigo_barras: input.codigo_barras ?? null,
        nombre:        input.nombre,
        precio_venta:  input.precio_venta,
        precio_costo:  input.precio_costo ?? null,
        stock_actual:  input.stock_actual ?? 0,
        stock_minimo:  input.stock_minimo ?? 0,
        unidad:        input.unidad ?? 'unidad',
        categoria_id:  input.categoria_id ?? null,
      })
      return stmtByUuid.get(uuid) as Producto
    },

    agregarStockPorUuid(uuid: string, cantidad: number): Producto | null {
      stmtIncrStockUuid.run({ uuid, cantidad })
      return (stmtByUuid.get(uuid) as Producto | undefined) ?? null
    },

    // Modifica solo nombre/precio de un producto existente (lo permitido al Gestor).
    actualizarCamposPorUuid(uuid: string, campos: { nombre?: string; precio_venta?: number }): Producto | null {
      const current = stmtByUuid.get(uuid) as Producto | undefined
      if (!current) return null
      stmtUpdateCamposUuid.run({
        uuid,
        nombre:       campos.nombre       ?? current.nombre,
        precio_venta: campos.precio_venta ?? current.precio_venta,
      })
      return stmtByUuid.get(uuid) as Producto
    },

    // Refleja una fila del catálogo remoto en la base local (Gestor).
    upsertCatalogo(row: {
      uuid: string
      codigo_barras: string | null
      nombre: string
      precio_venta: number
      precio_costo: number | null
      stock_actual: number
      stock_minimo: number
      unidad: string
      activo: number
      updated_at: string
    }): void {
      stmtUpsertCatalogo.run(row)
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
