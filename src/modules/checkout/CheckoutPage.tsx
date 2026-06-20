import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useCartStore, selectSubtotal, selectTotal } from '../../store/cartStore'
import { aplicarPromociones } from '@shared/types/promocion.types'
import { useCajaStore } from '../../store/cajaStore'
import { useBarcode } from '../../hooks/useBarcode'
import { useToast } from '../../components/ui'
import type { Producto, PendienteCodigo } from '@shared/types/producto.types'
import type { ItemCarrito, Venta, LineaVenta } from '@shared/types/venta.types'
import CartItem from './CartItem'
import PaymentModal from './PaymentModal'
import AnulacionModal from './AnulacionModal'
import MontoManualModal from './MontoManualModal'
import PrecioProductoModal from './PrecioProductoModal'
import AltaRapidaModal from './AltaRapidaModal'
import VentaDetalleModal from './VentaDetalleModal'
import CierreCaja from '../caja/CierreCaja'
import UsuarioForm from '../usuarios/UsuarioForm'
import { formatPrecio, formatHora } from '../../utils/format'

export default function CheckoutPage() {
  const { items, addItem, updateCantidad, removeItem, clear, setPromociones } = useCartStore()
  const promociones = useCartStore((s) => s.promociones)
  const { usuario, turnoActivo, setUsuario } = useCajaStore()
  const subtotal = useCartStore(selectSubtotal)
  const total    = useCartStore(selectTotal)
  // Resultado de las promos memoizado: aplicarPromociones devuelve un objeto nuevo
  // en cada llamada, así que no debe usarse como selector de zustand directo.
  const promosResult = useMemo(() => aplicarPromociones(items, promociones), [items, promociones])
  const descPromos   = promosResult.descuentoTotal
  const { show } = useToast()

  const [query,        setQuery]        = useState('')
  const [results,      setResults]      = useState<Produto[]>([])
  const [selectedIdx,  setSelectedIdx]  = useState<number | null>(null)
  const [scanError,    setScanError]    = useState('')
  const [showPayment,  setShowPayment]  = useState(false)
  const [showManual,   setShowManual]   = useState(false)
  const [precioPend,   setPrecioPend]   = useState<Producto | null>(null)
  const [pendientes,   setPendientes]   = useState<PendienteCodigo[]>([])
  const [altaCodigo,   setAltaCodigo]   = useState<string | null>(null)
  const [anularVenta,  setAnularVenta]  = useState<Venta | null>(null)
  const [historial,    setHistorial]    = useState<Venta[]>([])
  const [ventaDetalle, setVentaDetalle] = useState<Venta | null>(null)
  const [detalles,     setDetalles]     = useState<Record<number, LineaVenta[]>>({})
  const [filtroMonto,  setFiltroMonto]  = useState('')
  const [soloAnuladas, setSoloAnuladas] = useState(false)
  const [showCierre,   setShowCierre]   = useState(false)
  const [showPerfil,   setShowPerfil]   = useState(false)

  const searchRef = useRef<HTMLInputElement>(null)

  // ── Historial de ventas del turno ──────────────────────────────────────────
  // Persiste todas las ventas del turno (incluidas las anuladas) hasta el cierre.
  const refreshHistorial = useCallback(async () => {
    if (!turnoActivo) { setHistorial([]); return }
    const ventas = await window.electronAPI.ventas.listarPorTurno(turnoActivo.id, true)
    setHistorial(ventas)
  }, [turnoActivo])

  useEffect(() => { refreshHistorial() }, [refreshHistorial])

  // Cachea el desglose de una venta cuando el modal de detalle lo carga (para reusarlo).
  const cacheDetalle = useCallback((ventaId: number, lineas: LineaVenta[]) => {
    setDetalles((prev) => ({ ...prev, [ventaId]: lineas }))
  }, [])

  // Reimpresión manual del ticket (no depende del flag de auto-impresión)
  const handleReimprimir = useCallback(async (v: Venta) => {
    const lineas = detalles[v.id] ?? await window.electronAPI.ventas.detalle(v.id)
    const r = await window.electronAPI.printer.reimprimir({
      ventaId:    v.id,
      fechaISO:   v.timestamp,
      cajero:     v.usuario_nombre ?? usuario?.nombre ?? '',
      items:      lineas.map((l) => ({
        nombre:          l.nombre,
        cantidad:        l.cantidad,
        precio_unitario: l.precio_unitario,
        subtotal:        l.subtotal,
      })),
      total:      v.total,
      metodoPago: v.metodo_pago,
      recibido:   v.monto_recibido ?? 0,
      vuelto:     v.vuelto ?? 0,
    })
    if (r.ok) show('Ticket reimpreso', 'success')
    else show('No se pudo imprimir el ticket. Revisá la impresora en Configuración.', 'error')
  }, [detalles, usuario, show])

  const totalDia = historial.reduce(
    (acc, v) => (v.estado === 'anulada' ? acc : acc + v.total),
    0,
  )
  const cantVentasActivas = historial.filter((v) => v.estado !== 'anulada').length

  // Filtro del historial: por monto (coincidencia parcial) y/o solo anuladas
  const historialFiltrado = historial.filter((v) => {
    if (soloAnuladas && v.estado !== 'anulada') return false
    if (filtroMonto.trim() && !v.total.toFixed(2).includes(filtroMonto.trim())) return false
    return true
  })

  // ── Códigos pendientes (agregado rápido) ───────────────────────────────────
  useEffect(() => {
    window.electronAPI.productos.pendientesListar().then(setPendientes)
  }, [])

  // ── Promociones activas (para aplicarlas al carrito) ───────────────────────
  useEffect(() => {
    window.electronAPI.promociones.listarActivas().then(setPromociones).catch(() => {})
  }, [setPromociones])

  // ── Barcode scanner ────────────────────────────────────────────────────────
  const handleScan = useCallback(async (barcode: string) => {
    // Las teclas del lector también caen en el buscador: limpiarlo en cada escaneo
    setQuery('')
    setResults([])
    const producto = await window.electronAPI.productos.buscarBarcode(barcode)
    if (!producto) {
      // No interrumpir la venta: guardar el código para darlo de alta después
      const lista = await window.electronAPI.productos.pendientesAgregar(barcode)
      setPendientes(lista)
      setScanError(`Código sin producto: ${barcode} · guardado en Agregado rápido`)
      setTimeout(() => setScanError(''), 3000)
      return
    }
    // Producto sin precio: pedirlo al instante antes de agregarlo a la venta
    if (producto.precio_venta <= 0) {
      setPrecioPend(producto)
      return
    }
    addItem(productoToItem(producto))
    show(`+ ${producto.nombre}`, 'success')
  }, [addItem, show])

  useBarcode(handleScan)

  // Confirmar el precio de un producto que no lo tenía: guardarlo y agregarlo
  const confirmarPrecio = useCallback(async (precio: number) => {
    if (!precioPend) return
    const actualizado = await window.electronAPI.productos.actualizar({
      id: precioPend.id,
      precio_venta: precio,
    })
    addItem(productoToItem(actualizado))
    setPrecioPend(null)
    show(`+ ${actualizado.nombre} · precio guardado`, 'success')
  }, [precioPend, addItem, show])

  // Agregar un monto manual (producto sin código) al carrito
  const agregarMontoManual = useCallback((monto: number, descripcion: string) => {
    addItem({
      producto_id:     -Date.now(),   // id sintético único: no se fusiona con otros ítems
      codigo_barras:   null,
      nombre:          descripcion || 'Monto manual',
      cantidad:        1,
      precio_unitario: monto,
      subtotal:        monto,
      es_manual:       true,
    })
    setShowManual(false)
    show(`+ ${formatPrecio(monto)}`, 'success')
  }, [addItem, show])

  // Producto dado de alta desde un código pendiente
  const onAltaRapida = useCallback(async (codigo: string) => {
    const lista = await window.electronAPI.productos.pendientesEliminar(codigo)
    setPendientes(lista)
    setAltaCodigo(null)
    show('Producto creado', 'success')
  }, [show])

  // Descartar un código pendiente sin crear producto
  const descartarPendiente = useCallback(async (codigo: string) => {
    const lista = await window.electronAPI.productos.pendientesEliminar(codigo)
    setPendientes(lista)
  }, [])

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

      const modalAbierto = showPayment || anularVenta || showManual || precioPend || altaCodigo || showPerfil || ventaDetalle

      // F1: cobrar (siempre activo salvo en inputs)
      if (e.key === 'F1') {
        e.preventDefault()
        if (items.length > 0 && !modalAbierto) setShowPayment(true)
        return
      }

      // F2: agregar un monto manual (producto sin código de barras)
      if (e.key === 'F2') {
        e.preventDefault()
        if (!modalAbierto) setShowManual(true)
        return
      }

      // Escape: cerrar modales / limpiar búsqueda
      if (e.key === 'Escape') {
        if (showPayment)  { setShowPayment(false);  return }
        if (showManual)   { setShowManual(false);   return }
        if (precioPend)   { setPrecioPend(null);    return }
        if (altaCodigo)   { setAltaCodigo(null);    return }
        if (showPerfil)   { setShowPerfil(false);   return }
        if (ventaDetalle) { setVentaDetalle(null);  return }
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
  }, [items, selectedIdx, showPayment, showManual, precioPend, altaCodigo, showPerfil, anularVenta, ventaDetalle, query, results.length, updateCantidad, removeItem])

  if (showCierre) return <CierreCaja onCancel={() => setShowCierre(false)} />

  return (
    <div className="checkout-page">

      {/* Header */}
      <header className="checkout-header">
        <span className="checkout-title">Almacén Minimercado Gabriela</span>
        <span className="checkout-user">{usuario?.nombre} · turno #{turnoActivo?.id}</span>
        <span className="checkout-hint">F1=cobrar · F2=monto manual · ↑↓=seleccionar · +−=cantidad · Del=quitar</span>
        <button className="btn-ghost checkout-perfil" onClick={() => setShowPerfil(true)}>
          Mi perfil
        </button>
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
              {(descPromos > 0 || useCartStore.getState().descuento > 0) && (
                <div className="total-row total-sub">
                  <span>Subtotal</span><span>{formatPrecio(subtotal)}</span>
                </div>
              )}
              {promosResult.aplicadas.map((a) => (
                <div key={a.promocion_id} className="total-row total-promo">
                  <span className="promo-aplicada-nombre">
                    🏷️ {a.nombre}{a.veces > 1 ? ` ×${a.veces}` : ''}
                  </span>
                  <span>− {formatPrecio(a.descuento)}</span>
                </div>
              ))}
              <div className="total-row">
                <span>TOTAL</span>
                <span className="total-amount">{formatPrecio(total)}</span>
              </div>
            </div>
            <div className="cart-actions">
              <button
                className="btn-ghost btn-manual"
                onClick={() => setShowManual(true)}
              >
                Monto manual <kbd>F2</kbd>
              </button>
              <button
                className="btn-pay"
                onClick={() => setShowPayment(true)}
                disabled={items.length === 0}
              >
                Cobrar <kbd>F1</kbd>
              </button>
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

          {/* ─ Agregado rápido: códigos escaneados que no existen ─ */}
          {pendientes.length > 0 && (
            <div className="pendientes-panel">
              <div className="pendientes-header">
                <span>Agregado rápido</span>
                <span className="pendientes-count">{pendientes.length}</span>
              </div>
              <div className="pendientes-list">
                {pendientes.map((p) => (
                  <div key={p.id} className="pendiente-item">
                    <span className="pendiente-code">{p.codigo_barras}</span>
                    {p.veces > 1 && <span className="pendiente-veces">×{p.veces}</span>}
                    <button
                      className="pendiente-add"
                      onClick={() => setAltaCodigo(p.codigo_barras)}
                    >
                      + Agregar
                    </button>
                    <button
                      className="pendiente-del"
                      title="Descartar"
                      onClick={() => descartarPendiente(p.codigo_barras)}
                    >×</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ─ Historial de ventas del turno ─ */}
          <div className="historial-panel">
            <div className="historial-header">
              <span>Ventas del turno</span>
              <span className="historial-count">
                {cantVentasActivas} · {formatPrecio(totalDia)}
              </span>
            </div>

            {historial.length > 0 && (
              <div className="historial-filtros">
                <input
                  className="historial-filtro-input"
                  placeholder="Filtrar por monto…"
                  inputMode="decimal"
                  value={filtroMonto}
                  onChange={(e) => setFiltroMonto(e.target.value)}
                />
                <label className="historial-filtro-check">
                  <input
                    type="checkbox"
                    checked={soloAnuladas}
                    onChange={(e) => setSoloAnuladas(e.target.checked)}
                  />
                  Solo anuladas
                </label>
              </div>
            )}

            <div className="historial-list">
              {historial.length === 0 ? (
                <p className="historial-empty">Todavía no hay ventas en este turno</p>
              ) : historialFiltrado.length === 0 ? (
                <p className="historial-empty">Ninguna venta coincide con el filtro</p>
              ) : (
                historialFiltrado.map((v) => {
                  const anulada = v.estado === 'anulada'
                  return (
                    <div key={v.id} className={`historial-item${anulada ? ' anulada' : ''}`}>
                      <button
                        className="historial-row"
                        onClick={() => setVentaDetalle(v)}
                      >
                        <div className="historial-item-main">
                          <span className="historial-hora">{formatHora(v.timestamp)}</span>
                          <div className="historial-tags">
                            <span className={`metodo-pill metodo-${v.metodo_pago}`}>
                              {v.metodo_pago}
                            </span>
                            {v.usuario_nombre && (
                              <span className="historial-cajero">{v.usuario_nombre}</span>
                            )}
                          </div>
                        </div>
                        {anulada && <span className="historial-badge">Anulada</span>}
                        <span className="historial-total">{formatPrecio(v.total)}</span>
                        <span className="historial-chevron">›</span>
                      </button>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </section>

      </div>

      {/* Modales */}
      {showPayment && (
        <PaymentModal
          onSuccess={(v) => {
            setHistorial((prev) => [v, ...prev])
            setShowPayment(false)
            show('Venta completada', 'success')
          }}
          onClose={() => setShowPayment(false)}
        />
      )}

      {showManual && (
        <MontoManualModal
          onConfirm={agregarMontoManual}
          onClose={() => setShowManual(false)}
        />
      )}

      {precioPend && (
        <PrecioProductoModal
          producto={precioPend}
          onConfirm={confirmarPrecio}
          onClose={() => setPrecioPend(null)}
        />
      )}

      {altaCodigo && (
        <AltaRapidaModal
          codigo={altaCodigo}
          onSuccess={onAltaRapida}
          onClose={() => setAltaCodigo(null)}
        />
      )}

      {showPerfil && usuario && (
        <UsuarioForm
          usuario={usuario}
          selfEdit
          onSuccess={(u) => {
            setUsuario({ ...usuario, nombre: u.nombre })
            setShowPerfil(false)
            show('Perfil actualizado', 'success')
          }}
          onClose={() => setShowPerfil(false)}
        />
      )}

      {ventaDetalle && (
        <VentaDetalleModal
          venta={ventaDetalle}
          cacheLineas={detalles[ventaDetalle.id]}
          onLoaded={cacheDetalle}
          onReimprimir={handleReimprimir}
          onAnular={(v) => { setVentaDetalle(null); setAnularVenta(v) }}
          onClose={() => setVentaDetalle(null)}
        />
      )}

      {anularVenta && (
        <AnulacionModal
          venta={anularVenta}
          onSuccess={() => {
            setAnularVenta(null)
            refreshHistorial()
            show('Venta anulada', 'warning')
          }}
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
