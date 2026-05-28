import { useCallback, useEffect, useRef, useState } from 'react'
import { useCartStore, selectSubtotal, selectTotal } from '../../store/cartStore'
import { useCajaStore } from '../../store/cajaStore'
import { useBarcode } from '../../hooks/useBarcode'
import { useToast } from '../../components/ui'
import type { Producto } from '@shared/types/producto.types'
import type { ItemCarrito, Venta } from '@shared/types/venta.types'
import CartItem from './CartItem'
import PaymentModal from './PaymentModal'
import AnulacionModal from './AnulacionModal'
import CierreCaja from '../caja/CierreCaja'
import { formatPrecio, formatFecha } from '../../utils/format'

export default function CheckoutPage() {
  const { items, addItem, updateCantidad, removeItem, clear } = useCartStore()
  const { usuario, turnoActivo } = useCajaStore()
  const subtotal = useCartStore(selectSubtotal)
  const total    = useCartStore(selectTotal)
  const { show } = useToast()

  const [query,        setQuery]        = useState('')
  const [results,      setResults]      = useState<Produto[]>([])
  const [selectedIdx,  setSelectedIdx]  = useState<number | null>(null)
  const [scanError,    setScanError]    = useState('')
  const [showPayment,  setShowPayment]  = useState(false)
  const [anularVenta,  setAnularVenta]  = useState<Venta | null>(null)
  const [lastVenta,    setLastVenta]    = useState<Venta | null>(null)
  const [showCierre,   setShowCierre]   = useState(false)

  const searchRef = useRef<HTMLInputElement>(null)

  // ── Barcode scanner ────────────────────────────────────────────────────────
  const handleScan = useCallback(async (barcode: string) => {
    const producto = await window.electronAPI.productos.buscarBarcode(barcode)
    if (!producto) {
      setScanError(`Código no encontrado: ${barcode}`)
      setTimeout(() => setScanError(''), 3000)
      return
    }
    addItem(productoToItem(producto))
    show(`+ ${producto.nombre}`, 'success')
  }, [addItem, show])

  useBarcode(handleScan)

  // ── Búsqueda por nombre ────────────────────────────────────────────────────
  useEffect(() => {
    if (query.length < 2) { setResults([]); return }
    const timer = setTimeout(async () => {
      const res = await window.electronAPI.productos.buscarNombre(query)
      setResults(res)
    }, 200)
    return () => clearTimeout(timer)
  }, [query])

  function addFromSearch(producto: Produto) {
    addItem(productoToItem(producto))
    setQuery(''); setResults([])
    searchRef.current?.focus()
    show(`+ ${producto.nombre}`, 'success')
  }

  // ── Teclado global ────────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // No interceptar si el foco está en un input / textarea
      const tag = (document.activeElement as HTMLElement)?.tagName.toLowerCase()
      const inInput = tag === 'input' || tag === 'textarea'

      // F1: cobrar (siempre activo salvo en inputs)
      if (e.key === 'F1') {
        e.preventDefault()
        if (items.length > 0 && !showPayment && !anularVenta) setShowPayment(true)
        return
      }

      // Escape: cerrar modales / limpiar búsqueda
      if (e.key === 'Escape') {
        if (showPayment)  { setShowPayment(false);  return }
        if (anularVenta)  { setAnularVenta(null);   return }
        if (results.length || query) { setQuery(''); setResults([]); return }
        setSelectedIdx(null)
        return
      }

      if (inInput) return  // las teclas de abajo no actúan dentro de inputs

      // Flecha abajo/arriba: navegar carrito
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIdx((p) => (p === null ? 0 : Math.min(p + 1, items.length - 1)))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIdx((p) => (p === null ? items.length - 1 : Math.max(p - 1, 0)))
        return
      }

      // +/- : ajustar cantidad del item seleccionado
      if ((e.key === '+' || e.key === 'Add') && selectedIdx !== null) {
        const item = items[selectedIdx]
        if (item) updateCantidad(item.producto_id, item.cantidad + 1)
        return
      }
      if ((e.key === '-' || e.key === 'Subtract') && selectedIdx !== null) {
        const item = items[selectedIdx]
        if (item) updateCantidad(item.producto_id, item.cantidad - 1)
        return
      }

      // Delete: quitar item seleccionado
      if (e.key === 'Delete' && selectedIdx !== null) {
        const item = items[selectedIdx]
        if (item) { removeItem(item.producto_id); setSelectedIdx(null) }
        return
      }

      // Cualquier letra/número sin foco → focalizar el buscador
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        searchRef.current?.focus()
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [items, selectedIdx, showPayment, anularVenta, query, results.length, updateCantidad, removeItem])

  if (showCierre) return <CierreCaja onCancel={() => setShowCierre(false)} />

  return (
    <div className="checkout-page">

      {/* Header */}
      <header className="checkout-header">
        <span className="checkout-title">Almacén Minimercado Gabriela</span>
        <span className="checkout-user">{usuario?.nombre} · turno #{turnoActivo?.id}</span>
        <span className="checkout-hint">F1=cobrar · ↑↓=seleccionar · +−=cantidad · Del=quitar</span>
        <button className="btn-ghost checkout-cierre" onClick={() => setShowCierre(true)}>
          Cerrar turno
        </button>
      </header>

      {/* Body */}
      <div className="checkout-body">

        {/* ─ Carrito ─ */}
        <section className="cart-panel">
          <div className="cart-header">
            <span>Carrito</span>
            <span className="cart-count">
              {items.length} {items.length === 1 ? 'producto' : 'productos'}
            </span>
            {items.length > 0 && (
              <button className="cart-clear" onClick={() => { clear(); setSelectedIdx(null) }}>
                Vaciar
              </button>
            )}
          </div>

          <div className="cart-items">
            {items.length === 0 ? (
              <p className="cart-empty">Escaneá un producto o buscalo por nombre</p>
            ) : (
              items.map((item, i) => (
                <CartItem
                  key={item.producto_id}
                  item={item}
                  selected={selectedIdx === i}
                  onSelect={() => setSelectedIdx(i)}
                  onUpdateCantidad={updateCantidad}
                  onRemove={removeItem}
                />
              ))
            )}
          </div>

          <div className="cart-footer">
            <div className="cart-totals">
              {useCartStore.getState().descuento > 0 && (
                <div className="total-row total-sub">
                  <span>Subtotal</span><span>{formatPrecio(subtotal)}</span>
                </div>
              )}
              <div className="total-row">
                <span>TOTAL</span>
                <span className="total-amount">{formatPrecio(total)}</span>
              </div>
            </div>
            <div className="cart-actions">
              <button
                className="btn-pay"
                onClick={() => setShowPayment(true)}
                disabled={items.length === 0}
              >
                Cobrar <kbd>F1</kbd>
              </button>
              {lastVenta && (
                <button className="btn-anular" onClick={() => setAnularVenta(lastVenta)}>
                  Anular última
                </button>
              )}
            </div>
          </div>
        </section>

        {/* ─ Búsqueda ─ */}
        <section className="search-panel">
          <input
            ref={searchRef}
            className="search-input"
            placeholder="Buscar por nombre… (o escaneá)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { setQuery(''); setResults([]) }
              if (e.key === 'Enter' && results.length > 0) addFromSearch(results[0])
            }}
            autoFocus
          />

          {results.length > 0 && (
            <ul className="search-results">
              {results.map((p) => (
                <li key={p.id} className="search-result" onClick={() => addFromSearch(p)}>
                  <span className="result-nombre">{p.nombre}</span>
                  <span className="result-precio">{formatPrecio(p.precio_venta)}</span>
                  <span className="result-stock">Stock: {p.stock_actual}</span>
                </li>
              ))}
            </ul>
          )}

          {scanError && <p className="scan-error">{scanError}</p>}

          {lastVenta && (
            <div className="last-sale">
              <span>Última venta</span>
              <span>{formatPrecio(lastVenta.total)} · {formatFecha(lastVenta.timestamp)}</span>
            </div>
          )}
        </section>

      </div>

      {/* Modales */}
      {showPayment && (
        <PaymentModal
          onSuccess={(v) => { setLastVenta(v); setShowPayment(false); show('Venta completada', 'success') }}
          onClose={() => setShowPayment(false)}
        />
      )}

      {anularVenta && (
        <AnulacionModal
          venta={anularVenta}
          onSuccess={() => { setAnularVenta(null); setLastVenta(null); show('Venta anulada', 'warning') }}
          onClose={() => setAnularVenta(null)}
        />
      )}

    </div>
  )
}

// ── Helper ─────────────────────────────────────────────────────────────────
function productoToItem(p: Produto): ItemCarrito {
  return {
    producto_id:    p.id,
    codigo_barras:  p.codigo_barras,
    nombre:         p.nombre,
    cantidad:       1,
    precio_unitario: p.precio_venta,
    subtotal:       p.precio_venta,
  }
}

// alias para el typo corregido en el módulo
type Produto = Producto
