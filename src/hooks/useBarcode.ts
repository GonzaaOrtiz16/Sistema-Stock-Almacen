import { useEffect, useRef } from 'react'
import { BARCODE_MIN_CHARS, BARCODE_MAX_CHARS, BARCODE_DEBOUNCE_MS } from '@shared/constants'

/**
 * Listener global del escáner de código de barras.
 *
 * Los escáneres simulan tipeo ultra-rápido (< BARCODE_DEBOUNCE_MS entre teclas)
 * terminado con Enter. Este hook captura esa secuencia sin importar qué elemento
 * tenga el foco, y llama a onScan con el código completo.
 *
 * Caracteres que llegan más lentos que BARCODE_DEBOUNCE_MS reinician el buffer,
 * por lo que el tipeo humano normal nunca dispara el callback.
 */
export function useBarcode(onScan: (barcode: string) => void): void {
  const bufferRef  = useRef('')
  const lastKeyRef = useRef(0)
  const onScanRef  = useRef(onScan)
  onScanRef.current = onScan          // siempre fresco, sin cambiar la referencia del effect

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      const now = Date.now()

      if (e.key === 'Enter') {
        const code = bufferRef.current
        bufferRef.current = ''
        lastKeyRef.current = 0
        if (code.length >= BARCODE_MIN_CHARS && code.length <= BARCODE_MAX_CHARS) {
          onScanRef.current(code)
        }
        return
      }

      if (e.key.length !== 1) return  // ignora Shift, Ctrl, ArrowLeft, etc.

      // Teclas que llegan muy separadas = tipeo humano → resetear buffer
      if (now - lastKeyRef.current > BARCODE_DEBOUNCE_MS && bufferRef.current.length > 0) {
        bufferRef.current = ''
      }

      bufferRef.current += e.key
      lastKeyRef.current = now
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])  // onScanRef mantiene el callback actualizado sin re-registrar el listener
}
