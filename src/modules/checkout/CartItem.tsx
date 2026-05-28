import type { ItemCarrito } from '@shared/types/venta.types'
import { formatPrecio } from '../../utils/format'

interface Props {
  item: ItemCarrito
  selected: boolean
  onSelect: () => void
  onUpdateCantidad: (producto_id: number, cantidad: number) => void
  onRemove: (producto_id: number) => void
}

export default function CartItem({ item, selected, onSelect, onUpdateCantidad, onRemove }: Props) {
  return (
    <div
      className={`cart-item${selected ? ' selected' : ''}`}
      onClick={onSelect}
    >
      <div className="cart-item-name">{item.nombre}</div>

      <div className="cart-item-qty">
        <button
          className="qty-btn"
          onClick={(e) => { e.stopPropagation(); onUpdateCantidad(item.producto_id, item.cantidad - 1) }}
        >−</button>
        <span className="qty-value">{item.cantidad}</span>
        <button
          className="qty-btn"
          onClick={(e) => { e.stopPropagation(); onUpdateCantidad(item.producto_id, item.cantidad + 1) }}
        >+</button>
      </div>

      <div className="cart-item-price">{formatPrecio(item.precio_unitario)}</div>
      <div className="cart-item-subtotal">{formatPrecio(item.subtotal)}</div>

      <button
        className="cart-item-remove"
        onClick={(e) => { e.stopPropagation(); onRemove(item.producto_id) }}
        title="Quitar"
      >×</button>
    </div>
  )
}
