import { useCallback, useEffect, useState } from 'react'
import type { ResumenPeriodo, VentaDiaria, TopProducto } from '@shared/types/reporte.types'
import type { MetodoPago } from '@shared/types/venta.types'
import { formatPrecio, formatFecha } from '../../utils/format'

// ── Helpers de fecha ─────────────────────────────────────────────────────────
function toISO(d: Date): string { return d.toISOString().split('T')[0] }

function rangoPeriodo(periodo: string): { desde: string; hasta: string } {
  const hoy = new Date()
  const hasta = toISO(hoy)
  switch (periodo) {
    case 'hoy':   return { desde: hasta, hasta }
    case 'ayer': { const a = new Date(hoy); a.setDate(a.getDate() - 1); return { desde: toISO(a), hasta: toISO(a) } }
    case '7d':  { const d = new Date(hoy); d.setDate(d.getDate() - 6); return { desde: toISO(d), hasta } }
    case '30d': { const d = new Date(hoy); d.setDate(d.getDate() - 29); return { desde: toISO(d), hasta } }
    default:     return { desde: hasta, hasta }
  }
}

const ETIQUETAS_METODO: Record<MetodoPago, string> = {
  efectivo: 'Efectivo', debito: 'Débito', credito: 'Crédito', qr: 'QR', mixto: 'Mixto',
}

// ── Barra visual CSS ─────────────────────────────────────────────────────────
function BarChart({ data, max }: { data: Array<{ label: string; value: number }>; max: number }) {
  return (
    <div className="bar-chart">
      {data.map(({ label, value }) => (
        <div key={label} className="bar-row">
          <span className="bar-label">{label}</span>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: max > 0 ? `${(value / max) * 100}%` : '0%' }} />
          </div>
          <span className="bar-value">{formatPrecio(value)}</span>
        </div>
      ))}
    </div>
  )
}

// ── Tarjeta resumen ───────────────────────────────────────────────────────────
function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="report-card">
      <span className="report-card-label">{label}</span>
      <span className="report-card-value">{value}</span>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function ReportesPage() {
  const [periodo,    setPeriodo]    = useState('hoy')
  const [resumen,    setResumen]    = useState<ResumenPeriodo | null>(null)
  const [historial,  setHistorial]  = useState<VentaDiaria[]>([])
  const [topProds,   setTopProds]   = useState<TopProducto[]>([])
  const [loading,    setLoading]    = useState(false)

  const cargar = useCallback(async () => {
    setLoading(true)
    const { desde, hasta } = rangoPeriodo(periodo)
    try {
      const [r, h, t] = await Promise.all([
        window.electronAPI.reportes.resumen(desde, hasta),
        window.electronAPI.reportes.historial(desde, hasta),
        window.electronAPI.reportes.topProductos(desde, hasta),
      ])
      setResumen(r)
      setHistorial(h)
      setTopProds(t)
    } finally {
      setLoading(false)
    }
  }, [periodo])

  useEffect(() => { cargar() }, [cargar])

  const metodoData = resumen
    ? (Object.entries(resumen.por_metodo) as [MetodoPago, number][])
        .filter(([, v]) => v > 0)
        .map(([k, v]) => ({ label: ETIQUETAS_METODO[k], value: v }))
    : []
  const maxMetodo = metodoData.reduce((a, b) => Math.max(a, b.value), 0)

  const maxHistorial = historial.reduce((a, b) => Math.max(a, b.total), 0)

  return (
    <div className="reportes-page">

      {/* Header */}
      <header className="reportes-header">
        <h2 className="inv-title">Reportes</h2>
        <div className="periodo-tabs">
          {[
            { key: 'hoy',  label: 'Hoy' },
            { key: 'ayer', label: 'Ayer' },
            { key: '7d',   label: '7 días' },
            { key: '30d',  label: '30 días' },
          ].map(({ key, label }) => (
            <button
              key={key}
              className={`periodo-tab${periodo === key ? ' active' : ''}`}
              onClick={() => setPeriodo(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <button className="btn-ghost" onClick={cargar} disabled={loading}>
          {loading ? 'Cargando…' : 'Actualizar'}
        </button>
      </header>

      <div className="reportes-body">
        {loading && !resumen ? (
          <p className="inv-loading">Cargando…</p>
        ) : resumen ? (
          <>
            {/* Tarjetas resumen */}
            <section className="report-section">
              <div className="report-cards">
                <Card label="Total vendido"    value={formatPrecio(resumen.total_ventas)} />
                <Card label="N° de ventas"     value={String(resumen.cantidad_ventas)} />
                <Card label="Ticket promedio"  value={resumen.cantidad_ventas > 0 ? formatPrecio(resumen.promedio_venta) : '—'} />
              </div>
            </section>

            {/* Por método de pago */}
            {metodoData.length > 0 && (
              <section className="report-section">
                <h3 className="report-section-title">Por método de pago</h3>
                <BarChart data={metodoData} max={maxMetodo} />
              </section>
            )}

            {/* Historial diario */}
            {historial.length > 0 && (
              <section className="report-section">
                <h3 className="report-section-title">Ventas por día</h3>
                <div className="bar-chart">
                  {historial.map((d) => (
                    <div key={d.fecha} className="bar-row">
                      <span className="bar-label">{d.fecha}</span>
                      <div className="bar-track">
                        <div className="bar-fill" style={{ width: maxHistorial > 0 ? `${(d.total / maxHistorial) * 100}%` : '0%' }} />
                      </div>
                      <span className="bar-value">{formatPrecio(d.total)}</span>
                      <span className="bar-count">{d.cantidad} vta{d.cantidad !== 1 ? 's' : ''}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Top productos */}
            {topProds.length > 0 && (
              <section className="report-section">
                <h3 className="report-section-title">Top 10 productos</h3>
                <table className="inv-table top-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Producto</th>
                      <th>Unidades</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topProds.map((p, i) => (
                      <tr key={p.nombre} className="inv-row">
                        <td className="top-rank">{i + 1}</td>
                        <td className="inv-nombre">{p.nombre}</td>
                        <td>{p.total_cantidad}</td>
                        <td className="inv-price">{formatPrecio(p.total_monto)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {resumen.cantidad_ventas === 0 && (
              <p className="inv-empty">Sin ventas en el período seleccionado</p>
            )}
          </>
        ) : null}
      </div>
    </div>
  )
}
