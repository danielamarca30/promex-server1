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
  
    // ** Vaciar tablas en orden para mantener la integridad referencial **
    const tablas = [
      schema.atencion,
      schema.ficha,
      schema.puntoAtencion,
      schema.servicio,
      schema.subCategoriaServicio,
      schema.categoriaServicio,
      schema.usuario,
      schema.empleado,
      schema.rol,
    ];
  
    for (const tabla of tablas) {
      await db.delete(tabla).execute();
    }
  
    console.log('Tablas vaciadas correctamente.');
  // Insertar roles
  const roles = [
    { id: uuidv4(), nombre: 'Administrador', descripcion: 'Control total del sistema', permisos: JSON.stringify(['tokenBasico']) },
  ];

  for (const rol of roles) {
    await db.insert(schema.rol).values(rol);
  }

  // Insertar empleados
  const empleados = [
    { id: uuidv4(), nombres: 'Admin', apellidos: 'Sistema', estado: 'Disponible' as const },
    { id: uuidv4(), nombres: 'Juan', apellidos: 'Pérez', estado: 'Disponible' as const },
  ];
  

  for (const empleado of empleados) {
    await db.insert(schema.empleado).values(empleado);
  }

  // Insertar usuarios
  const hashedPassword = await bcrypt.hash('admin123', 10);
  const usuarios = [
    { id: uuidv4(), username: 'admin', password: hashedPassword, rolId: roles[0].id, empleadoId: empleados[0].id, activo: true },
  ];

  for (const usuario of usuarios) {
    await db.insert(schema.usuario).values(usuario);
  }

  console.log('Datos iniciales insertados correctamente.');
  await connection.end();
}

main().catch(console.error);
