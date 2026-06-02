// Edge Function: mailer
// POST (DB webhook) → manda email al admin con botones Aprobar / Rechazar
// GET  (clic desde el email) → resuelve la anulación y muestra confirmación

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_KEY  = Deno.env.get('RESEND_API_KEY')!
const ADMIN_EMAIL = Deno.env.get('ADMIN_EMAIL')!
const SB_URL      = Deno.env.get('SUPABASE_URL')!
const SB_SERVICE  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FN_BASE     = `${SB_URL}/functions/v1/mailer`

const money = (n: number) =>
  '$ ' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2 })

const METODO: Record<string, string> = {
  efectivo: 'Efectivo', debito: 'Débito', credito: 'Crédito', qr: 'QR', mixto: 'Mixto',
}

// ─────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const url = new URL(req.url)

  // ── GET: admin hizo clic en Aprobar o Rechazar ────────────────────────────
  if (req.method === 'GET') {
    const id     = url.searchParams.get('id')
    const accion = url.searchParams.get('accion')

    if (!id || !['aprobar', 'rechazar'].includes(accion ?? '')) {
      return pageHtml('⚠️', 'Link inválido.', '#f59e0b')
    }

    const estado = accion === 'aprobar' ? 'aprobada' : 'rechazada'
    const emoji  = estado === 'aprobada' ? '✅' : '❌'

    const sb = createClient(SB_URL, SB_SERVICE)
    const { data, error } = await sb
      .from('anulaciones')
      .update({ estado })
      .eq('id', id)
      .eq('estado', 'pendiente')   // solo si todavía nadie la resolvió
      .select('total, cajero')
      .maybeSingle()

    if (error || !data) {
      return pageHtml('⚠️', 'Esta solicitud ya fue resuelta o no existe.', '#f59e0b')
    }

    const titulo = estado === 'aprobada' ? 'Anulación aprobada' : 'Anulación rechazada'
    const color  = estado === 'aprobada' ? '#16a34a' : '#dc2626'
    return pageHtml(emoji, `${titulo} — ${data.cajero} — ${money(data.total)}`, color)
  }

  // ── POST: llegó un nuevo registro desde el DB webhook ────────────────────
  if (req.method === 'POST') {
    const payload = await req.json()
    const r = payload.record

    if (!r || r.estado !== 'pendiente') {
      return new Response('ignorado', { status: 200 })
    }

    const hora = new Date(r.venta_ts).toLocaleString('es-AR', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })

    const itemsRows = (r.items ?? []).map((it: { nombre: string; cantidad: number; subtotal: number }) => `
      <tr>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;font-size:14px">${it.nombre}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:14px;color:#64748b">×${it.cantidad}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600;font-size:14px">${money(it.subtotal)}</td>
      </tr>`).join('')

    const btnAprobar  = `${FN_BASE}?id=${r.id}&accion=aprobar`
    const btnRechazar = `${FN_BASE}?id=${r.id}&accion=rechazar`

    const emailHtml = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:20px;font-family:system-ui,-apple-system,sans-serif;background:#f1f5f9;color:#0f172a">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08)">

    <div style="background:#6366f1;padding:28px 24px;text-align:center">
      <p style="margin:0 0 6px;font-size:12px;color:#c7d2fe;text-transform:uppercase;letter-spacing:.08em">Almacén Gabriela</p>
      <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700">⚠️ Solicitud de anulación</h1>
    </div>

    <div style="padding:28px 24px">

      <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
        <tr>
          <td style="padding:10px 0;color:#64748b;font-size:14px;border-bottom:1px solid #f1f5f9">Cajero</td>
          <td style="padding:10px 0;font-weight:600;text-align:right;border-bottom:1px solid #f1f5f9">${r.cajero}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;color:#64748b;font-size:14px;border-bottom:1px solid #f1f5f9">Total</td>
          <td style="padding:10px 0;font-weight:700;font-size:22px;color:#6366f1;text-align:right;border-bottom:1px solid #f1f5f9">${money(r.total)}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;color:#64748b;font-size:14px;border-bottom:1px solid #f1f5f9">Método de pago</td>
          <td style="padding:10px 0;text-align:right;border-bottom:1px solid #f1f5f9">${METODO[r.metodo_pago] ?? r.metodo_pago}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;color:#64748b;font-size:14px">Hora de la venta</td>
          <td style="padding:10px 0;text-align:right">${hora}</td>
        </tr>
        ${r.motivo ? `
        <tr>
          <td style="padding:10px 0;color:#64748b;font-size:14px;border-top:1px solid #f1f5f9">Motivo</td>
          <td style="padding:10px 0;text-align:right;font-style:italic;border-top:1px solid #f1f5f9">${r.motivo}</td>
        </tr>` : ''}
      </table>

      ${itemsRows ? `
      <p style="margin:0 0 10px;font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:#94a3b8;font-weight:600">Ítems de la venta</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:28px">
        ${itemsRows}
      </table>` : ''}

      <a href="${btnAprobar}"
         style="display:block;background:#16a34a;color:#fff;text-align:center;padding:18px 24px;border-radius:12px;font-size:18px;font-weight:700;text-decoration:none;margin-bottom:12px">
        ✅&nbsp;&nbsp;Aprobar anulación
      </a>

      <a href="${btnRechazar}"
         style="display:block;background:#dc2626;color:#fff;text-align:center;padding:18px 24px;border-radius:12px;font-size:18px;font-weight:700;text-decoration:none">
        ❌&nbsp;&nbsp;Rechazar anulación
      </a>

      <p style="margin:20px 0 0;font-size:12px;color:#94a3b8;text-align:center;line-height:1.5">
        Cada botón funciona una sola vez.<br>Si ya fue resuelta, vas a ver un aviso.
      </p>
    </div>
  </div>
</body>
</html>`

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from:    'Almacén Gabriela <onboarding@resend.dev>',
        to:      [ADMIN_EMAIL],
        subject: `⚠️ Anulación pendiente — ${money(r.total)} · ${r.cajero}`,
        html:    emailHtml,
      }),
    })

    const resBody = await res.json()
    if (!res.ok) console.error('Resend error:', JSON.stringify(resBody))

    return new Response('ok', { status: 200 })
  }

  return new Response('método no permitido', { status: 405 })
})

// ─────────────────────────────────────────────────────────────────────────────

function pageHtml(emoji: string, mensaje: string, color: string): Response {
  const body = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Almacén Gabriela</title>
</head>
<body style="margin:0;display:flex;align-items:center;justify-content:center;min-height:100dvh;background:#f1f5f9;font-family:system-ui,sans-serif">
  <div style="text-align:center;padding:2.5rem 1.5rem;max-width:360px">
    <div style="font-size:5rem;margin-bottom:1.25rem;line-height:1">${emoji}</div>
    <h2 style="color:${color};font-size:1.25rem;font-weight:700;margin:0 0 .75rem;line-height:1.3">${mensaje}</h2>
    <p style="color:#64748b;font-size:.9375rem;margin:0">Podés cerrar esta ventana.</p>
  </div>
</body>
</html>`
  return new Response(body, { headers: { 'Content-Type': 'text/html;charset=utf-8' } })
}
