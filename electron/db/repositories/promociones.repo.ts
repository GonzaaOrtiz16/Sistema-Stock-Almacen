import type Database from 'better-sqlite3'
import type {
  Promocion,
  PromocionItem,
  PromocionCreateInput,
  PromocionUpdateInput,
} from '../../../shared/types/promocion.types'

export type PromocionesRepo = ReturnType<typeof createPromocionesRepo>

export function createPromocionesRepo(db: Database.Database) {
  const stmtInsertPromo = db.prepare(`
    INSERT INTO promociones (nombre, precio, activa)
    VALUES (@nombre, @precio, @activa)
  `)
  const stmtUpdatePromo = db.prepare(`
    UPDATE promociones SET
      nombre      = @nombre,
      precio      = @precio,
      activa      = @activa,
      updated_at  = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
      sync_status = 'pending'
    WHERE id = @id
  `)
  const stmtDeletePromo  = db.prepare('DELETE FROM promociones WHERE id = ?')
  const stmtGetPromo     = db.prepare('SELECT * FROM promociones WHERE id = ?')
  const stmtAllPromos    = db.prepare('SELECT * FROM promociones ORDER BY nombre COLLATE NOCASE')
  const stmtActivePromos = db.prepare('SELECT * FROM promociones WHERE activa = 1 ORDER BY id')

  const stmtInsertItem = db.prepare(`
    INSERT INTO promocion_items (promocion_id, producto_id, cantidad)
    VALUES (@promocion_id, @producto_id, @cantidad)
  `)
  const stmtDeleteItems = db.prepare('DELETE FROM promocion_items WHERE promocion_id = ?')

  // Ítems de una promo, con nombre/código/precio del producto para la UI.
  const stmtItemsByPromo = db.prepare(`
    SELECT pi.producto_id, pi.cantidad,
           p.nombre, p.codigo_barras, p.precio_venta
    FROM promocion_items pi
    JOIN productos p ON p.id = pi.producto_id
    WHERE pi.promocion_id = ?
    ORDER BY pi.id
  `)

  function itemsDe(promocionId: number): PromocionItem[] {
    return stmtItemsByPromo.all(promocionId) as PromocionItem[]
  }

  function conItems(promo: Promocion): Promocion {
    return { ...promo, items: itemsDe(promo.id) }
  }

  const reemplazarItems = db.transaction((promocionId: number, items: PromocionCreateInput['items']) => {
    stmtDeleteItems.run(promocionId)
    for (const it of items) {
      stmtInsertItem.run({ promocion_id: promocionId, producto_id: it.producto_id, cantidad: it.cantidad })
    }
  })

  const txCrear = db.transaction((input: PromocionCreateInput): number => {
    const res = stmtInsertPromo.run({
      nombre: input.nombre,
      precio: input.precio,
      activa: input.activa === false ? 0 : 1,
    })
    const id = Number(res.lastInsertRowid)
    reemplazarItems(id, input.items)
    return id
  })

  const txActualizar = db.transaction((input: PromocionUpdateInput): void => {
    stmtUpdatePromo.run({
      id:     input.id,
      nombre: input.nombre,
      precio: input.precio,
      activa: input.activa === false ? 0 : 1,
    })
    reemplazarItems(input.id, input.items)
  })

  return {
    listar(): Promocion[] {
      return (stmtAllPromos.all() as Promocion[]).map(conItems)
    },

    listarActivas(): Promocion[] {
      return (stmtActivePromos.all() as Promocion[]).map(conItems)
    },

    obtener(id: number): Promocion | null {
      const promo = stmtGetPromo.get(id) as Promocion | undefined
      return promo ? conItems(promo) : null
    },

    crear(input: PromocionCreateInput): Promocion {
      const id = txCrear(input)
      return conItems(stmtGetPromo.get(id) as Promocion)
    },

    actualizar(input: PromocionUpdateInput): Promocion {
      const current = stmtGetPromo.get(input.id) as Promocion | undefined
      if (!current) throw new Error(`Promoción ${input.id} no encontrada`)
      txActualizar(input)
      return conItems(stmtGetPromo.get(input.id) as Promocion)
    },

    setActiva(id: number, activa: boolean): Promocion {
      const current = stmtGetPromo.get(id) as Promocion | undefined
      if (!current) throw new Error(`Promoción ${id} no encontrada`)
      db.prepare(
        `UPDATE promociones SET activa = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), sync_status = 'pending' WHERE id = ?`,
      ).run(activa ? 1 : 0, id)
      return conItems(stmtGetPromo.get(id) as Promocion)
    },

    eliminar(id: number): void {
      stmtDeleteItems.run(id)   // por si el cascade no está activo
      stmtDeletePromo.run(id)
    },
  }
}
