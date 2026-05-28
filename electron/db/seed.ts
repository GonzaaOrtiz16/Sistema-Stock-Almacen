import bcrypt from 'bcrypt'
import type Database from 'better-sqlite3'
import log from '../utils/logger'

export function seedIfEmpty(db: Database.Database): void {
  seedUsuarios(db)
  seedProductos(db)
}

function seedUsuarios(db: Database.Database): void {
  const usuarios: Array<{ nombre: string; pin: string; rol: string }> = [
    { nombre: 'Admin',    pin: '1234', rol: 'admin'  },
    { nombre: 'Gabriela', pin: '5678', rol: 'cajero' },
  ]

  const exists  = db.prepare('SELECT id FROM usuarios WHERE nombre = ?')
  const insert  = db.prepare("INSERT INTO usuarios (nombre, pin_hash, rol) VALUES (?, ?, ?)")

  for (const u of usuarios) {
    if (exists.get(u.nombre)) continue          // ya existe, no tocar
    insert.run(u.nombre, bcrypt.hashSync(u.pin, 10), u.rol)
    log.info(`[Seed] Usuario "${u.nombre}" creado (${u.rol}) PIN: ${u.pin}`)
  }
}

function seedProductos(db: Database.Database): void {
  const { count } = db
    .prepare('SELECT COUNT(*) AS count FROM productos')
    .get() as { count: number }

  if (count > 0) return

  // Categorías
  const cats = [
    'Lácteos', 'Bebidas', 'Panadería', 'Almacén', 'Limpieza', 'Fiambres',
  ]
  const insertCat = db.prepare(
    "INSERT INTO categorias (nombre) VALUES (?)",
  )
  for (const c of cats) insertCat.run(c)

  const catId = (nombre: string): number =>
    (db.prepare('SELECT id FROM categorias WHERE nombre = ?').get(nombre) as { id: number }).id

  // Productos de prueba
  const productos = [
    // Lácteos
    { barcode: '7790895000084', nombre: 'Leche entera La Serenísima 1L',   venta: 1350, costo: 950,  stock: 24, unidad: 'unidad', cat: 'Lácteos' },
    { barcode: '7790895001234', nombre: 'Yogur entero Ser frutilla 190g',   venta: 620,  costo: 440,  stock: 12, unidad: 'unidad', cat: 'Lácteos' },
    { barcode: '7798082600034', nombre: 'Queso cremoso Casancrem 200g',     venta: 1850, costo: 1300, stock: 8,  unidad: 'unidad', cat: 'Lácteos' },
    { barcode: '7790070100024', nombre: 'Manteca La Paulina 200g',          venta: 1100, costo: 780,  stock: 10, unidad: 'unidad', cat: 'Lácteos' },

    // Bebidas
    { barcode: '7790327000017', nombre: 'Coca-Cola 2.25L',                  venta: 1800, costo: 1250, stock: 30, unidad: 'unidad', cat: 'Bebidas' },
    { barcode: '7790327100023', nombre: 'Sprite 1.5L',                      venta: 1450, costo: 1000, stock: 20, unidad: 'unidad', cat: 'Bebidas' },
    { barcode: '7791337000029', nombre: 'Agua Villavicencio 1.5L',          venta: 950,  costo: 620,  stock: 36, unidad: 'unidad', cat: 'Bebidas' },
    { barcode: '7790040001012', nombre: 'Jugo Cepita del Valle naranja 1L', venta: 1200, costo: 820,  stock: 18, unidad: 'unidad', cat: 'Bebidas' },

    // Panadería
    { barcode: '7790040200045', nombre: 'Pan lactal Bimbo 500g',            venta: 1650, costo: 1150, stock: 15, unidad: 'unidad', cat: 'Panadería' },
    { barcode: '7790040200052', nombre: 'Galletitas Oreo 117g',             venta: 980,  costo: 680,  stock: 20, unidad: 'unidad', cat: 'Panadería' },
    { barcode: '7790380010019', nombre: 'Facturas (unidad)',                 venta: 350,  costo: 200,  stock: 30, unidad: 'unidad', cat: 'Panadería' },

    // Almacén
    { barcode: '7790040000037', nombre: 'Fideos Matarazzo tallarin 500g',   venta: 950,  costo: 660,  stock: 25, unidad: 'unidad', cat: 'Almacén' },
    { barcode: '7790040000068', nombre: 'Arroz Lucchetti largo fino 1kg',   venta: 1400, costo: 980,  stock: 20, unidad: 'unidad', cat: 'Almacén' },
    { barcode: '7790970010029', nombre: 'Aceite Cañuelas girasol 1.5L',     venta: 3200, costo: 2200, stock: 12, unidad: 'unidad', cat: 'Almacén' },
    { barcode: '7790285010038', nombre: 'Azúcar Ledesma 1kg',               venta: 1100, costo: 760,  stock: 18, unidad: 'unidad', cat: 'Almacén' },
    { barcode: '7790040000082', nombre: 'Sal Celusal fina 500g',            venta: 450,  costo: 300,  stock: 30, unidad: 'unidad', cat: 'Almacén' },
    { barcode: '7790040000099', nombre: 'Tomate triturado La Campagnola 400g', venta: 680, costo: 470, stock: 22, unidad: 'unidad', cat: 'Almacén' },

    // Fiambres (vendidos por kg)
    { barcode: null, nombre: 'Jamón cocido (kg)',     venta: 8500, costo: 6000, stock: 5,  unidad: 'kg',    cat: 'Fiambres' },
    { barcode: null, nombre: 'Salame (kg)',            venta: 9800, costo: 7000, stock: 3,  unidad: 'kg',    cat: 'Fiambres' },
    { barcode: null, nombre: 'Queso pategrás (kg)',   venta: 11000, costo: 7800, stock: 4,  unidad: 'kg',    cat: 'Fiambres' },

    // Limpieza
    { barcode: '7790338001020', nombre: 'Detergente Magistral limón 750ml', venta: 1250, costo: 860,  stock: 14, unidad: 'unidad', cat: 'Limpieza' },
    { barcode: '7790338002030', nombre: 'Lavandina Ayudín 1L',              venta: 980,  costo: 670,  stock: 16, unidad: 'unidad', cat: 'Limpieza' },
    { barcode: '7790040003010', nombre: 'Papel higiénico Higienol x4',      venta: 1800, costo: 1250, stock: 20, unidad: 'unidad', cat: 'Limpieza' },
  ]

  const insertProd = db.prepare(`
    INSERT INTO productos
      (codigo_barras, nombre, precio_venta, precio_costo, stock_actual, stock_minimo, unidad, categoria_id)
    VALUES
      (@barcode, @nombre, @venta, @costo, @stock, @minimo, @unidad, @catId)
  `)

  const seedAll = db.transaction(() => {
    for (const p of productos) {
      insertProd.run({
        barcode: p.barcode ?? null,
        nombre:  p.nombre,
        venta:   p.venta,
        costo:   p.costo,
        stock:   p.stock,
        minimo:  Math.floor(p.stock * 0.2),
        unidad:  p.unidad,
        catId:   catId(p.cat),
      })
    }
  })

  seedAll()
  log.info(`[Seed] ${productos.length} productos de prueba insertados`)
}
