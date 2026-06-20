import type Database from 'better-sqlite3'
import type { AppRole } from '../../../shared/types/app.types'

// Acceso a la tabla `config` (clave/valor). Guarda preferencias de la instalación,
// como el rol de esta PC (caja vs gestor) y el cursor de sincronización.
export type ConfigRepo = ReturnType<typeof createConfigRepo>

export function createConfigRepo(db: Database.Database) {
  const stmtGet = db.prepare('SELECT valor FROM config WHERE clave = ?')
  const stmtSet = db.prepare(`
    INSERT INTO config (clave, valor) VALUES (@clave, @valor)
    ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor
  `)

  function get(clave: string): string | null {
    const row = stmtGet.get(clave) as { valor: string } | undefined
    return row?.valor ?? null
  }

  function set(clave: string, valor: string): void {
    stmtSet.run({ clave, valor })
  }

  return {
    get,
    set,
    getRole(): AppRole {
      return get('app_role') === 'gestor' ? 'gestor' : 'caja'
    },
    setRole(role: AppRole): void {
      set('app_role', role)
    },
  }
}
