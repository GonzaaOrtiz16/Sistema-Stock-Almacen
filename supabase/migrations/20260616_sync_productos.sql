-- ════════════════════════════════════════════════════════════════════════════
-- Sincronización de productos entre la PC "caja" (dueña del catálogo y del stock)
-- y la PC "gestor" (solo agrega productos y carga stock).
--
-- Modelo:
--   · sync_catalogo → espejo del catálogo. SOLO la caja escribe; el gestor lee.
--   · sync_ops      → cola de órdenes. SOLO el gestor escribe; la caja consume.
--
-- Correr este script una vez en: Supabase → SQL Editor → New query → Run.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Catálogo (lo publica la caja, lo lee el gestor) ─────────────────────────
create table if not exists sync_catalogo (
  uuid          text primary key,
  codigo_barras text,
  nombre        text not null,
  precio_venta  numeric not null,
  precio_costo  numeric,
  stock_actual  numeric not null default 0,
  stock_minimo  numeric not null default 0,
  unidad        text    not null default 'unidad',
  activo        boolean not null default true,
  updated_at    timestamptz not null default now()
);

-- ── Cola de órdenes (las encola el gestor, las ejecuta la caja) ─────────────
create table if not exists sync_ops (
  id            uuid primary key default gen_random_uuid(),
  tipo          text not null check (tipo in ('crear','sumar_stock','actualizar')),
  producto_uuid text,                       -- a qué producto aplica (null si 'crear')
  payload       jsonb not null default '{}'::jsonb,
  origen        text,                        -- identificador de la PC que la creó
  estado        text not null default 'pendiente'
                check (estado in ('pendiente','aplicada','error')),
  error_msg     text,
  created_at    timestamptz not null default now(),
  applied_at    timestamptz
);

create index if not exists idx_sync_ops_pendientes
  on sync_ops (created_at)
  where estado = 'pendiente';

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- La app accede desde el proceso main con la SERVICE_ROLE key, que IGNORA RLS.
-- Por eso no hacen falta políticas para que funcione. Si querés blindar el
-- acceso anónimo (anon key), dejá RLS activado SIN políticas: la service role
-- sigue pudiendo y el resto queda bloqueado.
alter table sync_catalogo enable row level security;
alter table sync_ops      enable row level security;
