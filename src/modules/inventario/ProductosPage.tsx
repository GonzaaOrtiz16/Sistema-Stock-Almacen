import { useCallback, useEffect, useRef, useState } from 'react'
import type { Producto } from '@shared/types/producto.types'
import { formatPrecio } from '../../utils/format'
import ProductForm from './ProductForm'
import BulkPriceUpdate from './BulkPriceUpdate'

type Vista = 'tabla' | 'form-nuevo' | 'form-editar' | 'bulk'
type EstadoStock = 'ok' | 'bajo' | 'sin-stock'
type Filtro = 'todos' | EstadoStock

// Clasifica un producto según su nivel de stock para el conteo y los colores.
function estadoStock(p: Producto): EstadoStock {
  if (p.stock_actual <= 0) return 'sin-stock'
  if (p.stock_minimo > 0 && p.stock_actual <= p.stock_minimo) return 'bajo'
  return 'ok'
}

export default function ProductosPage() {
  const [productos,   setProductos]   = useState<Producto[]>([])
  const [query,       setQuery]       = useState('')
  const [filtered,    setFiltered]    = useState<Producto[]>([])
  const [selected,    setSelected]    = useState<Producto | null>(null)
  const [vista,       setVista]       = useState<Vista>('tabla')
  const [filtro,      setFiltro]      = useState<Filtro>('todos')
  const [loading,     setLoading]     = useState(false)
  const [toast,       setToast]       = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  // ── Carga inicial ──────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const list = await window.electronAPI.productos.listar()
      setProductos(list)
      setFiltered(list)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  // ── Búsqueda en tiempo real ────────────────────────────────────────────────
  useEffect(() => {
    if (!query.trim()) { setFiltered(productos); return }
    const q = query.toLowerCase()
    setFiltered(
      productos.filter(
        (p) =>
          p.nombre.toLowerCase().includes(q) ||
          (p.codigo_barras ?? '').includes(q),
      ),
    )
  }, [query, productos])

  // ── Toast ──────────────────────────────────────────────────────────────────
  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  // ── Callback de guardado ───────────────────────────────────────────────────
  function onGuardado(p: Producto) {
    setProductos((prev) => {
      const idx = prev.findIndex((x) => x.id === p.id)
      return idx >= 0
        ? prev.map((x) => (x.id === p.id ? p : x))
        : [p, ...prev]
    })
    setVista('tabla')
    showToast(vista === 'form-nuevo' ? `Producto "${p.nombre}" creado` : `Producto "${p.nombre}" actualizado`)
    searchRef.current?.focus()
  }

  // ── Callback de actualización masiva ──────────────────────────────────────
  async function onBulkSuccess(affected: number) {
    setVista('tabla')
    showToast(`${affected} productos actualizados`)
    await loadAll()
  }

  // ── Conteos por estado de stock (sobre el inventario completo) ─────────────
  const conteos = productos.reduce(
    (acc, p) => { acc[estadoStock(p)]++; return acc },
    { ok: 0, bajo: 0, 'sin-stock': 0 } as Record<EstadoStock, number>,
  )

  // ── Lista visible: búsqueda + filtro por estado ────────────────────────────
  const visible = filtro === 'todos' ? filtered : filtered.filter((p) => estadoStock(p) === filtro)

  // ── Vista: formularios y modal masivo ─────────────────────────────────────
  if (vista === 'form-nuevo') {
    return (
      <ProductForm
        onSuccess={onGuardado}
        onClose={() => setVista('tabla')}
      />
    )
  }

  if (vista === 'form-editar' && selected) {
    return (
      <ProductForm
        producto={selected}
        onSuccess={onGuardado}
        onClose={() => setVista('tabla')}
      />
    )
  }

  return (
    <div className="inv-page">

      {/* Header */}
      <header className="inv-header">
        <h2 className="inv-title">Inventario</h2>
        <div className="inv-actions">
          <button className="btn-ghost" onClick={() => setVista('bulk')}>
            Actualizar precios
          </button>
          <button className="btn-primary" onClick={() => setVista('form-nuevo')}>
            + Nuevo producto
          </button>
        </div>
      </header>

      {/* Tarjetas de conteo por estado de stock (clic para filtrar) */}
      <div className="inv-stats">
        <button
          className={`stat-card${filtro === 'todos' ? ' active' : ''}`}
          onClick={() => setFiltro('todos')}
        >
          <span className="stat-num">{productos.length}</span>
          <span className="stat-label">Productos</span>
        </button>
        <button
          className={`stat-card stat-ok${filtro === 'ok' ? ' active' : ''}`}
          onClick={() => setFiltro('ok')}
        >
          <span className="stat-num">{conteos.ok}</span>
          <span className="stat-label">Stock OK</span>
        </button>
        <button
          className={`stat-card stat-bajo${filtro === 'bajo' ? ' active' : ''}`}
          onClick={() => setFiltro('bajo')}
        >
          <span className="stat-num">{conteos.bajo}</span>
          <span className="stat-label">Stock bajo</span>
        </button>
        <button
          className={`stat-card stat-sin${filtro === 'sin-stock' ? ' active' : ''}`}
          onClick={() => setFiltro('sin-stock')}
        >
          <span className="stat-num">{conteos['sin-stock']}</span>
          <span className="stat-label">Sin stock</span>
        </button>
      </div>

      {/* Barra de búsqueda */}
      <div className="inv-search-bar">
        <input
          ref={searchRef}
          className="search-input"
          placeholder="Buscar por nombre o código de barras…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        {toast && <span className="scan-toast">{toast}</span>}
      </div>

      {/* Tabla */}
      <div className="inv-table-wrap">
        {loading ? (
          <p className="inv-loading">Cargando…</p>
        ) : visible.length === 0 ? (
          <p className="inv-empty">
            {query
              ? `Sin resultados para "${query}"`
              : filtro !== 'todos'
                ? 'Ningún producto en esta categoría'
                : 'No hay productos cargados aún'}
          </p>
        ) : (
          <table className="inv-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Código</th>
                <th>Precio venta</th>
                <th>Costo</th>
                <th>Stock</th>
                <th>Unidad</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => {
                const estado = estadoStock(p)
                return (
                <tr
                  key={p.id}
                  className={`inv-row${estado === 'bajo' ? ' low-stock' : ''}${estado === 'sin-stock' ? ' no-stock' : ''}`}
                  onClick={() => setSelected(p)}
                >
                  <td className="inv-nombre">{p.nombre}</td>
                  <td className="inv-code">{p.codigo_barras ?? '—'}</td>
                  <td className="inv-price">{formatPrecio(p.precio_venta)}</td>
                  <td className="inv-cost">{p.precio_costo != null ? formatPrecio(p.precio_costo) : '—'}</td>
                  <td className={`inv-stock${estado !== 'ok' ? ' text-red' : ''}`}>
                    {p.stock_actual}
                  </td>
                  <td className="inv-unit">{p.unidad}</td>
                  <td>
                    <button
                      className="inv-edit-btn"
                      onClick={(e) => { e.stopPropagation(); setSelected(p); setVista('form-editar') }}
                    >
                      Editar
                    </button>
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal actualización masiva */}
      {vista === 'bulk' && (
        <BulkPriceUpdate
          onSuccess={onBulkSuccess}
          onClose={() => setVista('tabla')}
        />
      )}

    </div>
  )
}
