// Edge Function: notificar
// Se dispara via Database Webhook cuando se inserta una fila en `anulaciones`
// Envía mensaje de Telegram al admin con botones Aprobar / Rechazar

const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!
const CHAT_ID   = Deno.env.get('TELEGRAM_ADMIN_CHAT_ID')!

Deno.serve(async (req) => {
  try {
    const payload = await req.json()
    const r = payload.record   // registro insertado en anulaciones

    if (!r || r.estado !== 'pendiente') {
      return new Response('ignorado', { status: 200 })
    }

    const money = (n: number) =>
      '$ ' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2 })

    const hora = new Date(r.venta_ts).toLocaleString('es-AR', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })

    const metodo: Record<string, string> = {
      efectivo: 'Efectivo', debito: 'Débito', credito: 'Crédito', qr: 'QR', mixto: 'Mixto',
    }

    const items = (r.items ?? [])
      .map((it: { nombre: string; cantidad: number; subtotal: number }) =>
        `  • ${it.nombre} ×${it.cantidad} — ${money(it.subtotal)}`
      ).join('\n')

    const lineas = [
      `🏪 *Solicitud de anulación*`,
      ``,
      `👤 Cajero: ${r.cajero}`,
      `💰 Total: *${money(r.total)}*`,
      `💳 ${metodo[r.metodo_pago] ?? r.metodo_pago}  |  🕐 ${hora}`,
      items ? `\n📦 Ítems:\n${items}` : '',
      r.motivo ? `\n📝 _Motivo: ${r.motivo}_` : '',
    ].filter(Boolean).join('\n')

    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: lineas,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '✅ Aprobar',  callback_data: `aprobar:${r.id}`  },
            { text: '❌ Rechazar', callback_data: `rechazar:${r.id}` },
          ]],
        },
      }),
    })

    const tg = await res.json()
    if (!tg.ok) console.error('Telegram error:', JSON.stringify(tg))

    return new Response('ok', { status: 200 })
  } catch (e) {
    console.error(e)
    return new Response('error', { status: 500 })
  }
})
