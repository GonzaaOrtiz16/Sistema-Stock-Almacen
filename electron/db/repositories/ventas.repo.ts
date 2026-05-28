import type Database from 'better-sqlite3'
import type { Venta, CrearVentaInput, MetodoPago } from '../../../shared/types/venta.types'

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

  const stmtListByTurno = db.prepare(
    "SELECT * FROM ventas WHERE turno_id = ? AND estado != 'anulada' ORDER BY timestamp DESC",
  )

  const stmtGetDetalle = db.prepare(
    'SELECT producto_id, cantidad FROM detalle_ventas WHERE venta_id = ?',
  )

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
      const itemSubtotal = item.cantidad * item.precio_unitario - (item.descuento_item ?? 0)
      stmtInsertDetalle.run({
        venta_id:       ventaId,
        producto_id:    item.producto_id,
        cantidad:       item.cantidad,
        precio_unitario: item.precio_unitario,
        subtotal:       itemSubtotal,
        descuento_item: item.descuento_item ?? 0,
      })
      stmtDecrStock.run({ cantidad: item.cantidad, producto_id: item.producto_id })
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

    listarPorTurno(turno_id: number): Venta[] {
      return stmtListByTurno.all(turno_id) as Venta[]
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
