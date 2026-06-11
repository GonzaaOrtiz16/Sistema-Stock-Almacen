import { useEffect, useState } from 'react'
import './config.css'
import { useToast } from '../../components/ui'
import {
  DEFAULT_PRINTER_CONFIG,
  type PrinterConfig,
  type ImpresoraInfo,
  type AnchoPapel,
} from '../../../shared/types/printer.types'

export default function ConfiguracionPage() {
  const { show } = useToast()
  const [config, setConfig] = useState<PrinterConfig>(DEFAULT_PRINTER_CONFIG)
  const [impresoras, setImpresoras] = useState<ImpresoraInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [probando, setProbando] = useState(false)
  const [importando, setImportando] = useState(false)

  useEffect(() => {
    ;(async () => {
      const [cfgRes, listRes] = await Promise.all([
        window.electronAPI.printer.getConfig(),
        window.electronAPI.printer.listar(),
      ])
      if (cfgRes.ok && cfgRes.data) setConfig(cfgRes.data)
      if (listRes.ok && listRes.data) setImpresoras(listRes.data)
      setLoading(false)
    })()
  }, [])

  function setNegocio<K extends keyof PrinterConfig['negocio']>(
    key: K,
    value: PrinterConfig['negocio'][K],
  ) {
    setConfig((c) => ({ ...c, negocio: { ...c.negocio, [key]: value } }))
  }

  async function guardar() {
    setGuardando(true)
    const res = await window.electronAPI.printer.setConfig(config)
    setGuardando(false)
    if (res.ok) show('Configuración guardada', 'success')
    else show(res.error ?? 'No se pudo guardar', 'error')
  }

  async function importarInventario() {
    setImportando(true)
    const res = await window.electronAPI.productos.importarExcel()
    setImportando(false)
    if (res.ok) show(`${res.importados} productos importados`, 'success')
    else if (res.error !== 'Cancelado') show(res.error ?? 'Error al importar', 'error')
  }

  async function imprimirPrueba() {
    setProbando(true)
    const res = await window.electronAPI.printer.test(config)
    setProbando(false)
    if (res.ok) show('Ticket de prueba enviado', 'success')
    else show(res.error ?? 'No se pudo imprimir la prueba', 'error')
  }

  if (loading) return <div className="config-page"><p>Cargando configuración…</p></div>

  return (
    <div className="config-page">
      <h1 className="page-title">Configuración de impresión</h1>

      <section className="config-section">
        <h2>Inventario</h2>
        <p className="config-hint" style={{ marginBottom: 12 }}>
          Importar productos desde un archivo Excel (.xlsx). Esto reemplaza todos los
          productos existentes y borra las ventas anteriores. El stock queda en 0.
        </p>
        <button className="btn-ghost" onClick={importarInventario} disabled={importando}>
          {importando ? 'Importando…' : 'Importar desde Excel'}
        </button>
      </section>

      <section className="config-section">
        <h2>Tiquetera</h2>

        <label className="config-check">
          <input
            type="checkbox"
            checked={config.habilitado}
            onChange={(e) => setConfig((c) => ({ ...c, habilitado: e.target.checked }))}
          />
          Imprimir ticket automáticamente al cobrar cada venta
        </label>

        <div className="config-field">
          <label>Impresora</label>
          <select
            value={config.deviceName}
            onChange={(e) => setConfig((c) => ({ ...c, deviceName: e.target.value }))}
          >
            <option value="">— Impresora por defecto de Windows —</option>
            {impresoras.map((p) => (
              <option key={p.name} value={p.name}>
                {p.displayName}{p.isDefault ? ' (predeterminada)' : ''}
              </option>
            ))}
          </select>
          {impresoras.length === 0 && (
            <small className="config-hint">
              No se detectaron impresoras instaladas en Windows. Instalá el driver de la tiquetera 3nstar y volvé a entrar.
            </small>
          )}
        </div>

        <div className="config-field">
          <label>Ancho del papel</label>
          <select
            value={config.anchoMm}
            onChange={(e) => setConfig((c) => ({ ...c, anchoMm: Number(e.target.value) as AnchoPapel }))}
          >
            <option value={80}>80 mm</option>
            <option value={58}>58 mm</option>
          </select>
        </div>

        <div className="config-field">
          <label>Avance de papel al cortar (mm)</label>
          <input
            type="number"
            min={0}
            max={60}
            step={1}
            value={config.avanceFinalMm}
            onChange={(e) =>
              setConfig((c) => ({ ...c, avanceFinalMm: Number(e.target.value) || 0 }))
            }
          />
          <small className="config-hint">
            Si el ticket se corta antes de terminar, subí este valor (probá 30–40). Si sale mucho papel en blanco, bajalo.
          </small>
        </div>
      </section>

      <section className="config-section">
        <h2>Datos del negocio (encabezado del ticket)</h2>

        <div className="config-field">
          <label>Nombre</label>
          <input
            type="text"
            value={config.negocio.nombre}
            onChange={(e) => setNegocio('nombre', e.target.value)}
          />
        </div>
        <div className="config-field">
          <label>Dirección</label>
          <input
            type="text"
            value={config.negocio.direccion}
            onChange={(e) => setNegocio('direccion', e.target.value)}
            placeholder="Opcional"
          />
        </div>
        <div className="config-field">
          <label>Teléfono</label>
          <input
            type="text"
            value={config.negocio.telefono}
            onChange={(e) => setNegocio('telefono', e.target.value)}
            placeholder="Opcional"
          />
        </div>
        <div className="config-field">
          <label>Mensaje al pie</label>
          <input
            type="text"
            value={config.negocio.mensajePie}
            onChange={(e) => setNegocio('mensajePie', e.target.value)}
            placeholder="Ej: ¡Gracias por su compra!"
          />
        </div>
      </section>

      <div className="config-actions">
        <button className="btn-primary" onClick={guardar} disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
        <button className="btn-ghost" onClick={imprimirPrueba} disabled={probando}>
          {probando ? 'Imprimiendo…' : 'Imprimir prueba'}
        </button>
      </div>
    </div>
  )
}
