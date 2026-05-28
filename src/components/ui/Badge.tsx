interface Props {
  variant: 'success' | 'error' | 'warning' | 'info' | 'pending' | 'neutral'
  children: React.ReactNode
}

export function Badge({ variant, children }: Props) {
  return <span className={`badge badge-${variant}`}>{children}</span>
}
