interface Props {
  size?: 'sm' | 'md' | 'lg'
}

const SIZE = { sm: 16, md: 28, lg: 40 } as const

export function Spinner({ size = 'md' }: Props) {
  const px = SIZE[size]
  return (
    <span
      className="spinner"
      style={{ width: px, height: px, borderWidth: size === 'sm' ? 2 : 3 }}
      role="status"
      aria-label="Cargando"
    />
  )
}
