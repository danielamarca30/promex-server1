import { mysqlTable, varchar, text, datetime, int, mysqlEnum, index, uniqueIndex, boolean, timestamp, decimal,json } from 'drizzle-orm/mysql-core';

// Enums
export const estadoFichaEnum = mysqlEnum('estado_ficha', ['Pendiente', 'Llamado', 'En_Atencion', 'Atendido', 'Cancelado', 'No_Presentado']);
export const categoriaServicioEnum = mysqlEnum('categoria_servicio', ['Caja', 'Ejecutivo']);
export const subCategoriaEjecutivoEnum = mysqlEnum('sub_categoria_ejecutivo', ['Liquidacion', 'Anticipo', 'Transporte']);
export const estadoEmpleadoEnum = mysqlEnum('estado_empleado', ['Disponible', 'Ocupado']);
export const tipoNotificacionEnum = mysqlEnum('tipo_notificacion', ['Nueva_Ficha', 'Cambio_Estado', 'Alerta_Capacidad', 'Mensaje_Sistema']);

// Tablas
export const rol = mysqlTable('rol', {
  id: varchar('id', { length: 36 }).primaryKey(),
  nombre: varchar('nombre', { length: 50 }).notNull(),
  descripcion: text('descripcion'),
  permisos: json('permisos').notNull(),
}, (table) => ({
  nombreIndex: uniqueIndex('nombre_idx').on(table.nombre),
}));

export const empleado = mysqlTable('empleado', {
  id: varchar('id', { length: 36 }).primaryKey(),
  nombres: varchar('nombres', { length: 100 }).notNull(),
  apellidos: varchar('apellidos', { length: 100 }).notNull(),
  estado: estadoEmpleadoEnum.notNull().default('Disponible'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
}, (table) => ({
  estadoIndex: index('estado_idx').on(table.estado),
}));

export const usuario = mysqlTable('usuario', {
  id: varchar('id', { length: 36 }).primaryKey(),
  username: varchar('username', { length: 50 }).notNull(),
  password: varchar('password', { length: 255 }).notNull(),
  email: varchar('email', { length: 100 }),
  rolId: varchar('rol_id', { length: 36 }).notNull().references(() => rol.id),
  empleadoId: varchar('empleado_id', { length: 36 }).notNull().references(() => empleado.id),
  activo: boolean('activo').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
}, (table) => ({
  usernameIndex: uniqueIndex('username_idx').on(table.username),
  emailIndex: index('email_idx').on(table.email),
  rolIndex: index('rol_idx').on(table.rolId),
  empleadoIndex: index('empleado_idx').on(table.empleadoId),
}));

export const puntoAtencion = mysqlTable('punto_atencion', {
  id: varchar('id', { length: 36 }).primaryKey(),
  nombre: varchar('nombre', { length: 50 }).notNull(),
  categoriaId: varchar('categoria_id', { length: 36 }).notNull().references(() => categoriaServicio.id),
  empleadoId: varchar('empleado_id', { length: 36 }).references(() => empleado.id),
  activo: boolean('activo').notNull().default(true),
}, (table) => ({
  nombreIndex: uniqueIndex('nombre_idx').on(table.nombre),
  categoriaIndex: index('categoria_idx').on(table.categoriaId),
  empleadoIndex: index('empleado_idx').on(table.empleadoId),
}));

// New tables for categories and subcategories
export const categoriaServicio = mysqlTable('categoria_servicio', {
  id: varchar('id', { length: 36 }).primaryKey(),
  nombre: varchar('nombre', { length: 50 }).notNull(),
  descripcion: text('descripcion'),
}, (table) => ({
  nombreIndex: uniqueIndex('nombre_idx').on(table.nombre),
}));

export const subCategoriaServicio = mysqlTable('sub_categoria_servicio', {
  id: varchar('id', { length: 36 }).primaryKey(),
  nombre: varchar('nombre', { length: 50 }).notNull(),
  descripcion: text('descripcion'),
  categoriaId: varchar('categoria_id', { length: 36 }).notNull().references(() => categoriaServicio.id),
}, (table) => ({
  nombreIndex: uniqueIndex('nombre_idx').on(table.nombre),
  categoriaIndex: index('categoria_idx').on(table.categoriaId),
}));

// Modified servicio table
export const servicio = mysqlTable('servicio', {
  id: varchar('id', { length: 36 }).primaryKey(),
  nombre: varchar('nombre', { length: 100 }).notNull(),
  prioridad: int('prioridad').notNull(),
  descripcion: text('descripcion'),
  categoriaId: varchar('categoria_id', { length: 36 }).notNull().references(() => categoriaServicio.id),
  subCategoriaId: varchar('sub_categoria_id', { length: 36 }).references(() => subCategoriaServicio.id),
  tiempoEstimado: int('tiempo_estimado').notNull(), // en minutos
  activo: boolean('activo').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
}, (table) => ({
  nombreIndex: uniqueIndex('nombre_idx').on(table.nombre),
  categoriaIndex: index('categoria_idx').on(table.categoriaId),
  subCategoriaIndex: index('sub_categoria_idx').on(table.subCategoriaId),
}));

export const ficha = mysqlTable('ficha', {
  id: varchar('id', { length: 36 }).primaryKey(),
  codigo: varchar('codigo', { length: 20 }).notNull(),
  estado: estadoFichaEnum.notNull().default('Pendiente'),
  servicioId: varchar('servicio_id', { length: 36 }).notNull().references(() => servicio.id),
  empleadoId: varchar('empleado_id', { length: 36 }).references(() => empleado.id),
  puntoAtencionId: varchar('punto_atencion_id', { length: 36 }).references(() => puntoAtencion.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
}, (table) => ({
  codigoIndex: index('codigo_idx').on(table.codigo),
  estadoIndex: index('estado_idx').on(table.estado),
  servicioIndex: index('servicio_idx').on(table.servicioId),
  empleadoIndex: index('empleado_idx').on(table.empleadoId),
  puntoAtencionIndex: index('punto_atencion_idx').on(table.puntoAtencionId),
}));

export const atencion = mysqlTable('atencion', {
  id: varchar('id', { length: 36 }).primaryKey(),
  fichaId: varchar('ficha_id', { length: 36 }).notNull().references(() => ficha.id),
  empleadoId: varchar('empleado_id', { length: 36 }).notNull().references(() => empleado.id),
  inicioAtencion: timestamp('inicio_atencion').notNull(),
  finAtencion: timestamp('fin_atencion'),
  resultado: text('resultado'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
}, (table) => ({
  fichaIndex: index('ficha_idx').on(table.fichaId),
  empleadoIndex: index('empleado_idx').on(table.empleadoId),
  inicioAtencionIndex: index('inicio_atencion_idx').on(table.inicioAtencion),
}));

export const metricaTiempoReal = mysqlTable('metrica_tiempo_real', {
  id: varchar('id', { length: 36 }).primaryKey(),
  servicioId: varchar('servicio_id', { length: 36 }).notNull().references(() => servicio.id),
  puntoAtencionId: varchar('punto_atencion_id', { length: 36 }).notNull().references(() => puntoAtencion.id),
  tiempoEsperaPromedio: int('tiempo_espera_promedio').notNull(),
  tiempoAtencionPromedio: int('tiempo_atencion_promedio').notNull(),
  cantidadEnEspera: int('cantidad_en_espera').notNull(),
  cantidadAtendidos: int('cantidad_atendidos').notNull(),
  version: int('version').notNull(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
}, (table) => ({
  servicioIndex: index('servicio_idx').on(table.servicioId),
  puntoAtencionIndex: index('punto_atencion_idx').on(table.puntoAtencionId),
  versionIndex: index('version_idx').on(table.version),
}));


export const videos = mysqlTable('videos', {
  id: varchar('id', { length: 36 }).primaryKey(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  filePath: varchar('file_path', { length: 255 }).notNull(),
  active: boolean('active').notNull().default(true),
  usuarioId:varchar('usuario_id',{length:36}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
});
export const cotizaciones=mysqlTable('cotizaciones',{
    id: varchar('id', { length: 36 }).primaryKey(),
    mineral: varchar('mineral', { length: 255 }).notNull(),
    cotizacion: decimal('cotizacion', { precision: 10, scale: 2 }).notNull(),
    unidad:varchar('unidad',{length:5}).notNull(),
    fecha:timestamp('fecha').notNull().defaultNow(),
    active: boolean('active').notNull().default(true),
    usuarioId:varchar('usuario_id',{length:36}).notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
});
export const comunicados=mysqlTable('comunicados',{
    id: varchar('id', { length: 36 }).primaryKey(),
    comunicado: text('comunicado').notNull(),
    descripcion: text('descripcion').notNull(),
    active: boolean('active').notNull().default(true),
    usuarioId:varchar('usuario_id',{length:36}).notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
});