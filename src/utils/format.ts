const priceFormatter = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export const formatPrecio = (n: number): string => `$${priceFormatter.format(n)}`

export const formatFecha = (iso: string): string =>
  new Intl.DateTimeFormat('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))

export const formatHora = (iso: string): string =>
  new Intl.DateTimeFormat('es-AR', {
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))
