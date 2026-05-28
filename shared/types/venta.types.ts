import type { SyncStatus } from './sync.types'

export type MetodoPago      = 'efectivo' | 'debito' | 'credito' | 'qr' | 'mixto'
export type EstadoVenta     = 'completada' | 'anulada' | 'pendiente_anulacion'
export type EstadoTurno     = 'abierto' | 'cerrado'
export type EstadoAnulacion = 'pendiente' | 'aprobada' | 'rechazada'
export type ModoAnulacion   = 'remoto' | 'local_pin'
export type Rol             = 'cajero' | 'admin' | 'supervisor'

export interface Usuario {
  id: number
  nombre: string
  rol: Rol
  activo: number
  created_at: string
}

export interface TurnoCaja {
  id: number
  usuario_id: number
  apertura_ts: string
  cierre_ts: string | null
  monto_apertura: number
  monto_cierre: number | null
  estado: EstadoTurno
  observaciones: string | null
  sync_status: SyncStatus
}

export interface Venta {
  id: number
  uuid_local: string
  turno_id: number
  usuario_id: number
  timestamp: string
  subtotal: number
  descuento: number
  total: number
  metodo_pago: MetodoPago
  monto_recibido: number | null
  vuelto: number | null
  estado: EstadoVenta
  sync_status: SyncStatus
  remote_id: string | null
}

export interface DetalleVenta {
  id: number
  venta_id: number
  producto_id: number
  cantidad: number
  precio_unitario: number
  subtotal: number
  descuento_item: number
  sync_status: SyncStatus
}

export interface Anulacion {
  id: number
  venta_id: number
  solicitante_id: number
  motivo: string | null
  modo: ModoAnulacion
  estado: EstadoAnulacion
  created_at: string
  resuelto_at: string | null
  sync_status: SyncStatus
}

// ── Inputs del renderer ──────────────────────────────────────────────────────

export interface ItemCarrito {
  producto_id: number
  codigo_barras: string | null
  nombre: string
  cantidad: number
  precio_unitario: number
  subtotal: number
}

export interface CrearVentaInput {
  turno_id: number
  usuario_id: number
  items: Array<{
    producto_id: number
    cantidad: number
    precio_unitario: number   // snapshot del precio al momento de venta
    descuento_item?: number
  }>
  metodo_pago: MetodoPago
  descuento?: number
  monto_recibido?: number
}

export interface AnulacionRequest {
  venta_id: number
  solicitante_id: number
  motivo?: string
}

export interface AnulacionLocal extends AnulacionRequest {
  pin_admin: string
}

export interface ResumenTurno {
  turno_id: number
  total_ventas: number
  cantidad_ventas: number
  por_metodo: Record<MetodoPago, number>
  diferencia_caja: number    // monto_cierre - (monto_apertura + efectivo esperado)
}
