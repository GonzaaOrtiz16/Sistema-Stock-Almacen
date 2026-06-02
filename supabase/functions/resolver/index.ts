import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { id, estado } = await req.json()

    if (!id || !['aprobada', 'rechazada'].includes(estado)) {
      return new Response(
        JSON.stringify({ error: 'Parametros invalidos' }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } },
      )
    }

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { error } = await sb
      .from('anulaciones')
      .update({ estado })
      .eq('id', id)
      .eq('estado', 'pendiente')

    if (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } },
      )
    }

    return new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } },
    )
  } catch {
    return new Response(
      JSON.stringify({ error: 'Error interno' }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } },
    )
  }
})
