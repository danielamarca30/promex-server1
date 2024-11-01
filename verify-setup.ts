import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import * as schema from './src/schema';

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'sistema_colas',
  });

  const db = drizzle(connection, { schema, mode: 'default' });

  

  // Verificar rol
  const roles = await db.select().from(schema.rol);
  

  // Verificar usuario
  const usuarios = await db.select().from(schema.usuario);
  

  // Verificar empleado
  const empleados = await db.select().from(schema.empleado);
  

  

  await connection.end();
}

main().catch(console.error);
