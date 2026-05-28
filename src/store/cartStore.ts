import { create } from 'zustand'
import type { ItemCarrito } from '@shared/types/venta.types'

interface CartState {
  items: ItemCarrito[]
  descuento: number

  addItem:        (item: ItemCarrito) => void
  updateCantidad: (producto_id: number, cantidad: number) => void
  removeItem:     (producto_id: number) => void
  setDescuento:   (descuento: number) => void
  clear:          () => void
}

export const useCartStore = create<CartState>((set) => ({
  items:     [],
  descuento: 0,

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

  setDescuento: (descuento) => set({ descuento }),

  clear: () => set({ items: [], descuento: 0 }),
}))

// Selectores derivados
export const selectSubtotal = (s: CartState): number =>
  s.items.reduce((acc, i) => acc + i.subtotal, 0)

export const selectTotal = (s: CartState): number =>
  Math.max(0, selectSubtotal(s) - s.descuento)
