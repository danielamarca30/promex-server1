import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import * as schema from './src/schema';

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'sistema_colas',
  });

  const db = drizzle(connection, { schema, mode: 'default' });

  console.log('Verificando configuración de la base de datos...');

  // Verificar rol
  const roles = await db.select().from(schema.rol);
  console.log('Roles encontrados:', roles.length);

  // Verificar usuario
  const usuarios = await db.select().from(schema.usuario);
  console.log('Usuarios encontrados:', usuarios.length);

  // Verificar empleado
  const empleados = await db.select().from(schema.empleado);
  console.log('Empleados encontrados:', empleados.length);

  console.log('Verificación completada.');

  await connection.end();
}

main().catch(console.error);