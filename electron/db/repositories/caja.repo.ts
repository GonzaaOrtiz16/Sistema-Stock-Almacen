import type Database from 'better-sqlite3'
import type {
  TurnoCaja,
  ResumenTurno,
  MetodoPago,
} from '../../../shared/types/venta.types'

// Solo para uso interno del proceso main — nunca enviar pin_hash al renderer
export interface UsuarioInterno {
  id: number
  nombre: string
  pin_hash: string
  rol: string
  activo: number
  created_at: string
}

export type CajaRepo = ReturnType<typeof createCajaRepo>

export function createCajaRepo(db: Database.Database) {
  const stmtAbrirTurno = db.prepare(`
    INSERT INTO turnos_caja (usuario_id, monto_apertura)
    VALUES (@usuario_id, @monto_apertura)
  `)

  const stmtCerrarTurno = db.prepare(`
    UPDATE turnos_caja
    SET cierre_ts      = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
        monto_cierre   = @monto_cierre,
        estado         = 'cerrado',
        observaciones  = @observaciones,
        sync_status    = 'pending'
    WHERE id = @id
  `)

  const stmtGetTurno = db.prepare('SELECT * FROM turnos_caja WHERE id = ?')

  const stmtTurnoActivo = db.prepare(`
    SELECT * FROM turnos_caja
    WHERE usuario_id = ? AND estado = 'abierto'
    ORDER BY apertura_ts DESC
    LIMIT 1
  `)

  const stmtTotales = db.prepare(`
    SELECT
      COUNT(*)           AS cantidad_ventas,
      COALESCE(SUM(total), 0) AS total_ventas
    FROM ventas
    WHERE turno_id = ? AND estado = 'completada'
  `)

  const stmtPorMetodo = db.prepare(`
    SELECT metodo_pago, COALESCE(SUM(total), 0) AS total
    FROM ventas
    WHERE turno_id = ? AND estado = 'completada'
    GROUP BY metodo_pago
  `)

  const stmtUsuariosActivos = db.prepare(
    'SELECT id, nombre, pin_hash, rol, activo, created_at FROM usuarios WHERE activo = 1',
  )

  return {
    abrirTurno(usuario_id: number, monto_apertura: number): TurnoCaja {
      const res = stmtAbrirTurno.run({ usuario_id, monto_apertura })
      return stmtGetTurno.get(Number(res.lastInsertRowid)) as TurnoCaja
    },

    cerrarTurno(turno_id: number, monto_cierre: number, observaciones?: string): TurnoCaja {
      const turno = stmtGetTurno.get(turno_id) as TurnoCaja | undefined
      if (!turno) throw new Error(`Turno ${turno_id} no encontrado`)
      if (turno.estado === 'cerrado') throw new Error('El turno ya está cerrado')

      stmtCerrarTurno.run({ id: turno_id, monto_cierre, observaciones: observaciones ?? null })
      return stmtGetTurno.get(turno_id) as TurnoCaja
    },

    turnoActivo(usuario_id: number): TurnoCaja | null {
      return (stmtTurnoActivo.get(usuario_id) as TurnoCaja | undefined) ?? null
    },

    resumenTurno(turno_id: number): ResumenTurno {
      const turno = stmtGetTurno.get(turno_id) as TurnoCaja | undefined
      if (!turno) throw new Error(`Turno ${turno_id} no encontrado`)

      const totals = stmtTotales.get(turno_id) as {
        cantidad_ventas: number
        total_ventas: number
      }

      const rows = stmtPorMetodo.all(turno_id) as Array<{
        metodo_pago: string
        total: number
      }>

      const por_metodo: Record<MetodoPago, number> = {
        efectivo: 0, debito: 0, credito: 0, qr: 0, mixto: 0,
      }
      for (const row of rows) {
        por_metodo[row.metodo_pago as MetodoPago] = row.total
      }

      const efectivo_esperado = turno.monto_apertura + por_metodo.efectivo
      const diferencia_caja   =
        turno.monto_cierre != null ? turno.monto_cierre - efectivo_esperado : 0

      return {
        turno_id,
        total_ventas:    totals.total_ventas,
        cantidad_ventas: totals.cantidad_ventas,
        por_metodo,
        diferencia_caja,
      }
    },

    listarUsuariosActivos(): UsuarioInterno[] {
      return stmtUsuariosActivos.all() as UsuarioInterno[]
    },
  }
}
