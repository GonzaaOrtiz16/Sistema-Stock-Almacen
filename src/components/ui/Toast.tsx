import { createContext, useCallback, useContext, useState } from 'react'

type ToastType = 'success' | 'error' | 'info' | 'warning'

interface ToastItem {
  id: number
  message: string
  type: ToastType
}

interface ToastCtx {
  show: (message: string, type?: ToastType) => void
}

const Context = createContext<ToastCtx | null>(null)
let _id = 0

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const show = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++_id
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 2600)
  }, [])

  return (
    <Context.Provider value={{ show }}>
      {children}
      <div className="toast-container" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>{t.message}</div>
        ))}
      </div>
    </Context.Provider>
  )
}

export function useToast(): ToastCtx {
  const ctx = useContext(Context)
  if (!ctx) throw new Error('useToast requires <ToastProvider>')
  return ctx
}
