import { ipcMain } from 'electron'
import { getDb } from '../db/client'
import { IPC } from '../../shared/constants'
import type { MetodoPago } from '../../shared/types/venta.types'
import type { ResumenPeriodo, VentaDiaria, TopProducto } from '../../shared/types/reporte.types'

export function registerReportesHandlers(): void {

  ipcMain.handle(IPC.REPORTES_RESUMEN, (_e, desde: string, hasta: string): ResumenPeriodo => {
    const db = getDb()

    const base = db.prepare(`
      SELECT
        COUNT(*)                    AS cantidad_ventas,
        COALESCE(SUM(total),  0)    AS total_ventas,
        COALESCE(AVG(total),  0)    AS promedio_venta
      FROM ventas
      WHERE DATE(timestamp) BETWEEN @desde AND @hasta
        AND estado = 'completada'
    `).get({ desde, hasta }) as { cantidad_ventas: number; total_ventas: number; promedio_venta: number }

    const metodoRows = db.prepare(`
      SELECT metodo_pago, COALESCE(SUM(total), 0) AS total
      FROM ventas
      WHERE DATE(timestamp) BETWEEN @desde AND @hasta
        AND estado = 'completada'
      GROUP BY metodo_pago
    `).all({ desde, hasta }) as Array<{ metodo_pago: string; total: number }>

    const por_metodo: Record<MetodoPago, number> = {
      efectivo: 0, debito: 0, credito: 0, qr: 0, mixto: 0,
    }
    for (const row of metodoRows) {
      por_metodo[row.metodo_pago as MetodoPago] = row.total
    }

    return { desde, hasta, ...base, por_metodo }
  })

  ipcMain.handle(IPC.REPORTES_HISTORIAL, (_e, desde: string, hasta: string): VentaDiaria[] => {
    return getDb().prepare(`
      SELECT DATE(timestamp) AS fecha,
             COUNT(*)        AS cantidad,
             COALESCE(SUM(total), 0) AS total
      FROM ventas
      WHERE DATE(timestamp) BETWEEN @desde AND @hasta
        AND estado = 'completada'
      GROUP BY DATE(timestamp)
      ORDER BY fecha DESC
    `).all({ desde, hasta }) as VentaDiaria[]
  })

  ipcMain.handle(IPC.REPORTES_TOP_PRODUCTOS, (_e, desde: string, hasta: string): TopProducto[] => {
    return getDb().prepare(`
      SELECT
        p.nombre,
        SUM(d.cantidad)  AS total_cantidad,
        SUM(d.subtotal)  AS total_monto
      FROM detalle_ventas d
      JOIN productos p ON p.id = d.producto_id
      JOIN ventas    v ON v.id = d.venta_id
      WHERE DATE(v.timestamp) BETWEEN @desde AND @hasta
        AND v.estado = 'completada'
      GROUP BY d.producto_id
      ORDER BY total_monto DESC
      LIMIT 10
    `).all({ desde, hasta }) as TopProducto[]
  })
}
