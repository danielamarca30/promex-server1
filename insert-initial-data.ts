import { drizzle, MySql2Database } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import * as schema from './src/schema';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'sistema_colas',
  });

  const db: MySql2Database<typeof schema> = drizzle(connection, { schema, mode: 'default' });

  // Insertar roles
  const roles: Array<typeof schema.rol.$inferInsert> = [
    { id: uuidv4(), nombre: 'Administrador', descripcion: 'Control total del sistema', permisos: JSON.stringify(['gestionar_usuarios', 'gestionar_servicios', 'ver_reportes', 'configurar_sistema']) },
    { id: uuidv4(), nombre: 'Ejecutivo', descripcion: 'Atención de servicios ejecutivos', permisos: JSON.stringify(['atender_fichas', 'ver_cola_actual']) },
    { id: uuidv4(), nombre: 'Cajero', descripcion: 'Atención de servicios de caja', permisos: JSON.stringify(['atender_fichas', 'ver_cola_actual']) },
  ];

  for (const rol of roles) {
    await db.insert(schema.rol).values(rol);
  }

  // Insertar empleados
  const empleados: Array<typeof schema.empleado.$inferInsert> = [
    { id: uuidv4(), nombres: 'Admin', apellidos: 'Sistema', estado: 'Disponible' },
    { id: uuidv4(), nombres: 'Juan', apellidos: 'Pérez', estado: 'Disponible' },
    { id: uuidv4(), nombres: 'María', apellidos: 'González', estado: 'Disponible' },
  ];

  for (const empleado of empleados) {
    await db.insert(schema.empleado).values(empleado);
  }

  // Insertar usuarios
  const hashedPassword = await bcrypt.hash('admin123', 10);
  const usuarios: Array<typeof schema.usuario.$inferInsert> = [
    { id: uuidv4(), username: 'admin', password: hashedPassword, email: 'admin@example.com', rolId: roles[0].id, empleadoId: empleados[0].id, activo: true },
    { id: uuidv4(), username: 'ejecutivo', password: hashedPassword, email: 'ejecutivo@example.com', rolId: roles[1].id, empleadoId: empleados[1].id, activo: true },
    { id: uuidv4(), username: 'cajero', password: hashedPassword, email: 'cajero@example.com', rolId: roles[2].id, empleadoId: empleados[2].id, activo: true },
  ];

  for (const usuario of usuarios) {
    await db.insert(schema.usuario).values(usuario);
  }

  // Insertar categorías de servicio
  const categorias: Array<typeof schema.categoriaServicio.$inferInsert> = [
    { id: uuidv4(), nombre: 'Caja', descripcion: 'Servicios de caja' },
    { id: uuidv4(), nombre: 'Ejecutivo', descripcion: 'Servicios ejecutivos' },
  ];

  for (const categoria of categorias) {
    await db.insert(schema.categoriaServicio).values(categoria);
  }
  // Insertar subcategorías de servicio
  const subcategoriaCaja= uuidv4()
  await db.insert(schema.subCategoriaServicio).values({ id:subcategoriaCaja, nombre: 'Caja', descripcion: 'Servicio de caja', categoriaId: categorias[0].id });
  // Insertar subcategorías de servicio
  const subcategoriasEjecutivo: Array<typeof schema.subCategoriaServicio.$inferInsert> = [
    { id: uuidv4(), nombre: 'Liquidacion', descripcion: 'Servicio de liquidaciones', categoriaId: categorias[1].id },
    { id: uuidv4(), nombre: 'Anticipo', descripcion: 'Servicio de anticipos', categoriaId: categorias[1].id },
    { id: uuidv4(), nombre: 'Transporte', descripcion: 'Servicio relacionado con transporte', categoriaId: categorias[1].id },
  ];

  for (const subcategoria of subcategoriasEjecutivo) {
    await db.insert(schema.subCategoriaServicio).values(subcategoria);
  }

  // Insertar servicios
  const servicios: Array<typeof schema.servicio.$inferInsert> = [
    { id: uuidv4(), nombre: 'Atención en Caja', descripcion: 'Servicios generales de caja', categoriaId: categorias[0].id,subCategoriaId:subcategoriaCaja, tiempoEstimado: 10, activo: true },
    { id: uuidv4(), nombre: 'Liquidaciones', descripcion: 'Servicio de liquidaciones', categoriaId: categorias[1].id, subCategoriaId: subcategoriasEjecutivo[0].id, tiempoEstimado: 20, activo: true },
    { id: uuidv4(), nombre: 'Anticipo', descripcion: 'Servicio de anticipos', categoriaId: categorias[1].id, subCategoriaId: subcategoriasEjecutivo[1].id, tiempoEstimado: 15, activo: true },
    { id: uuidv4(), nombre: 'Transporte', descripcion: 'Servicio relacionado con transporte', categoriaId: categorias[1].id, subCategoriaId: subcategoriasEjecutivo[2].id, tiempoEstimado: 25, activo: true },
  ];

  for (const servicio of servicios) {
    await db.insert(schema.servicio).values(servicio);
  }

  // Insertar puntos de atención
  const puntosAtencion: Array<typeof schema.puntoAtencion.$inferInsert> = [
    { id: uuidv4(), nombre: 'Caja 1', categoriaId: categorias[0].id, empleadoId: empleados[2].id, activo: true },
    { id: uuidv4(), nombre: 'Ejecutivo 1', categoriaId: categorias[1].id, empleadoId: empleados[1].id, activo: true },
  ];

  for (const puntoAtencion of puntosAtencion) {
    await db.insert(schema.puntoAtencion).values(puntoAtencion);
  }

  // Insertar algunas fichas de ejemplo
  const fichas: Array<typeof schema.ficha.$inferInsert> = [
    { id: uuidv4(), codigo: 'C-001', estado: 'Pendiente', servicioId: servicios[0].id, puntoAtencionId: puntosAtencion[0].id },
    { id: uuidv4(), codigo: 'E-001', estado: 'Pendiente', servicioId: servicios[1].id, puntoAtencionId: puntosAtencion[1].id },
    { id: uuidv4(), codigo: 'C-002', estado: 'Llamado', servicioId: servicios[0].id, puntoAtencionId: puntosAtencion[0].id, empleadoId: empleados[2].id },
    { id: uuidv4(), codigo: 'E-002', estado: 'En_Atencion', servicioId: servicios[2].id, puntoAtencionId: puntosAtencion[1].id, empleadoId: empleados[1].id },
  ];

  for (const ficha of fichas) {
    await db.insert(schema.ficha).values(ficha);
  }

  // Insertar algunas atenciones de ejemplo
  const atenciones: Array<typeof schema.atencion.$inferInsert> = [
    { 
      id: uuidv4(), 
      fichaId: fichas[2].id, 
      empleadoId: empleados[2].id, 
      inicioAtencion: new Date(Date.now() - 10 * 60000), // 10 minutos atrás
      finAtencion: new Date(),
      resultado: 'Atendido satisfactoriamente'
    },
    { 
      id: uuidv4(), 
      fichaId: fichas[3].id, 
      empleadoId: empleados[1].id, 
      inicioAtencion: new Date(Date.now() - 15 * 60000), // 15 minutos atrás
      resultado: 'En proceso'
    },
  ];

  for (const atencion of atenciones) {
    await db.insert(schema.atencion).values(atencion);
  }

  // Insertar métricas de tiempo real de ejemplo
  const metricas: Array<typeof schema.metricaTiempoReal.$inferInsert> = [
    { 
      id: uuidv4(),
      servicioId: servicios[0].id,
      puntoAtencionId: puntosAtencion[0].id,
      tiempoEsperaPromedio: 15,
      tiempoAtencionPromedio: 10,
      cantidadEnEspera: 2,
      cantidadAtendidos: 5,
      version: 1
    },
    { 
      id: uuidv4(),
      servicioId: servicios[1].id,
      puntoAtencionId: puntosAtencion[1].id,
      tiempoEsperaPromedio: 20,
      tiempoAtencionPromedio: 18,
      cantidadEnEspera: 3,
      cantidadAtendidos: 4,
      version: 1
    },
  ];

  for (const metrica of metricas) {
    await db.insert(schema.metricaTiempoReal).values(metrica);
  }

  

  await connection.end();
}

main().catch(console.error);