import { useCallback, useEffect, useRef, useState } from 'react'
import type { Producto, Unidad } from '@shared/types/producto.types'
import { useBarcode } from '../../hooks/useBarcode'
import { formatPrecio } from '../../utils/format'

interface Entrada {
  nombre: string
  cantidad: number
  ts: number
}

const UNIDADES: Unidad[] = ['unidad', 'kg', 'lt', 'gr']

export default function AgregarStockPage() {
  const [barcode,   setBarcode]   = useState('')
  const [producto,  setProducto]  = useState<Producto | null>(null)
  const [notFound,  setNotFound]  = useState(false)
  const [cantidad,  setCantidad]  = useState('')
  const [precio,    setPrecio]    = useState('')
  const [nombre,    setNombre]    = useState('')
  const [unidad,    setUnidad]    = useState<Unidad>('unidad')
  const [guardando, setGuardando] = useState(false)
  const [recientes, setRecientes] = useState<Entrada[]>([])
  const [ok,        setOk]        = useState(false)

  const barcodeRef  = useRef<HTMLInputElement>(null)
  const cantidadRef = useRef<HTMLInputElement>(null)
  const nombreRef   = useRef<HTMLInputElement>(null)

  // ¿El producto encontrado no tiene precio cargado?
  const sinPrecio = !!producto && producto.precio_venta <= 0

  // Buscar producto por barcode
  const buscar = useCallback(async (code: string) => {
    const trimmed = code.trim()
    if (!trimmed) return
    setNotFound(false)
    setProducto(null)
    const p = await window.electronAPI.productos.buscarBarcode(trimmed)
    if (p) {
      setProducto(p)
      setCantidad('')
      setPrecio('')
      setTimeout(() => cantidadRef.current?.focus(), 50)
    } else {
      // No existe: abrir formulario de alta con el código ya cargado
      setNotFound(true)
      setBarcode(trimmed)
      setNombre('')
      setPrecio('')
      setCantidad('')
      setUnidad('unidad')
      setTimeout(() => nombreRef.current?.focus(), 50)
    }
  }, [])

  // Scanner global detectado por el hook
  useBarcode((code) => {
    buscar(code)
  })

  // Enter en el campo barcode (tipeo manual)
  function onBarcodeKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      buscar(barcode)
    }
  }

  // Enter en el campo cantidad
  function onCantidadKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      confirmar()
    }
  }

  function mostrarOk(nombreProd: string, cant: number) {
    setRecientes((prev) => [
      { nombre: nombreProd, cantidad: cant, ts: Date.now() },
      ...prev.slice(0, 9),
    ])
    setOk(true)
    setTimeout(() => {
      setOk(false)
      setProducto(null)
      setBarcode('')
      setCantidad('')
      setPrecio('')
      setNombre('')
      setUnidad('unidad')
      setNotFound(false)
      barcodeRef.current?.focus()
    }, 1200)
  }

  // Confirmar ingreso de stock para un producto existente
  async function confirmar() {
    if (!producto) return
    const cant = parseInt(cantidad, 10)
    if (!cant || cant <= 0) return

    setGuardando(true)

    // Si no tenía precio y el usuario lo cargó aquí, actualizarlo
    const precioNum = parseFloat(precio)
    if (sinPrecio && precioNum > 0) {
      await window.electronAPI.productos.actualizar({
        id: producto.id,
        precio_venta: precioNum,
      })
    }

    await window.electronAPI.productos.agregarStock(producto.id, cant)
    setGuardando(false)
    mostrarOk(producto.nombre, cant)
  }

  // Crear un producto nuevo desde el código escaneado
  async function crearProducto() {
    const nom = nombre.trim()
    if (!nom) return
    const cant = parseInt(cantidad, 10)
    if (!cant || cant <= 0) return
    const precioNum = parseFloat(precio)

    setGuardando(true)
    await window.electronAPI.productos.crear({
      codigo_barras: barcode.trim() || null,
      nombre:        nom,
      precio_venta:  precioNum > 0 ? precioNum : 0,
      stock_actual:  cant,
      unidad,
    })
    setGuardando(false)
    mostrarOk(nom, cant)
  }

  // Auto-focus al montar
  useEffect(() => {
    barcodeRef.current?.focus()
  }, [])

  return (
    <div className="stock-page">
      <header className="stock-header">
        <h2 className="stock-title">Ingreso de Stock</h2>
      </header>

      <div className="stock-body">
        {/* Panel principal */}
        <div className="stock-panel">

          {/* Campo barcode */}
          <div className="stock-field">
            <label className="stock-label">Código de barras</label>
            <input
              ref={barcodeRef}
              className="stock-input"
              placeholder="Escanear o escribir…"
              value={barcode}
              onChange={(e) => {
                setBarcode(e.target.value)
                setNotFound(false)
              }}
              onKeyDown={onBarcodeKeyDown}
              autoComplete="off"
            />
          </div>

          {/* Tarjeta del producto encontrado */}
          {producto && !ok && (
            <div className="stock-producto-card">
              <p className="stock-producto-nombre">{producto.nombre}</p>
              <p className="stock-producto-meta">
                Stock actual: <strong>{producto.stock_actual}</strong> unid.
                {producto.precio_venta > 0 && (
                  <span> · Precio: {formatPrecio(producto.precio_venta)}</span>
                )}
              </p>

              {/* Si no tiene precio, ofrecer cargarlo aquí */}
              {sinPrecio && (
                <div className="stock-field" style={{ marginTop: 12 }}>
                  <label className="stock-label">Precio de venta (este producto no tiene)</label>
                  <input
                    className="stock-input"
                    type="number"
                    min={0}
                    step="any"
                    placeholder="Ej: 1500"
                    value={precio}
                    onChange={(e) => setPrecio(e.target.value)}
                  />
                </div>
              )}

              <div className="stock-field" style={{ marginTop: 16 }}>
                <label className="stock-label">Cantidad a ingresar</label>
                <input
                  ref={cantidadRef}
                  className="stock-input stock-input-cantidad"
                  type="number"
                  min={1}
                  step={1}
                  placeholder="0"
                  value={cantidad}
                  onChange={(e) => setCantidad(e.target.value)}
                  onKeyDown={onCantidadKeyDown}
                />
              </div>

              <button
                className="btn-primary stock-confirmar"
                onClick={confirmar}
                disabled={guardando || !cantidad || parseInt(cantidad) <= 0}
              >
                {guardando ? 'Guardando…' : 'Confirmar ingreso'}
              </button>
            </div>
          )}

          {/* Formulario de alta: el código no existe */}
          {notFound && !ok && (
            <div className="stock-producto-card stock-nuevo-card">
              <p className="stock-nuevo-titulo">Producto nuevo</p>
              <p className="stock-producto-meta">
                No existe ningún producto con el código <strong>{barcode}</strong>. Cargalo ahora:
              </p>

              <div className="stock-field" style={{ marginTop: 12 }}>
                <label className="stock-label">Nombre</label>
                <input
                  ref={nombreRef}
                  className="stock-input"
                  placeholder="Nombre del producto"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  autoComplete="off"
                />
              </div>

              <div className="stock-nuevo-row">
                <div className="stock-field" style={{ flex: 1 }}>
                  <label className="stock-label">Precio de venta</label>
                  <input
                    className="stock-input"
                    type="number"
                    min={0}
                    step="any"
                    placeholder="Ej: 1500"
                    value={precio}
                    onChange={(e) => setPrecio(e.target.value)}
                  />
                </div>
                <div className="stock-field" style={{ width: 110 }}>
                  <label className="stock-label">Unidad</label>
                  <select
                    className="stock-input"
                    value={unidad}
                    onChange={(e) => setUnidad(e.target.value as Unidad)}
                  >
                    {UNIDADES.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="stock-field" style={{ marginTop: 4 }}>
                <label className="stock-label">Cantidad inicial</label>
                <input
                  className="stock-input stock-input-cantidad"
                  type="number"
                  min={1}
                  step={1}
                  placeholder="0"
                  value={cantidad}
                  onChange={(e) => setCantidad(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      crearProducto()
                    }
                  }}
                />
              </div>

              <button
                className="btn-primary stock-confirmar"
                onClick={crearProducto}
                disabled={
                  guardando ||
                  !nombre.trim() ||
                  !cantidad ||
                  parseInt(cantidad) <= 0
                }
              >
                {guardando ? 'Guardando…' : 'Crear y agregar stock'}
              </button>
            </div>
          )}

          {/* Feedback de éxito */}
          {ok && (
            <div className="stock-ok">
              <span className="stock-ok-icon">✓</span>
              <span>Stock actualizado</span>
            </div>
          )}
        </div>

        {/* Historial de entradas recientes */}
        {recientes.length > 0 && (
          <div className="stock-recientes">
            <p className="stock-recientes-title">Recientes</p>
            <ul className="stock-recientes-list">
              {recientes.map((e, i) => (
                <li key={i} className="stock-reciente-item">
                  <span className="stock-reciente-nombre">{e.nombre}</span>
                  <span className="stock-reciente-cant">+{e.cantidad}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
