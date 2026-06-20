import type { SyncStatus } from './sync.types'

// ── Modelo de promociones ────────────────────────────────────────────────────
// Una promo = un precio final + una lista de ítems (producto + cantidad).
//  · 1 ítem  → promo de varias unidades del mismo producto (ej: 2 leches a $1500)
//  · 2+ ítems → combo de productos distintos (ej: 2 cocas + 1 fernet a $9000)
// En caja la promo se aplica tantas veces como entre en el carrito; lo que no
// completa una promo se cobra al precio normal.

export interface PromocionItem {
  producto_id: number
  cantidad: number
  // Enriquecidos por el repo (JOIN con productos) para mostrar en la UI:
  nombre?: string
  codigo_barras?: string | null
  precio_venta?: number
}

export interface Promocion {
  id: number
  uuid: string
  nombre: string
  precio: number          // precio final del combo/pack
  activa: number          // 1 = activa, 0 = pausada
  created_at: string
  updated_at: string
  sync_status: SyncStatus
  items: PromocionItem[]
}

export interface PromocionItemInput {
  producto_id: number
  cantidad: number
}

export interface PromocionCreateInput {
  nombre: string
  precio: number
  activa?: boolean
  items: PromocionItemInput[]
}

export interface PromocionUpdateInput extends PromocionCreateInput {
  id: number
}

// ── Motor de aplicación de promociones al carrito ────────────────────────────

export interface PromoAplicada {
  promocion_id: number
  nombre: string
  veces: number       // cuántas veces se aplicó la promo
  descuento: number   // ahorro total que generó (positivo)
}

export interface ResultadoPromos {
  descuentoTotal: number                        // suma de los descuentos por producto (redondeada)
  descuentoPorProducto: Record<number, number>  // ahorro asignado a cada producto (para descuento_item)
  aplicadas: PromoAplicada[]
}

interface LineaCarrito {
  producto_id: number
  cantidad: number
  precio_unitario: number
}

const round2 = (n: number): number => Math.round(n * 100) / 100

// Evalúa las promos contra el carrito. Greedy en orden de definición: cada promo
// consume unidades disponibles y se aplica tantas veces como entre. Un producto
// dentro de un combo recibe una parte proporcional del ahorro (para registrarlo
// como descuento de esa línea en la venta).
export function aplicarPromociones(
  items: LineaCarrito[],
  promos: Promocion[],
): ResultadoPromos {
  const restante: Record<number, number> = {}
  const precio: Record<number, number> = {}
  for (const it of items) {
    if (it.producto_id <= 0) continue   // ítems manuales: no participan de promos
    restante[it.producto_id] = (restante[it.producto_id] ?? 0) + it.cantidad
    precio[it.producto_id] = it.precio_unitario
  }

  const descRaw: Record<number, number> = {}
  const aplicadas: PromoAplicada[] = []

  for (const promo of promos) {
    if (!promo.activa || promo.items.length === 0) continue

    // Veces que la promo entra en el carrito y precio normal de un combo.
    let veces = Infinity
    let regularCombo = 0
    let valida = true
    for (const pi of promo.items) {
      const disp = restante[pi.producto_id] ?? 0
      const pu = precio[pi.producto_id]
      if (pu == null || pi.cantidad <= 0) { valida = false; break }
      veces = Math.min(veces, Math.floor(disp / pi.cantidad))
      regularCombo += pu * pi.cantidad
    }
    if (!valida || !Number.isFinite(veces) || veces <= 0) continue

    const descCombo = regularCombo - promo.precio
    if (descCombo <= 0) continue   // la promo no genera ahorro: se ignora

    const descPromo = descCombo * veces
    for (const pi of promo.items) {
      restante[pi.producto_id] -= pi.cantidad * veces
      const contrib = precio[pi.producto_id] * pi.cantidad
      const share = regularCombo > 0 ? (contrib / regularCombo) * descPromo : 0
      descRaw[pi.producto_id] = (descRaw[pi.producto_id] ?? 0) + share
    }
    aplicadas.push({ promocion_id: promo.id, nombre: promo.nombre, veces, descuento: round2(descPromo) })
  }

  // Redondeamos por producto y el total es la suma de esos redondeos, así el
  // total del carrito coincide exactamente con lo que registra la venta.
  const descuentoPorProducto: Record<number, number> = {}
  let descuentoTotal = 0
  for (const [pid, val] of Object.entries(descRaw)) {
    const r = round2(val)
    if (r > 0) {
      descuentoPorProducto[Number(pid)] = r
      descuentoTotal += r
    }
  }

  return { descuentoTotal: round2(descuentoTotal), descuentoPorProducto, aplicadas }
}
