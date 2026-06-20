import { useCallback, useEffect, useState } from 'react'
import type { Producto } from '@shared/types/producto.types'
import type { Promocion } from '@shared/types/promocion.types'
import { formatPrecio } from '../../utils/format'
import PromocionForm from './PromocionForm'

// Precio normal (sin promo) de una promoción: suma de precio_venta × cantidad.
function precioNormal(p: Promocion): number {
  return p.items.reduce((acc, it) => acc + (it.precio_venta ?? 0) * it.cantidad, 0)
}

export default function PromocionesPage() {
  const [promos,   setPromos]   = useState<Promocion[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [editando, setEditando] = useState<Promocion | null>(null)
  const [creando,  setCreando]  = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [toast,    setToast]    = useState('')

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const [ps, prods] = await Promise.all([
        window.electronAPI.promociones.listar(),
        window.electronAPI.productos.listar(),
      ])
      setPromos(ps)
      setProductos(prods)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { cargar() }, [cargar])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  function onGuardado(saved: Promocion, nuevo: boolean) {
    setPromos((prev) => {
      const idx = prev.findIndex((x) => x.id === saved.id)
      return idx >= 0 ? prev.map((x) => (x.id === saved.id ? saved : x)) : [saved, ...prev]
    })
    setCreando(false)
    setEditando(null)
    showToast(nuevo ? `Promoción "${saved.nombre}" creada` : `Promoción "${saved.nombre}" actualizada`)
  }

  async function toggleActiva(p: Promocion) {
    const actualizada = await window.electronAPI.promociones.setActiva(p.id, !(p.activa === 1))
    setPromos((prev) => prev.map((x) => (x.id === p.id ? actualizada : x)))
  }

  async function eliminar(p: Promocion) {
    if (!window.confirm(`¿Eliminar la promoción "${p.nombre}"?`)) return
    await window.electronAPI.promociones.eliminar(p.id)
    setPromos((prev) => prev.filter((x) => x.id !== p.id))
    showToast('Promoción eliminada')
  }

  if (creando || editando) {
    return (
      <PromocionForm
        promocion={editando ?? undefined}
        productos={productos}
        onSuccess={onGuardado}
        onClose={() => { setCreando(false); setEditando(null) }}
      />
    )
  }

  const activas = promos.filter((p) => p.activa === 1).length

  return (
    <div className="inv-page">
      <header className="inv-header">
        <h2 className="inv-title">Promociones</h2>
        <div className="inv-actions">
          {toast && <span className="scan-toast">{toast}</span>}
          <button className="btn-primary" onClick={() => setCreando(true)}>
            + Nueva promoción
          </button>
        </div>
      </header>

      <p className="promo-page-hint">
        Creá promos de <b>varias unidades del mismo producto</b> (ej: 2 leches a $1.500) o
        <b> combos de productos distintos</b> (ej: 2 cocas + 1 fernet a $9.000). Vos ponés el
        precio final; en la caja se aplican solas, tantas veces como entren en la compra.
      </p>

      <div className="promo-list-wrap">
        {loading ? (
          <p className="inv-loading">Cargando…</p>
        ) : promos.length === 0 ? (
          <p className="inv-empty">No hay promociones cargadas. Creá la primera con “+ Nueva promoción”.</p>
        ) : (
          <>
            <div className="promo-list-count">{promos.length} promos · {activas} activas</div>
            <div className="promo-cards">
              {promos.map((p) => {
                const normal = precioNormal(p)
                const ahorro = normal - p.precio
                const inactiva = p.activa !== 1
                return (
                  <div key={p.id} className={`promo-card${inactiva ? ' inactiva' : ''}`}>
                    <div className="promo-card-head">
                      <span className="promo-card-nombre">{p.nombre}</span>
                      <span className={`promo-estado${inactiva ? ' off' : ''}`}>
                        {inactiva ? 'Pausada' : 'Activa'}
                      </span>
                    </div>

                    <ul className="promo-card-items">
                      {p.items.map((it) => (
                        <li key={it.producto_id}>
                          <span className="promo-item-cant">{it.cantidad}×</span>
                          <span className="promo-item-nombre">{it.nombre ?? `#${it.producto_id}`}</span>
                        </li>
                      ))}
                    </ul>

                    <div className="promo-card-precios">
                      {ahorro > 0 && <span className="promo-card-normal">{formatPrecio(normal)}</span>}
                      <span className="promo-card-precio">{formatPrecio(p.precio)}</span>
                      {ahorro > 0 && <span className="promo-card-ahorro">Ahorrás {formatPrecio(ahorro)}</span>}
                    </div>

                    <div className="promo-card-acciones">
                      <button className="btn-ghost" onClick={() => toggleActiva(p)}>
                        {inactiva ? 'Activar' : 'Pausar'}
                      </button>
                      <button className="btn-ghost" onClick={() => setEditando(p)}>Editar</button>
                      <button className="promo-del-btn" onClick={() => eliminar(p)}>Eliminar</button>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
