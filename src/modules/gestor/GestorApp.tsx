import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Producto } from '@shared/types/producto.types'
import { useSyncStore } from '../../store/syncStore'
import { useToast } from '../../components/ui'
import { formatPrecio } from '../../utils/format'
import { buscarProductos } from '../../utils/search'
import GestorProductoModal from './GestorProductoModal'
import GestorStockModal from './GestorStockModal'

// Pantalla única del Gestor remoto: SOLO administra productos del catálogo
// (agregar, sumar stock, modificar nombre/precio). No vende ni toca la caja.
// Cada acción encola una orden que la Caja aplica; el cambio se ve al instante
// de forma optimista y se confirma cuando vuelve el catálogo.
export default function GestorApp() {
  const { show } = useToast()
  const isOnline = useSyncStore((s) => s.info.estado === 'online' || s.info.estado === 'syncing')

  const [productos, setProductos] = useState<Producto[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [nuevo, setNuevo] = useState(false)
  const [editar, setEditar] = useState<Producto | null>(null)
  const [sumar, setSumar] = useState<Producto | null>(null)
  const [cambiarModo, setCambiarModo] = useState(false)
  const [cambiando, setCambiando] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  // Vuelve esta PC a modo Caja y reinicia para aplicarlo (salida del modo Gestor).
  async function volverACaja() {
    setCambiando(true)
    await window.electronAPI.app.setRole('caja')
    await window.electronAPI.app.relaunch()
  }

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      setProductos(await window.electronAPI.productos.listar())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  // Refresca el espejo periódicamente: la Caja puede haber cambiado stock/precios.
  useEffect(() => {
    const t = setInterval(loadAll, 20_000)
    return () => clearInterval(t)
  }, [loadAll])

  const visibles = useMemo(() => buscarProductos(productos, query), [productos, query])

  function upsertLocal(p: Producto) {
    setProductos((prev) => {
      const idx = prev.findIndex((x) => x.id === p.id)
      return idx >= 0 ? prev.map((x) => (x.id === p.id ? p : x)) : [p, ...prev]
    })
  }

  return (
    <div className="gestor-app">
      <header className="gestor-header">
        <div className="gestor-title">
          <span className="gestor-badge">GESTOR REMOTO</span>
          <span className="gestor-sub">Almacén Minimercado Gabriela</span>
        </div>
        <span className={`sync-dot ${isOnline ? 'online' : 'offline'}`} title={isOnline ? 'Conectado' : 'Sin conexión — los cambios se envían cuando vuelva'} />
        <button className="btn-ghost gestor-modo-btn" onClick={() => setCambiarModo(true)}>
          Cambiar a modo Caja
        </button>
        <button className="btn-primary" onClick={() => setNuevo(true)}>+ Nuevo producto</button>
      </header>

      <p className="gestor-aviso">
        Esta PC <b>no vende</b>: solo agrega productos y carga stock. Cada cambio se
        envía a la Caja por internet y se aplica allá. El stock se carga
        <b> sumando</b> (recepción de mercadería).
      </p>

      <div className="gestor-search">
        <input
          ref={searchRef}
          className="search-input"
          placeholder="Buscar por nombre o código…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
      </div>

      <div className="inv-table-wrap gestor-table-wrap">
        {loading && productos.length === 0 ? (
          <p className="inv-loading">Cargando catálogo…</p>
        ) : visibles.length === 0 ? (
          <p className="inv-empty">
            {query ? `Sin resultados para "${query}"` : 'Todavía no hay productos en el catálogo. Esperá a que la Caja publique, o agregá uno nuevo.'}
          </p>
        ) : (
          <table className="inv-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Código</th>
                <th>Precio</th>
                <th>Stock</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((p) => (
                <tr key={p.id} className="inv-row">
                  <td className="inv-nombre">{p.nombre}</td>
                  <td className="inv-code">{p.codigo_barras ?? '—'}</td>
                  <td className="inv-price">{formatPrecio(p.precio_venta)}</td>
                  <td className="inv-stock">{p.stock_actual}</td>
                  <td className="gestor-row-actions">
                    <button className="btn-ghost" onClick={() => setSumar(p)}>+ Stock</button>
                    <button className="btn-ghost" onClick={() => setEditar(p)}>Editar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {nuevo && (
        <GestorProductoModal
          onSuccess={(p) => { upsertLocal(p); setNuevo(false); show('Producto encolado — se aplicará en la Caja', 'success') }}
          onClose={() => setNuevo(false)}
        />
      )}

      {editar && (
        <GestorProductoModal
          producto={editar}
          onSuccess={(p) => { upsertLocal(p); setEditar(null); show('Cambio encolado — se aplicará en la Caja', 'success') }}
          onClose={() => setEditar(null)}
        />
      )}

      {sumar && (
        <GestorStockModal
          producto={sumar}
          onSuccess={(p) => { upsertLocal(p); setSumar(null); show('Stock cargado — se aplicará en la Caja', 'success') }}
          onClose={() => setSumar(null)}
        />
      )}

      {cambiarModo && (
        <div className="modal-overlay" onClick={() => !cambiando && setCambiarModo(false)}>
          <div className="modal" style={{ width: 400 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Cambiar a modo Caja</h2>
              {!cambiando && <button className="modal-close" onClick={() => setCambiarModo(false)}>×</button>}
            </div>
            <div className="modal-body">
              <p style={{ lineHeight: 1.6 }}>
                Esta PC va a pasar a <b>modo Caja</b> (vende y es la dueña de la base) y el
                programa se va a <b>reiniciar</b> para aplicar el cambio.
              </p>
              <p className="promo-hint">Si querés volver al modo Gestor, lo cambiás desde Configuración → “Modo de esta PC”.</p>
            </div>
            <div className="modal-footer">
              <button className="btn-ghost" onClick={() => setCambiarModo(false)} disabled={cambiando}>Cancelar</button>
              <button className="btn-primary" onClick={volverACaja} disabled={cambiando}>
                {cambiando ? 'Reiniciando…' : 'Cambiar y reiniciar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
