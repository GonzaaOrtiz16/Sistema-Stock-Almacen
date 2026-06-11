// Importa el inventario real desde el Excel y limpia datos de prueba.
// Uso: node scripts/importar-inventario.js
// Requiere que el archivo inventario_consolidado.xlsx esté en Descargas.

const path = require('path')
const fs   = require('fs')
const XLSX = require('xlsx')
const Database = require('better-sqlite3')

const EXCEL_PATH = path.join(
  process.env.USERPROFILE || process.env.HOME,
  'Downloads',
  'inventario_consolidado.xlsx',
)

const DB_PATHS = [
  path.join(process.env.APPDATA, 'almacen-gabriela', 'gabriela-dev.db'),
  path.join(process.env.APPDATA, 'almacen-gabriela', 'gabriela.db'),
]

// ── Leer Excel ───────────────────────────────────────────────────────────────

if (!fs.existsSync(EXCEL_PATH)) {
  console.error(`❌  No se encontró el archivo: ${EXCEL_PATH}`)
  process.exit(1)
}

console.log(`📂  Leyendo: ${EXCEL_PATH}`)
const wb   = XLSX.readFile(EXCEL_PATH)
const ws   = wb.Sheets[wb.SheetNames[0]]
const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }).slice(1) // saltar encabezado

// Columnas: 0=barcode, 1=nombre, 2=precio
const productos = rows
  .filter(r => r[1] && String(r[1]).trim() !== '')
  .map(r => ({
    barcode: r[0] ? String(r[0]).trim() : null,
    nombre:  String(r[1]).trim(),
    precio:  (r[2] && Number(r[2]) > 0) ? Number(r[2]) : 0,
  }))

console.log(`📦  Productos encontrados: ${productos.length}`)
console.log(`    Con precio: ${productos.filter(p => p.precio > 0).length}`)
console.log(`    Sin precio: ${productos.filter(p => p.precio === 0).length}`)

// ── Importar en cada base de datos ───────────────────────────────────────────

for (const dbPath of DB_PATHS) {
  if (!fs.existsSync(dbPath)) {
    console.log(`\n⚠   No existe (se omite): ${path.basename(dbPath)}`)
    continue
  }

  console.log(`\n🗄   Procesando: ${path.basename(dbPath)}`)
  const db = new Database(dbPath)

  db.transaction(() => {
    // Limpiar datos de prueba (mantener usuarios y configuración)
    db.prepare('DELETE FROM ventas_detalle').run()
    db.prepare('DELETE FROM ventas').run()
    db.prepare('DELETE FROM turnos').run()
    db.prepare('DELETE FROM productos').run()
    db.prepare('DELETE FROM categorias').run()
    console.log('    ✓ Datos de prueba eliminados')

    // Importar productos
    const insert = db.prepare(`
      INSERT INTO productos
        (codigo_barras, nombre, precio_venta, precio_costo, stock_actual, stock_minimo, unidad, categoria_id)
      VALUES
        (@barcode, @nombre, @precio, NULL, 0, 0, 'unidad', NULL)
    `)

    let importados = 0
    for (const p of productos) {
      try {
        insert.run({ barcode: p.barcode, nombre: p.nombre, precio: p.precio })
        importados++
      } catch (e) {
        // Si hay barcode duplicado, importar de todas formas sin barcode
        if (e.message && e.message.includes('UNIQUE')) {
          insert.run({ barcode: null, nombre: p.nombre, precio: p.precio })
          importados++
        }
      }
    }
    console.log(`    ✓ ${importados} productos importados`)
  })()

  db.close()
}

console.log('\n✅  Importación completada.')
