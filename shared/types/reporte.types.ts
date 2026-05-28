import type { MetodoPago } from './venta.types'

export interface ResumenPeriodo {
  desde: string
  hasta: string
  total_ventas: number
  cantidad_ventas: number
  promedio_venta: number
  por_metodo: Record<MetodoPago, number>
}

export interface VentaDiaria {
  fecha: string           // 'YYYY-MM-DD'
  cantidad: number
  total: number
}

export interface TopProducto {
  nombre: string
  total_cantidad: number
  total_monto: number
}
