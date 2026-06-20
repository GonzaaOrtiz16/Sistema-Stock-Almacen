import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import WebSocket from 'ws'

// Cliente Supabase único para el proceso main. Usa la SERVICE_ROLE key (ignora
// RLS) porque toda la lógica corre del lado de la app.
//
// Electron empaqueta Node 20, que no trae WebSocket nativo; supabase-js crea un
// cliente Realtime que falla al conectar sin él, así que le pasamos `ws` como
// transporte (solo usamos REST, pero el constructor igual lo necesita).
let cached: SupabaseClient | null | undefined

export function getSupabase(): SupabaseClient | null {
  if (cached !== undefined) return cached

  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    cached = null
    return null
  }

  cached = createClient(url, key, {
    auth: { persistSession: false },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    realtime: { transport: WebSocket as any },
  })
  return cached
}
