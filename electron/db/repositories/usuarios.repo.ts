import bcrypt from 'bcrypt'
import type Database from 'better-sqlite3'
import type { Usuario, UsuarioCreateInput, UsuarioUpdateInput } from '../../../shared/types/venta.types'

export type UsuariosRepo = ReturnType<typeof createUsuariosRepo>

const SELECT_PUBLIC = 'SELECT id, nombre, rol, activo, created_at FROM usuarios'

export function createUsuariosRepo(db: Database.Database) {
  const stmtListar   = db.prepare(`${SELECT_PUBLIC} WHERE activo = 1 ORDER BY rol = 'admin' DESC, nombre COLLATE NOCASE`)
  const stmtById     = db.prepare(`${SELECT_PUBLIC} WHERE id = ?`)
  const stmtByNombre = db.prepare('SELECT id FROM usuarios WHERE nombre = ? AND activo = 1')
  const stmtHashes   = db.prepare('SELECT id, pin_hash FROM usuarios WHERE activo = 1')
  const stmtInsert   = db.prepare(
    "INSERT INTO usuarios (nombre, pin_hash, rol, sync_status) VALUES (@nombre, @pin_hash, @rol, 'pending')",
  )

  // El login compara el PIN contra todos los usuarios: dos PIN iguales harían
  // ambiguo el inicio de sesión, así que se exige unicidad.
  function pinEnUso(pin: string, exceptId?: number): boolean {
    const filas = stmtHashes.all() as Array<{ id: number; pin_hash: string }>
    return filas.some((u) => u.id !== exceptId && bcrypt.compareSync(pin, u.pin_hash))
  }

  function validarPin(pin: string): void {
    if (!/^\d{4}$/.test(pin)) throw new Error('El PIN debe tener exactamente 4 dígitos')
  }

  return {
    listar(): Usuario[] {
      return stmtListar.all() as Usuario[]
    },

    crear(input: UsuarioCreateInput): Usuario {
      const nombre = input.nombre.trim()
      if (!nombre) throw new Error('El nombre es obligatorio')
      validarPin(input.pin)
      if (stmtByNombre.get(nombre)) throw new Error('Ya existe un usuario con ese nombre')
      if (pinEnUso(input.pin)) throw new Error('Ese PIN ya está en uso por otro usuario')

      const res = stmtInsert.run({
        nombre,
        pin_hash: bcrypt.hashSync(input.pin, 10),
        rol:      input.rol ?? 'cajero',
      })
      return stmtById.get(Number(res.lastInsertRowid)) as Usuario
    },

    actualizar(input: UsuarioUpdateInput): Usuario {
      const current = stmtById.get(input.id) as Usuario | undefined
      if (!current) throw new Error('Usuario no encontrado')

      const sets: string[] = []
      const params: Record<string, unknown> = { id: input.id }

      if (input.nombre != null) {
        const nombre = input.nombre.trim()
        if (!nombre) throw new Error('El nombre es obligatorio')
        const dup = stmtByNombre.get(nombre) as { id: number } | undefined
        if (dup && dup.id !== input.id) throw new Error('Ya existe un usuario con ese nombre')
        sets.push('nombre = @nombre')
        params.nombre = nombre
      }

      if (input.pin != null && input.pin !== '') {
        validarPin(input.pin)
        if (pinEnUso(input.pin, input.id)) throw new Error('Ese PIN ya está en uso por otro usuario')
        sets.push('pin_hash = @pin_hash')
        params.pin_hash = bcrypt.hashSync(input.pin, 10)
      }

      if (sets.length === 0) return current
      db.prepare(`UPDATE usuarios SET ${sets.join(', ')}, sync_status = 'pending' WHERE id = @id`).run(params)
      return stmtById.get(input.id) as Usuario
    },
  }
}
