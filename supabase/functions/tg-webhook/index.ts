// Edge Function: tg-webhook
// Telegram llama a este endpoint cuando el admin toca un botón inline
// Actualiza el estado en Supabase y confirma la acción en el chat

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BOT_TOKEN  = Deno.env.get('TELEGRAM_BOT_TOKEN')!
const SB_URL     = Deno.env.get('SUPABASE_URL')!
const SB_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const tgApi = (method: string, body: object) =>
  fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

Deno.serve(async (req) => {
  try {
    const body = await req.json()

    // Solo procesar callback_query (toque de botón inline)
    const cb = body.callback_query
    if (!cb) return new Response('ok', { status: 200 })

    const [accion, id] = (cb.data as string).split(':')
    const estado  = accion === 'aprobar' ? 'aprobada' : 'rechazada'
    const emoji   = estado === 'aprobada' ? '✅' : '❌'
    const texto   = estado === 'aprobada' ? 'Anulación APROBADA' : 'Anulación RECHAZADA'

    // Actualizar estado en Supabase (solo si aún está pendiente)
    const sb = createClient(SB_URL, SB_SERVICE)
    const { error } = await sb.from('anulaciones').update({ estado }).eq('id', id).eq('estado', 'pendiente')

    if (error) {
      await tgApi('answerCallbackQuery', {
        callback_query_id: cb.id,
        text: '⚠️ Error al guardar. Intentá de nuevo.',
        show_alert: true,
      })
      return new Response('db_error', { status: 200 })
    }

    // Quitar los botones del mensaje original
    await tgApi('editMessageReplyMarkup', {
      chat_id:    cb.message.chat.id,
      message_id: cb.message.message_id,
      reply_markup: { inline_keyboard: [] },
    })

    // Agregar confirmación debajo del mensaje
    await tgApi('sendMessage', {
      chat_id:    cb.message.chat.id,
      text:       `${emoji} *${texto}*`,
      parse_mode: 'Markdown',
      reply_to_message_id: cb.message.message_id,
    })

    // Confirmar al sistema de Telegram (quita el "loading" del botón)
    await tgApi('answerCallbackQuery', {
      callback_query_id: cb.id,
      text: `${emoji} ${estado.charAt(0).toUpperCase() + estado.slice(1)}`,
    })

    return new Response('ok', { status: 200 })
  } catch (e) {
    console.error(e)
    return new Response('error', { status: 500 })
  }
})
