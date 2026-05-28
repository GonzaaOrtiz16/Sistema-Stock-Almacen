import { Spinner } from './Spinner'

type Variant = 'primary' | 'ghost' | 'danger' | 'confirm' | 'pay'
type Size    = 'sm' | 'md' | 'lg'

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  children: React.ReactNode
}

const CLASS: Record<Variant, string> = {
  primary: 'btn-primary',
  ghost:   'btn-ghost',
  danger:  'btn-danger',
  confirm: 'btn-confirm',
  pay:     'btn-pay',
}

export function Button({ variant = 'primary', size, loading, children, className, disabled, ...rest }: Props) {
  return (
    <button
      className={[CLASS[variant], size && `btn-${size}`, className].filter(Boolean).join(' ')}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Spinner size="sm" /> : children}
    </button>
  )
}
