// Búsqueda inteligente del inventario (client-side, sobre la lista ya cargada).
// Réplica del buscador de la caja (productos.repo.buscarPorNombre):
//  · tolera acentos y mayúsculas ("limon" encuentra "Limón")
//  · acepta varias palabras en cualquier orden ("coca grande" → "Coca Cola Grande")
//  · cada palabra puede coincidir con el nombre o con el código de barras
//  · ordena por relevancia (exacto › empieza › palabra › contiene) y entre
//    iguales prioriza los que tienen stock.

const normalizar = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

interface Buscable {
  nombre: string
  codigo_barras: string | null
  stock_actual: number
}

export function buscarProductos<T extends Buscable>(items: T[], query: string): T[] {
  const full = normalizar(query.trim())
  if (!full) return items

  const tokens = full.split(/\s+/).filter(Boolean).slice(0, 6)
  if (tokens.length === 0) return items

  const scored: Array<{ item: T; rank: number }> = []

  for (const item of items) {
    const nombre = normalizar(item.nombre)
    const codigo = (item.codigo_barras ?? '').toLowerCase()

    // Cada token debe aparecer en el nombre (sin acentos) o en el código.
    const matchAll = tokens.every((t) => nombre.includes(t) || codigo.includes(t))
    if (!matchAll) continue

    let rank: number
    if (nombre === full || codigo === full) rank = 0
    else if (nombre.startsWith(full) || codigo.startsWith(full)) rank = 1
    else if (tokens.every((t) => new RegExp(`(^|\\s)${escapeRegExp(t)}`).test(nombre))) rank = 2
    else rank = 3

    scored.push({ item, rank })
  }

  scored.sort((a, b) =>
    a.rank - b.rank ||
    (Number(a.item.stock_actual <= 0) - Number(b.item.stock_actual <= 0)) ||
    a.item.nombre.localeCompare(b.item.nombre, 'es'),
  )

  return scored.map((s) => s.item)
}
