# 🛒 Almacén Minimercado Gabriela — POS System

A professional, **offline-first** Point of Sale desktop application built for small retail stores. Works seamlessly without internet and syncs automatically to the cloud when connectivity is restored.

![Version](https://img.shields.io/badge/version-1.0.0-blue) ![Platform](https://img.shields.io/badge/platform-Windows-blue) ![License](https://img.shields.io/badge/license-MIT-green)

---

## ✨ Key Features

- **🔌 Offline-First Architecture** — All data is stored locally in SQLite. The app works 100% without internet; sync to Supabase happens transparently in the background.
- **📦 Real-Time Stock Management** — Inventory updates automatically on every sale. Low-stock alerts keep shelves stocked.
- **🔍 Barcode Scanner Support** — Native integration with USB barcode scanners via timing-based input detection (scanner vs. keyboard).
- **💳 Multiple Payment Methods** — Cash, debit, credit, QR, and mixed payments (cash + card). Automatic change calculation for cash.
- **🚫 Sale Cancellation System** — Online mode requests remote admin approval; offline mode validates with PIN + 3-attempt lockout (5-minute cooldown).
- **👥 Role-Based Access Control** — Three roles: `cajero` (cashier), `supervisor`, and `admin`, each with distinct permissions.
- **📊 Sales Reports** — Daily, yesterday, 7-day, and 30-day summaries with top-10 products and per-payment-method breakdown.
- **☁️ Supabase Sync** — Asynchronous push/pull sync engine. Activates automatically once `.env` credentials are provided.
- **🔄 Auto-Updates** — Automatic in-app updates via GitHub Releases using `electron-updater`.
- **🔐 Secure PIN Auth** — User PINs are hashed with `bcrypt`. No plain-text credentials stored anywhere.

---

## 🛠️ Tech Stack

| Technology | Version | Role |
|---|---|---|
| [Electron](https://www.electronjs.org/) | 32.x | Desktop shell, native OS access, IPC bridge |
| [React](https://react.dev/) | 19.x | UI renderer (renderer process) |
| [TypeScript](https://www.typescriptlang.org/) | 5.6 | Type safety across main + renderer processes |
| [Vite](https://vitejs.dev/) | 5.x | Build tool + dev server (via vite-plugin-electron) |
| [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) | 11.x | Synchronous SQLite — local database (WAL mode) |
| [Supabase JS](https://supabase.com/) | 2.x | Cloud sync target (Postgres via REST/Realtime) |
| [Zustand](https://zustand-demo.pmnd.rs/) | 5.x | Lightweight client state management |
| [bcrypt](https://github.com/kelektiv/node.bcrypt.js) | 5.x | PIN hashing (loaded dynamically to avoid startup cost) |
| [electron-updater](https://www.electron.build/auto-update) | 6.x | Auto-update from GitHub Releases |
| [electron-log](https://github.com/megahertz/electron-log) | 5.x | Structured logging for main process |

---

## 🏗️ Architecture

### Process Model

```
┌─────────────────────────────────────────────────────────────┐
│                     RENDERER PROCESS                        │
│  React 19 + Zustand + TypeScript                            │
│  (CheckoutPage, ProductosPage, ReportesPage, LoginPin...)   │
└──────────────────────┬──────────────────────────────────────┘
                       │  window.electronAPI (contextBridge)
                       │  IPC channels (typed, sandboxed)
┌──────────────────────▼──────────────────────────────────────┐
│                     MAIN PROCESS                            │
│  electron/main.ts  +  electron/ipc/*.ipc.ts                 │
│  (productos, ventas, caja, auth, sync, reportes, anulaciones)│
└──────────┬──────────────────────────┬───────────────────────┘
           │                          │
┌──────────▼──────────┐   ┌───────────▼───────────────────────┐
│   SQLite (local)    │   │       SyncEngine                  │
│  better-sqlite3     │   │  NetWatcher + PushWorker +        │
│  WAL mode           │◄──│  BackupWorker                     │
│  Repositories:      │   │                                   │
│  • productos.repo   │   │  Reads: sync_status = 'pending'   │
│  • ventas.repo      │   │  Pushes batches to Supabase        │
│  • caja.repo        │   └───────────┬───────────────────────┘
└─────────────────────┘               │
                                      │  HTTPS / REST
                          ┌───────────▼───────────────────────┐
                          │         Supabase (cloud)          │
                          │   Postgres + Auth + Realtime      │
                          └───────────────────────────────────┘
```

### Data Flow — Sale Transaction

```
User scans barcode
      │
      ▼
useBarcode hook (renderer)
      │
      ▼
productosStore.buscar(barcode)  ──► IPC: productos:buscar
                                          │
                                          ▼
                                    productos.repo.ts
                                    (prepared statement)
                                          │
                                          ▼
                                    SQLite (local, <1ms)
      │
      ▼
cartStore.agregarItem()
      │
      ▼
PaymentModal → confirmar venta
      │
      ▼
IPC: ventas:crear-local
      │
      ▼
ventas.repo.ts  (db.transaction)
  ├── INSERT ventas
  ├── INSERT detalle_ventas  (× items)
  └── UPDATE productos.stock_actual  (× items)
      sync_status = 'pending'
      │
      ▼
SyncEngine picks up pending rows
      │
      ▼
Supabase (when online)
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** 20+ (LTS recommended)
- **Windows 10/11 x64** (the installer targets win-x64)
- **Visual Studio Build Tools** (required to compile native modules: `better-sqlite3`, `bcrypt`)
  - Install "Desktop development with C++" workload

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/your-org/almacen-gabriela.git
cd almacen-gabriela

# 2. Install dependencies WITHOUT running build scripts first
npm install --ignore-scripts

# 3. Compile native modules for Electron
npx electron-builder install-app-deps

# 4. Copy the environment file and fill in your Supabase credentials
cp .env.example .env
# Edit .env — leave blank to run fully offline
```

### Development

```bash
npm run dev        # Start Vite dev server + Electron (hot reload)
```

### Production Build

```bash
npm run build:win  # Compile TypeScript + bundle + create win-x64 installer
                   # Output: release/win-unpacked/
```

### Publish a Release

```bash
# 1. Uncomment the `publish` key in electron-builder.yml
# 2. Set GH_TOKEN in your environment
npm run release    # Build + upload to GitHub Releases (triggers auto-update)
```

---

## 🗄️ Database Schema

All data lives in a local SQLite file (`app.db`) opened in WAL mode for concurrent read performance.

| Table | Description |
|---|---|
| `categorias` | Product categories |
| `productos` | Products — barcode, name, sale price, cost, stock, unit |
| `usuarios` | Users — hashed PIN, role (`cajero` / `admin` / `supervisor`) |
| `turnos_caja` | Cash register shifts — open/close timestamps, amounts |
| `ventas` | Sales — totals, payment method, change, status |
| `detalle_ventas` | Sale line items — product, quantity, unit price |
| `anulaciones` | Cancellation requests — mode (remote/PIN), approval state |
| `config` | Key-value app settings (e.g., `last_poll_ts` for sync) |

Every table that syncs to the cloud carries a `sync_status` column (`pending` / `synced` / `error`) and a `remote_id` column for the Supabase UUID.

---

## ☁️ Sync Architecture

The app follows a **local-first, async-sync** model:

1. **Every write hits SQLite first.** The user never waits for the network.
2. **`SyncEngine`** runs in the main process. On startup it checks `VITE_SUPABASE_URL`; if empty, it logs a warning and stays idle — the app works fully offline.
3. **`NetWatcher`** monitors network connectivity and triggers `PushWorker` when the connection is restored.
4. **`PushWorker`** reads rows where `sync_status = 'pending'` in configurable batches and upserts them to Supabase. On success it flips the rows to `synced`.
5. **`BackupWorker`** periodically uploads a compressed database snapshot for disaster recovery.
6. **Conflict resolution:** Sales are append-only (immutable once created). Cancellations use a state machine (`pendiente` → `aprobada` / `rechazada`) with the cloud as authority when online.

### Activating Sync

Edit `.env` with your Supabase project credentials:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Restart the app — `SyncEngine` activates automatically.

---

## 🔐 Authentication

- Users authenticate with a **numeric PIN** (4–8 digits).
- PINs are hashed with `bcrypt` (cost factor 10) before storage — never stored in plain text.
- A default `admin` user with PIN `1234` is seeded on first launch if no users exist. **Change this immediately in production.**
- Sale cancellations in offline mode require an admin/supervisor PIN and implement a **3-attempt lockout** (5-minute cooldown per sale) via `PinValidator`.

---

## 🔮 Upcoming Features

- [ ] **Supabase real-time cancellation approval** — polling loop for online approval flow (sync engine Phase 4 completion)
- [ ] **Account lockout** — failed login attempt tracking across sessions
- [ ] **Multi-store support** — branch selector and per-store inventory isolation
- [ ] **Customer management** — loyalty points, purchase history
- [ ] **Printer support** — thermal receipt printing via ESC/POS
- [ ] **Advanced reporting** — exportable CSV/PDF reports, profit margins
- [ ] **Linux/macOS builds** — extend `electron-builder.yml` targets

---

## 📁 Project Structure

```
almacen-gabriela/
├── electron/
│   ├── db/
│   │   ├── client.ts          # SQLite singleton (WAL, migrations)
│   │   ├── migrations/        # .sql reference files
│   │   ├── repositories/      # productos, ventas, caja repos
│   │   └── seed.ts            # Default admin user seeding
│   ├── ipc/                   # IPC handlers (productos, ventas, caja, auth, sync, reportes, anulaciones)
│   ├── services/sync/         # SyncEngine, NetWatcher, PushWorker, BackupWorker
│   ├── main.ts                # Electron main entry point
│   └── preload.ts             # contextBridge API surface
├── shared/
│   ├── types/                 # TypeScript interfaces (producto, venta, sync)
│   └── constants.ts           # IPC channel names + business constants
├── src/
│   ├── components/ui/         # Design system (Button, Input, Badge, Spinner, Toast)
│   ├── hooks/                 # useBarcode, useNetworkStatus
│   ├── modules/               # auth, caja, checkout, inventario, reportes
│   ├── store/                 # Zustand stores (cart, caja, sync)
│   └── App.tsx                # State-based router
└── electron-builder.yml       # Windows NSIS installer + auto-update config
```

---

## 📄 License

MIT © Almacén Minimercado Gabriela
