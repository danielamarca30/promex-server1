import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';

dotenv.config();

async function testConnection() {
  console.log('Intentando conectar al servidor MySQL...');
  console.log(`Host: ${process.env.DB_HOST}`);
  console.log(`Usuario: ${process.env.DB_USER}`);

  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    });

    console.log('Conexión exitosa al servidor MySQL!');
    await connection.end();
  } catch (error) {
    console.error('Error al conectar:', error);
  }
}

testConnection();