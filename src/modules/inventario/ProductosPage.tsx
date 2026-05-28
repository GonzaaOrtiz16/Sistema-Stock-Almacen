import { useCallback, useEffect, useRef, useState } from 'react'
import type { Producto } from '@shared/types/producto.types'
import { formatPrecio } from '../../utils/format'
import ProductForm from './ProductForm'
import BulkPriceUpdate from './BulkPriceUpdate'

type Vista = 'tabla' | 'form-nuevo' | 'form-editar' | 'bulk'

export default function ProductosPage() {
  const [productos,   setProductos]   = useState<Producto[]>([])
  const [query,       setQuery]       = useState('')
  const [filtered,    setFiltered]    = useState<Producto[]>([])
  const [selected,    setSelected]    = useState<Producto | null>(null)
  const [vista,       setVista]       = useState<Vista>('tabla')
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

  // ── Stock bajo ─────────────────────────────────────────────────────────────
  const stockBajo = filtered.filter((p) => p.stock_actual <= p.stock_minimo && p.stock_minimo > 0)

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
        <span className="inv-count">{filtered.length} productos</span>
        {stockBajo.length > 0 && (
          <span className="stock-alert">⚠ {stockBajo.length} con stock bajo</span>
        )}
        <div className="inv-actions">
          <button className="btn-ghost" onClick={() => setVista('bulk')}>
            Actualizar precios
          </button>
          <button className="btn-primary" onClick={() => setVista('form-nuevo')}>
            + Nuevo producto
          </button>
        </div>
      </header>

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
        ) : filtered.length === 0 ? (
          <p className="inv-empty">
            {query ? `Sin resultados para "${query}"` : 'No hay productos cargados aún'}
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
              {filtered.map((p) => (
                <tr
                  key={p.id}
                  className={`inv-row${p.stock_actual <= p.stock_minimo && p.stock_minimo > 0 ? ' low-stock' : ''}`}
                  onClick={() => setSelected(p)}
                >
                  <td className="inv-nombre">{p.nombre}</td>
                  <td className="inv-code">{p.codigo_barras ?? '—'}</td>
                  <td className="inv-price">{formatPrecio(p.precio_venta)}</td>
                  <td className="inv-cost">{p.precio_costo != null ? formatPrecio(p.precio_costo) : '—'}</td>
                  <td className={`inv-stock${p.stock_actual <= p.stock_minimo && p.stock_minimo > 0 ? ' text-red' : ''}`}>
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
              ))}
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
