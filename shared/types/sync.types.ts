export type SyncStatus = 'pending' | 'synced' | 'error'
export type SyncEstado = 'online' | 'offline' | 'syncing' | 'idle'

export interface SyncProgress {
  tabla: string
  total: number
  synced: number
}

export interface SyncInfo {
  estado: SyncEstado
  ultimo_sync: string | null
  pendientes: number
  error?: string
}

// ── Órdenes de sincronización (Gestor → Caja) ────────────────────────────────
export type SyncOpTipo = 'crear' | 'sumar_stock' | 'actualizar'

// Payload según el tipo:
//  · crear      → { uuid, nombre, precio_venta, stock_actual, codigo_barras? }
//  · sumar_stock→ { cantidad }
//  · actualizar → { nombre?, precio_venta? }
export interface SyncOpPayload {
  uuid?: string
  nombre?: string
  precio_venta?: number
  stock_actual?: number
  codigo_barras?: string | null
  cantidad?: number
}

// Una orden tal como vive en Supabase (sync_ops) y en el outbox local.
export interface SyncOp {
  id: string
  tipo: SyncOpTipo
  producto_uuid: string | null
  payload: SyncOpPayload
  estado?: string
}
