// Rol de esta instalación de la app.
//  · 'caja'   → PC dueña del catálogo y del stock; vende y ejecuta las órdenes.
//  · 'gestor' → PC remota; SOLO agrega productos y carga stock (no vende).
export type AppRole = 'caja' | 'gestor'
