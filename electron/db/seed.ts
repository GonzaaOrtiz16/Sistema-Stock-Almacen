import bcrypt from 'bcrypt'
import type Database from 'better-sqlite3'
import log from '../utils/logger'

export function seedIfEmpty(db: Database.Database): void {
  seedUsuarios(db)
}

function seedUsuarios(db: Database.Database): void {
  const usuarios: Array<{ nombre: string; pin: string; rol: string }> = [
    { nombre: 'Admin',    pin: '1234', rol: 'admin'  },
    { nombre: 'Gabriela', pin: '5678', rol: 'cajero' },
  ]

  const exists  = db.prepare('SELECT id FROM usuarios WHERE nombre = ?')
  const insert  = db.prepare("INSERT INTO usuarios (nombre, pin_hash, rol) VALUES (?, ?, ?)")

  for (const u of usuarios) {
    if (exists.get(u.nombre)) continue
    insert.run(u.nombre, bcrypt.hashSync(u.pin, 10), u.rol)
    log.info(`[Seed] Usuario "${u.nombre}" creado (${u.rol}) PIN: ${u.pin}`)
  }
}
