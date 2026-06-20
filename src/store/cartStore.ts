import { create } from 'zustand'
import type { ItemCarrito } from '@shared/types/venta.types'
import type { Promocion, ResultadoPromos } from '@shared/types/promocion.types'
import { aplicarPromociones } from '@shared/types/promocion.types'

interface CartState {
  items: ItemCarrito[]
  descuento: number
  promociones: Promocion[]   // promos activas cargadas desde la DB (para aplicar en caja)

  addItem:         (item: ItemCarrito) => void
  updateCantidad:  (producto_id: number, cantidad: number) => void
  removeItem:      (producto_id: number) => void
  setDescuento:    (descuento: number) => void
  setPromociones:  (promociones: Promocion[]) => void
  clear:           () => void
}

export const useCartStore = create<CartState>((set) => ({
  items:       [],
  descuento:   0,
  promociones: [],

  addItem(item) {
    set((s) => {
      const existing = s.items.find((i) => i.producto_id === item.producto_id)
      if (existing) {
        return {
          items: s.items.map((i) =>
            i.producto_id === item.producto_id
              ? { ...i, cantidad: i.cantidad + item.cantidad, subtotal: (i.cantidad + item.cantidad) * i.precio_unitario }
              : i,
          ),
        }
      }
      return { items: [...s.items, item] }
    })
  },

  updateCantidad(producto_id, cantidad) {
    if (cantidad <= 0) {
      set((s) => ({ items: s.items.filter((i) => i.producto_id !== producto_id) }))
      return
    }
    set((s) => ({
      items: s.items.map((i) =>
        i.producto_id === producto_id
          ? { ...i, cantidad, subtotal: cantidad * i.precio_unitario }
          : i,
      ),
    }))
  },

  removeItem(producto_id) {
    set((s) => ({ items: s.items.filter((i) => i.producto_id !== producto_id) }))
  },

  setDescuento:   (descuento)   => set({ descuento }),
  setPromociones: (promociones) => set({ promociones }),

  // Vaciar el carrito NO borra las promos cargadas (siguen vigentes para la próxima venta).
  clear: () => set({ items: [], descuento: 0 }),
}))

// ── Selectores derivados ─────────────────────────────────────────────────────

// Subtotal bruto: suma de líneas a precio normal, sin promos ni descuento manual.
export const selectSubtotal = (s: CartState): number =>
  s.items.reduce((acc, i) => acc + i.subtotal, 0)

// Resultado del motor de promociones sobre el carrito actual.
export const selectResultadoPromos = (s: CartState): ResultadoPromos =>
  aplicarPromociones(s.items, s.promociones)

// Ahorro total por promociones.
export const selectDescuentoPromos = (s: CartState): number =>
  selectResultadoPromos(s).descuentoTotal

// Total a cobrar: bruto − promos − descuento manual.
export const selectTotal = (s: CartState): number =>
  Math.max(0, selectSubtotal(s) - selectDescuentoPromos(s) - s.descuento)
