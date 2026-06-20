import type { SyncStatus } from './sync.types'

export type Unidad = 'unidad' | 'kg' | 'lt' | 'gr'

export interface Categoria {
  id: number
  nombre: string
  created_at: string
  sync_status: SyncStatus
}

export interface Producto {
  id: number
  uuid: string             // clave global estable para sincronizar entre PCs
  codigo_barras: string | null
  nombre: string
  precio_venta: number
  precio_costo: number | null
  stock_actual: number
  stock_minimo: number
  unidad: Unidad
  categoria_id: number | null
  activo: number           // SQLite boolean: 1 = activo, 0 = inactivo
  updated_at: string
  sync_status: SyncStatus
  remote_id: string | null
}

export interface ProductoCreateInput {
  codigo_barras?: string | null
  nombre: string
  precio_venta: number
  precio_costo?: number | null
  stock_actual?: number
  stock_minimo?: number
  unidad?: Unidad
  categoria_id?: number | null
}

export interface ProductoUpdateInput extends Partial<ProductoCreateInput> {
  id: number
}

export interface PendienteCodigo {
  id: number
  codigo_barras: string
  veces: number           // cuántas veces se intentó escanear sin encontrarlo
  created_at: string
}

export interface ActualizacionMasiva {
  tipo: 'porcentaje_global' | 'porcentaje_categoria'
  porcentaje: number          // positivo = aumento, negativo = reducción
  categoria_id?: number       // solo cuando tipo = 'porcentaje_categoria'
}
