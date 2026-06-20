import { useMemo, useState } from 'react'
import type { Producto } from '@shared/types/producto.types'
import type { Promocion, PromocionCreateInput, PromocionUpdateInput } from '@shared/types/promocion.types'
import { formatPrecio } from '../../utils/format'
import { buscarProductos } from '../../utils/search'

interface ItemForm {
  producto_id: number
  nombre: string
  precio_venta: number
  cantidad: number
}

interface Props {
  promocion?: Promocion
  productos: Producto[]
  onSuccess: (saved: Promocion, nuevo: boolean) => void
  onClose: () => void
}

export default function PromocionForm({ promocion, productos, onSuccess, onClose }: Props) {
  const [nombre, setNombre] = useState(promocion?.nombre ?? '')
  const [precio, setPrecio] = useState(promocion?.precio != null ? String(promocion.precio) : '')
  const [activa, setActiva] = useState(promocion ? promocion.activa === 1 : true)
  const [items, setItems] = useState<ItemForm[]>(
    () => (promocion?.items ?? []).map((it) => ({
      producto_id:  it.producto_id,
      nombre:       it.nombre ?? `#${it.producto_id}`,
      precio_venta: it.precio_venta ?? 0,
      cantidad:     it.cantidad,
    })),
  )
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Resultados del buscador (excluye los ya agregados y el genérico de montos manuales).
  const resultados = useMemo(() => {
    if (query.trim().length < 1) return []
    const yaIds = new Set(items.map((i) => i.producto_id))
    return buscarProductos(
      productos.filter((p) => !yaIds.has(p.id) && p.codigo_barras !== '__GENERICO__'),
      query,
    ).slice(0, 8)
  }, [query, productos, items])

  function agregarProducto(p: Producto) {
    setItems((prev) => [
      ...prev,
      { producto_id: p.id, nombre: p.nombre, precio_venta: p.precio_venta, cantidad: 1 },
    ])
    setQuery('')
    setError('')
  }

  function setCantidad(producto_id: number, cantidad: number) {
    setItems((prev) => prev.map((i) => (i.producto_id === producto_id ? { ...i, cantidad } : i)))
  }

  function quitar(producto_id: number) {
    setItems((prev) => prev.filter((i) => i.producto_id !== producto_id))
  }

  const precioNormal = items.reduce((acc, i) => acc + i.precio_venta * i.cantidad, 0)
  const precioNum = parseFloat(precio)
  const ahorro = !Number.isNaN(precioNum) ? precioNormal - precioNum : 0
  const totalUnidades = items.reduce((acc, i) => acc + (i.cantidad || 0), 0)
  const esCombo = items.length > 1

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nombre.trim())                 { setError('Poné un nombre para la promoción'); return }
    if (items.length === 0)             { setError('Agregá al menos un producto'); return }
    if (items.some((i) => !(i.cantidad >= 1))) { setError('Las cantidades deben ser 1 o más'); return }
    if (!precio || precioNum < 0 || Number.isNaN(precioNum)) { setError('Ingresá el precio final de la promo'); return }
    if (totalUnidades < 2)              { setError('Una promo necesita al menos 2 unidades en total'); return }

    setLoading(true)
    setError('')
    try {
      const base: PromocionCreateInput = {
        nombre: nombre.trim(),
        precio: precioNum,
        activa,
        items: items.map((i) => ({ producto_id: i.producto_id, cantidad: i.cantidad })),
      }
      const saved = promocion
        ? await window.electronAPI.promociones.actualizar({ ...base, id: promocion.id } satisfies PromocionUpdateInput)
        : await window.electronAPI.promociones.crear(base)
      onSuccess(saved, !promocion)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar la promoción')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="promo-page">
      <header className="inv-header">
        <h2 className="inv-title">{promocion ? 'Editar promoción' : 'Nueva promoción'}</h2>
        <button className="btn-ghost" onClick={onClose}>← Volver</button>
      </header>

      <form className="promo-form" onSubmit={handleSubmit}>
        <div className="field-row">
          <div className="field-group">
            <label className="form-label">Nombre de la promoción *</label>
            <input
              className="form-input"
              value={nombre}
              onChange={(e) => { setNombre(e.target.value); setError('') }}
              placeholder="Combo Coca + Fernet"
              autoFocus
            />
          </div>
          <div className="field-group">
            <label className="form-label">Precio final *</label>
            <input
              type="number" min="0" step="0.01"
              className="form-input"
              value={precio}
              onChange={(e) => { setPrecio(e.target.value); setError('') }}
              placeholder="0.00"
            />
          </div>
        </div>

        <label className="promo-toggle">
          <input type="checkbox" checked={activa} onChange={(e) => setActiva(e.target.checked)} />
          <span className="promo-toggle-label">Promoción activa (se aplica en la caja)</span>
        </label>

        {/* Selector de productos */}
        <div className="field-group">
          <label className="form-label">Productos de la promo *</label>
          <p className="promo-hint">
            Agregá <b>un</b> producto y subí la cantidad para promos del mismo producto, o agregá
            <b> varios</b> productos para un combo.
          </p>
          <div className="promo-picker">
            <input
              className="form-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar producto por nombre o código…"
            />
            {resultados.length > 0 && (
              <ul className="promo-picker-results">
                {resultados.map((p) => (
                  <li key={p.id} onClick={() => agregarProducto(p)}>
                    <span className="result-nombre">{p.nombre}</span>
                    <span className="result-precio">{formatPrecio(p.precio_venta)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Ítems agregados */}
        {items.length > 0 && (
          <div className="promo-items-table">
            {items.map((i) => (
              <div key={i.producto_id} className="promo-item-row">
                <input
                  type="number" min="1" step="1"
                  className="form-input promo-item-cant-input"
                  value={i.cantidad}
                  onChange={(e) => setCantidad(i.producto_id, parseInt(e.target.value) || 0)}
                />
                <span className="promo-item-nombre">{i.nombre}</span>
                <span className="promo-item-precio">{formatPrecio(i.precio_venta * i.cantidad)}</span>
                <button type="button" className="promo-item-del" onClick={() => quitar(i.producto_id)}>×</button>
              </div>
            ))}
          </div>
        )}

        {/* Resumen */}
        {items.length > 0 && (
          <div className="promo-resumen">
            <div className="promo-resumen-row">
              <span>Precio normal {esCombo ? '(combo)' : ''}</span>
              <span className="promo-resumen-normal">{formatPrecio(precioNormal)}</span>
            </div>
            {!Number.isNaN(precioNum) && precio !== '' && (
              <>
                <div className="promo-resumen-row">
                  <span>Precio promo</span>
                  <span className="promo-resumen-promo">{formatPrecio(precioNum)}</span>
                </div>
                <div className={`promo-resumen-row promo-resumen-ahorro${ahorro <= 0 ? ' malo' : ''}`}>
                  <span>{ahorro > 0 ? 'Ahorro del cliente' : '⚠ La promo no genera ahorro'}</span>
                  {ahorro > 0 && <span>{formatPrecio(ahorro)}</span>}
                </div>
              </>
            )}
          </div>
        )}

        {error && <p className="error-msg">{error}</p>}

        <div className="promo-form-actions">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={loading}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Guardando…' : promocion ? 'Guardar cambios' : 'Crear promoción'}
          </button>
        </div>
      </form>
    </div>
  )
}
