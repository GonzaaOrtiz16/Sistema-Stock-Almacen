import { useEffect, useState } from 'react'
import type { Producto, ProductoCreateInput, ProductoUpdateInput, Unidad } from '@shared/types/producto.types'

interface Props {
  producto?: Producto        // undefined = crear nuevo
  onSuccess: (p: Producto) => void
  onClose: () => void
}

const UNIDADES: Unidad[] = ['unidad', 'kg', 'lt', 'gr']

interface Form {
  codigo_barras: string
  nombre: string
  precio_venta: string
  precio_costo: string
  stock_actual: string
  stock_minimo: string
  unidad: Unidad
  categoria_id: string
}

function toForm(p?: Producto): Form {
  return {
    codigo_barras: p?.codigo_barras ?? '',
    nombre:        p?.nombre        ?? '',
    precio_venta:  p?.precio_venta  != null ? String(p.precio_venta)  : '',
    precio_costo:  p?.precio_costo  != null ? String(p.precio_costo)  : '',
    stock_actual:  p?.stock_actual  != null ? String(p.stock_actual)  : '0',
    stock_minimo:  p?.stock_minimo  != null ? String(p.stock_minimo)  : '0',
    unidad:        p?.unidad        ?? 'unidad',
    categoria_id:  p?.categoria_id  != null ? String(p.categoria_id) : '',
  }
}

export default function ProductForm({ producto, onSuccess, onClose }: Props) {
  const [form,    setForm]    = useState<Form>(() => toForm(producto))
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  useEffect(() => { setForm(toForm(producto)) }, [producto])

  function set(field: keyof Form, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
    setError('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.nombre.trim())         { setError('El nombre es obligatorio');            return }
    if (!form.precio_venta)          { setError('El precio de venta es obligatorio');   return }
    if (parseFloat(form.precio_venta) < 0) { setError('El precio no puede ser negativo'); return }

    setLoading(true)
    setError('')
    try {
      const base = {
        codigo_barras: form.codigo_barras.trim() || null,
        nombre:        form.nombre.trim(),
        precio_venta:  parseFloat(form.precio_venta),
        precio_costo:  form.precio_costo ? parseFloat(form.precio_costo) : null,
        stock_actual:  parseFloat(form.stock_actual)  || 0,
        stock_minimo:  parseFloat(form.stock_minimo)  || 0,
        unidad:        form.unidad,
        categoria_id:  form.categoria_id ? parseInt(form.categoria_id) : null,
      }

      let result: Producto
      if (producto) {
        result = await window.electronAPI.productos.actualizar({ ...base, id: producto.id } satisfies ProductoUpdateInput)
      } else {
        result = await window.electronAPI.productos.crear(base satisfies ProductoCreateInput)
      }
      onSuccess(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal product-form-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{producto ? 'Editar producto' : 'Nuevo producto'}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <form className="modal-body" onSubmit={handleSubmit}>
          {/* Nombre */}
          <div className="field-group">
            <label className="form-label">Nombre *</label>
            <input
              className="form-input"
              value={form.nombre}
              onChange={(e) => set('nombre', e.target.value)}
              placeholder="Leche entera 1L"
              autoFocus
            />
          </div>

          {/* Código de barras */}
          <div className="field-group">
            <label className="form-label">Código de barras</label>
            <input
              className="form-input"
              value={form.codigo_barras}
              onChange={(e) => set('codigo_barras', e.target.value)}
              placeholder="7790123456789"
            />
          </div>

          {/* Precios — fila 2 columnas */}
          <div className="field-row">
            <div className="field-group">
              <label className="form-label">Precio de venta *</label>
              <input
                type="number" min="0" step="0.01"
                className="form-input"
                value={form.precio_venta}
                onChange={(e) => set('precio_venta', e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="field-group">
              <label className="form-label">Precio de costo</label>
              <input
                type="number" min="0" step="0.01"
                className="form-input"
                value={form.precio_costo}
                onChange={(e) => set('precio_costo', e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          {/* Stock — fila 3 columnas */}
          <div className="field-row field-row-3">
            <div className="field-group">
              <label className="form-label">Stock actual</label>
              <input
                type="number" min="0" step="0.001"
                className="form-input"
                value={form.stock_actual}
                onChange={(e) => set('stock_actual', e.target.value)}
              />
            </div>
            <div className="field-group">
              <label className="form-label">Stock mínimo</label>
              <input
                type="number" min="0" step="0.001"
                className="form-input"
                value={form.stock_minimo}
                onChange={(e) => set('stock_minimo', e.target.value)}
              />
            </div>
            <div className="field-group">
              <label className="form-label">Unidad</label>
              <select
                className="form-input form-select"
                value={form.unidad}
                onChange={(e) => set('unidad', e.target.value)}
              >
                {UNIDADES.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
          </div>

          {error && <p className="error-msg">{error}</p>}

          <div className="modal-footer" style={{ padding: 0, borderTop: 'none', marginTop: 4 }}>
            <button type="button" className="btn-ghost" onClick={onClose} disabled={loading}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Guardando…' : producto ? 'Guardar cambios' : 'Crear producto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
