import type Database from 'better-sqlite3'
import type { Venta, CrearVentaInput, MetodoPago, LineaVenta } from '../../../shared/types/venta.types'

export type VentasRepo = ReturnType<typeof createVentasRepo>

export function createVentasRepo(db: Database.Database) {
  const stmtInsertVenta = db.prepare(`
    INSERT INTO ventas
      (turno_id, usuario_id, subtotal, descuento, total, metodo_pago, monto_recibido, vuelto)
    VALUES
      (@turno_id, @usuario_id, @subtotal, @descuento, @total, @metodo_pago, @monto_recibido, @vuelto)
  `)

  const stmtInsertDetalle = db.prepare(`
    INSERT INTO detalle_ventas
      (venta_id, producto_id, cantidad, precio_unitario, subtotal, descuento_item)
    VALUES
      (@venta_id, @producto_id, @cantidad, @precio_unitario, @subtotal, @descuento_item)
  `)

  const stmtDecrStock = db.prepare(
    'UPDATE productos SET stock_actual = stock_actual - @cantidad WHERE id = @producto_id',
  )
  const stmtIncrStock = db.prepare(
    'UPDATE productos SET stock_actual = stock_actual + @cantidad WHERE id = @producto_id',
  )

  const stmtGetVenta = db.prepare('SELECT * FROM ventas WHERE id = ?')

  // Producto "genérico" para montos manuales (productos sin código de barras).
  // Se crea una sola vez y se mantiene inactivo para que no aparezca en el
  // inventario ni se pueda escanear. Su id satisface la FK de detalle_ventas.
  const GENERICO_BARCODE = '__GENERICO__'
  let genericoId: number | null = null
  function getProductoGenericoId(): number {
    if (genericoId != null) return genericoId
    const row = db
      .prepare('SELECT id FROM productos WHERE codigo_barras = ?')
      .get(GENERICO_BARCODE) as { id: number } | undefined
    if (row) {
      genericoId = row.id
      return genericoId
    }
    const res = db
      .prepare(`
        INSERT INTO productos
          (codigo_barras, nombre, precio_venta, stock_actual, activo)
        VALUES
          (@barcode, 'Venta sin código', 0, 0, 0)
      `)
      .run({ barcode: GENERICO_BARCODE })
    genericoId = Number(res.lastInsertRowid)
    return genericoId
  }

  const stmtListByTurno = db.prepare(
    "SELECT * FROM ventas WHERE turno_id = ? AND estado != 'anulada' ORDER BY timestamp DESC",
  )

  // Historial completo del turno: incluye las anuladas (para tacharlas) y el nombre del cajero
  const stmtListByTurnoTodas = db.prepare(`
    SELECT v.*, u.nombre AS usuario_nombre
    FROM ventas v
    LEFT JOIN usuarios u ON u.id = v.usuario_id
    WHERE v.turno_id = ?
    ORDER BY v.timestamp DESC
  `)

  const stmtGetDetalle = db.prepare(
    'SELECT producto_id, cantidad FROM detalle_ventas WHERE venta_id = ?',
  )

  // Detalle con nombre del producto, para el desglose "más info" en el historial
  const stmtDetalleConNombre = db.prepare(`
    SELECT dv.producto_id,
           COALESCE(p.nombre, '(producto eliminado)') AS nombre,
           dv.cantidad, dv.precio_unitario, dv.subtotal
    FROM detalle_ventas dv
    LEFT JOIN productos p ON p.id = dv.producto_id
    WHERE dv.venta_id = ?
    ORDER BY dv.id
  `)

  const stmtAnularVenta = db.prepare(`
    UPDATE ventas
    SET estado = 'anulada', sync_status = 'pending'
    WHERE id = ?
  `)

  const stmtInsertAnulacion = db.prepare(`
    INSERT INTO anulaciones (venta_id, solicitante_id, motivo, modo, estado, resuelto_at)
    VALUES (
      @venta_id, @solicitante_id, @motivo, @modo,
      'aprobada', strftime('%Y-%m-%dT%H:%M:%fZ','now')
    )
  `)

  // Transacción atómica: venta + detalle + descuento de stock en un solo write
  const txCrear = db.transaction((input: CrearVentaInput): Venta => {
    let subtotal = 0
    for (const item of input.items) {
      subtotal += item.cantidad * item.precio_unitario - (item.descuento_item ?? 0)
    }
    const total  = subtotal - (input.descuento ?? 0)
    const vuelto = input.monto_recibido != null ? input.monto_recibido - total : null

    const res = stmtInsertVenta.run({
      turno_id:       input.turno_id,
      usuario_id:     input.usuario_id,
      subtotal,
      descuento:      input.descuento ?? 0,
      total,
      metodo_pago:    input.metodo_pago,
      monto_recibido: input.monto_recibido ?? null,
      vuelto,
    })

    const ventaId = Number(res.lastInsertRowid)

    for (const item of input.items) {
      // Los montos manuales se imputan al producto genérico y no descuentan stock.
      const productoId = item.es_manual ? getProductoGenericoId() : item.producto_id
      const itemSubtotal = item.cantidad * item.precio_unitario - (item.descuento_item ?? 0)
      stmtInsertDetalle.run({
        venta_id:       ventaId,
        producto_id:    productoId,
        cantidad:       item.cantidad,
        precio_unitario: item.precio_unitario,
        subtotal:       itemSubtotal,
        descuento_item: item.descuento_item ?? 0,
      })
      if (!item.es_manual) {
        stmtDecrStock.run({ cantidad: item.cantidad, producto_id: productoId })
      }
    }

    return stmtGetVenta.get(ventaId) as Venta
  })

  // Transacción atómica de anulación: restaura stock + actualiza estados
  const txAnular = db.transaction((
    venta_id: number,
    solicitante_id: number,
    motivo: string | null,
    modo: 'remoto' | 'local_pin',
  ): void => {
    const items = stmtGetDetalle.all(venta_id) as Array<{ producto_id: number; cantidad: number }>
    for (const item of items) {
      stmtIncrStock.run({ cantidad: item.cantidad, producto_id: item.producto_id })
    }
    stmtAnularVenta.run(venta_id)
    stmtInsertAnulacion.run({ venta_id, solicitante_id, motivo, modo })
  })

  return {
    crear(input: CrearVentaInput): Venta {
      return txCrear(input)
    },

    listarPorTurno(turno_id: number, incluirAnuladas = false): Venta[] {
      const stmt = incluirAnuladas ? stmtListByTurnoTodas : stmtListByTurno
      return stmt.all(turno_id) as Venta[]
    },

    detallePorVenta(venta_id: number): LineaVenta[] {
      return stmtDetalleConNombre.all(venta_id) as LineaVenta[]
    },

    anular(
      venta_id: number,
      solicitante_id: number,
      motivo: string | null,
      modo: 'remoto' | 'local_pin',
    ): void {
      const venta = stmtGetVenta.get(venta_id) as Venta | undefined
      if (!venta) throw new Error(`Venta ${venta_id} no encontrada`)
      if (venta.estado === 'anulada') throw new Error('La venta ya está anulada')
      txAnular(venta_id, solicitante_id, motivo, modo)
    },

    // Expuesto para que SyncEngine pueda cambiar estado a 'pendiente_anulacion'
    setPendienteAnulacion(venta_id: number): void {
      db.prepare("UPDATE ventas SET estado = 'pendiente_anulacion' WHERE id = ?").run(venta_id)
    },

    getMetodoPagoVenta(venta_id: number): MetodoPago | null {
      const row = db.prepare('SELECT metodo_pago FROM ventas WHERE id = ?').get(venta_id) as
        | { metodo_pago: MetodoPago }
        | undefined
      return row?.metodo_pago ?? null
    },
  }
}
