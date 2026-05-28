interface Props extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
}

export function Input({ label, error, hint, id, className, ...rest }: Props) {
  const uid = id ?? label?.toLowerCase().replace(/\s+/g, '-')
  return (
    <div className="field-group">
      {label && <label className="form-label" htmlFor={uid}>{label}</label>}
      <input
        id={uid}
        className={`form-input${error ? ' input-error' : ''}${className ? ` ${className}` : ''}`}
        {...rest}
      />
      {error && <p className="error-msg">{error}</p>}
      {hint  && !error && <p className="input-hint">{hint}</p>}
    </div>
  )
}
