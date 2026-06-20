import { useEffect, useState } from 'react'
import type { AppRole } from '../shared/types/app.types'
import { useCajaStore, type AdminPage } from './store/cajaStore'
import { useSyncStore } from './store/syncStore'
import { useUpdateStore } from './store/updateStore'
import LoginPin from './modules/auth/LoginPin'
import AperturaCaja from './modules/caja/AperturaCaja'
import TurnoExistente from './modules/caja/TurnoExistente'
import CheckoutPage from './modules/checkout/CheckoutPage'
import ProductosPage from './modules/inventario/ProductosPage'
import AgregarStockPage from './modules/inventario/AgregarStockPage'
import PromocionesPage from './modules/promociones/PromocionesPage'
import ReportesPage from './modules/reportes/ReportesPage'
import UsuariosPage from './modules/usuarios/UsuariosPage'
import ConfiguracionPage from './modules/config/ConfiguracionPage'
import GestorApp from './modules/gestor/GestorApp'
import UpdateBanner from './components/UpdateBanner'
import VersionBadge from './components/VersionBadge'

// ─── Layout de administrador ─────────────────────────────────────────────────

function AdminLayout({ children }: { children: React.ReactNode }) {
  const { usuario, adminPage, navigateAdmin, logout } = useCajaStore()
  const isOnline = useSyncStore((s) => s.info.estado === 'online' || s.info.estado === 'syncing')

  const navItems: Array<{ page: AdminPage; label: string }> = [
    { page: 'checkout',    label: 'Caja' },
    { page: 'inventario',  label: 'Inventario' },
    { page: 'stock',       label: 'Ingreso Stock' },
    { page: 'promociones', label: 'Promociones' },
    { page: 'reportes',    label: 'Reportes' },
    // Gestión de usuarios solo para administradores
    ...(usuario?.rol === 'admin' ? [{ page: 'usuarios' as AdminPage, label: 'Usuarios' }] : []),
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
  const { usuario, turnoActivo, turnoPendiente, adminPage } = useCajaStore()
  const { setInfo } = useSyncStore()
  const { setVersion, setDescargando, setListo, setError } = useUpdateStore()
  const [appRole, setAppRole] = useState<AppRole | null>(null)

  // Rol de esta PC (caja vs gestor remoto). Determina la app entera.
  useEffect(() => {
    window.electronAPI.app.getRole().then(setAppRole).catch(() => setAppRole('caja'))
  }, [])

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

  // Versión instalada + eventos del auto-updater (una sola suscripción global)
  useEffect(() => {
    window.electronAPI.app.getVersion().then(setVersion).catch(() => {})
    const api = window.electronAPI.updater
    api.onAvailable((i) => setDescargando(i.version))
    api.onDescargado((i) => setListo(i.version))
    api.onError((i) => setError(i.message))
    return () => api.removeListeners()
  }, [setVersion, setDescargando, setListo, setError])

  function renderContent() {
    // Esperando saber el rol (evita parpadeo de la pantalla de caja en el gestor)
    if (appRole === null) return null

    // Gestor remoto: app aparte, solo administra productos (sin login/caja/ventas)
    if (appRole === 'gestor') return <GestorApp />

    // Guard: sin usuario → pantalla de login
    if (!usuario) return <LoginPin />

    // Guard: hay un turno abierto previo sin cerrar → dejar elegir qué hacer
    if (turnoActivo && turnoPendiente) return <TurnoExistente />

    // Guard: usuario sin turno abierto → apertura de caja
    if (!turnoActivo) return <AperturaCaja />

    // Cajero: solo checkout (sin navegación lateral)
    if (usuario.rol === 'cajero') return <CheckoutPage />

    // Admin / supervisor: panel completo con barra lateral
    return (
      <AdminLayout>
        {adminPage === 'checkout'    && <CheckoutPage />}
        {adminPage === 'inventario'  && <ProductosPage />}
        {adminPage === 'stock'       && <AgregarStockPage />}
        {adminPage === 'promociones' && <PromocionesPage />}
        {adminPage === 'reportes'    && <ReportesPage />}
        {adminPage === 'usuarios'   && <UsuariosPage />}
        {adminPage === 'config'     && <ConfiguracionPage />}
      </AdminLayout>
    )
  }

  // El aviso de actualización se monta siempre, por encima de cualquier pantalla.
  return (
    <>
      <UpdateBanner />
      {renderContent()}
      <VersionBadge />
    </>
  )
}
