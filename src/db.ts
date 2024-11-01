import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import * as schema from './schema';

interface DatabaseConfig {
  host: string;
  user: string;
  password: string;
  database: string;
  connectionLimit: number;
}

const dbConfig: DatabaseConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'sistema_colas',
  connectionLimit: 10
};

let poolConnection: mysql.Pool;

try {
  poolConnection = mysql.createPool(dbConfig);
} catch (error) {
  console.error('Error al crear el pool de conexiones:', error);
  process.exit(1);
}

export const db = drizzle(poolConnection, { schema, mode: 'default' });

export async function testConnection(): Promise<void> {
  try {
    const connection = await poolConnection.getConnection();
    await connection.ping(); // Esto forzará una conexión real
    
    connection.release();
  } catch (error) {
    console.error('Error al conectar a la base de datos:', error);
    throw error;
  }
}

// Verificar la conexión inmediatamente
testConnection().catch((error) => {
  console.error('No se pudo establecer la conexión a la base de datos. Saliendo del proceso.');
  process.exit(1);
});

process.on('exit', () => {
  if (poolConnection) {
    poolConnection.end().catch((err) => {
      console.error('Error al cerrar el pool de conexiones:', err);
    });
  }
});