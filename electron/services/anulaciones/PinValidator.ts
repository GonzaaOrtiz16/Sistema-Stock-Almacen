import bcrypt from 'bcrypt'
import { getDb } from '../../db/client'
import { PIN_LOCKOUT_ATTEMPTS, PIN_LOCKOUT_DURATION_MS } from '../../../shared/constants'

interface AttemptEntry {
  count: number
  lastAttempt: number
}

// Estado de intentos en memoria — se reinicia con la app (aceptable para este caso)
const attempts = new Map<number, AttemptEntry>()

export async function validateAdminPin(pin: string): Promise<boolean> {
  const db = getDb()
  const admins = db
    .prepare("SELECT pin_hash FROM usuarios WHERE rol IN ('admin','supervisor') AND activo = 1")
    .all() as Array<{ pin_hash: string }>

  for (const admin of admins) {
    if (await bcrypt.compare(pin, admin.pin_hash)) return true
  }
  return false
}

export interface LockoutStatus {
  locked: boolean
  remainingMs: number
  attemptsLeft: number
}

export function getLockoutStatus(ventaId: number): LockoutStatus {
  const entry = attempts.get(ventaId)
  if (!entry) return { locked: false, remainingMs: 0, attemptsLeft: PIN_LOCKOUT_ATTEMPTS }

  if (entry.count >= PIN_LOCKOUT_ATTEMPTS) {
    const elapsed = Date.now() - entry.lastAttempt
    if (elapsed < PIN_LOCKOUT_DURATION_MS) {
      return { locked: true, remainingMs: PIN_LOCKOUT_DURATION_MS - elapsed, attemptsLeft: 0 }
    }
    attempts.delete(ventaId)
    return { locked: false, remainingMs: 0, attemptsLeft: PIN_LOCKOUT_ATTEMPTS }
  }

  return {
    locked: false,
    remainingMs: 0,
    attemptsLeft: PIN_LOCKOUT_ATTEMPTS - entry.count,
  }
}

export function recordFailedAttempt(ventaId: number): LockoutStatus {
  const entry = attempts.get(ventaId) ?? { count: 0, lastAttempt: 0 }
  entry.count++
  entry.lastAttempt = Date.now()
  attempts.set(ventaId, entry)
  return getLockoutStatus(ventaId)
}

export function clearAttempts(ventaId: number): void {
  attempts.delete(ventaId)
}
