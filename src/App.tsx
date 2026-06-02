import { useEffect } from 'react'
import { useCajaStore, type AdminPage } from './store/cajaStore'
import { useSyncStore } from './store/syncStore'
import LoginPin from './modules/auth/LoginPin'
import AperturaCaja from './modules/caja/AperturaCaja'
import CheckoutPage from './modules/checkout/CheckoutPage'
import ProductosPage from './modules/inventario/ProductosPage'
import ReportesPage from './modules/reportes/ReportesPage'
import ConfiguracionPage from './modules/config/ConfiguracionPage'

// ─── Layout de administrador ─────────────────────────────────────────────────

function AdminLayout({ children }: { children: React.ReactNode }) {
  const { usuario, adminPage, navigateAdmin, logout } = useCajaStore()
  const isOnline = useSyncStore((s) => s.info.estado === 'online' || s.info.estado === 'syncing')

  const navItems: Array<{ page: AdminPage; label: string }> = [
    { page: 'checkout',   label: 'Caja' },
    { page: 'inventario', label: 'Inventario' },
    { page: 'reportes',   label: 'Reportes' },
    { page: 'config',     label: 'Configuración' },
  ]

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <div className="sidebar-header">
          <span className="sidebar-name">{usuario?.nombre}</span>
          <span className={`sync-dot ${isOnline ? 'online' : 'offline'}`} title={isOnline ? 'Online' : 'Offline'} />
        </div>

        <nav className="sidebar-nav">
          {navItems.map(({ page, label }) => (
            <button
              key={page}
              className={`sidebar-btn${adminPage === page ? ' active' : ''}`}
              onClick={() => navigateAdmin(page)}
            >
              {label}
            </button>
          ))}
        </nav>

        <button className="sidebar-logout" onClick={logout}>
          Cerrar sesión
        </button>
      </aside>

      <main className="admin-main">{children}</main>
    </div>
  )
}

// ─── Router principal ────────────────────────────────────────────────────────

export default function App() {
  const { usuario, turnoActivo, adminPage } = useCajaStore()
  const { setInfo } = useSyncStore()

  // Suscribir a eventos de sync desde el proceso main
  useEffect(() => {
    const api = window.electronAPI.sync
    api.onOnline(() =>
      setInfo({ estado: 'online', ultimo_sync: new Date().toISOString() }),
    )
    api.onOffline(() => setInfo({ estado: 'offline' }))
    api.onProgress((p) =>
      setInfo({ estado: 'syncing', pendientes: p.total - p.synced }),
    )
    return () => api.removeListeners()
  }, [setInfo])

  // Guard: sin usuario → pantalla de login
  if (!usuario) return <LoginPin />

  // Guard: usuario sin turno abierto → apertura de caja
  if (!turnoActivo) return <AperturaCaja />

  // Cajero: solo checkout (sin navegación lateral)
  if (usuario.rol === 'cajero') return <CheckoutPage />

  // Admin / supervisor: panel completo con barra lateral
  return (
    <AdminLayout>
      {adminPage === 'checkout'   && <CheckoutPage />}
      {adminPage === 'inventario' && <ProductosPage />}
      {adminPage === 'reportes'   && <ReportesPage />}
      {adminPage === 'config'     && <ConfiguracionPage />}
    </AdminLayout>
  )
}
