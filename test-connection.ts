import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';

dotenv.config();

async function testConnection() {
  
  
  

  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    });

    
    await connection.end();
  } catch (error) {
    console.error('Error al conectar:', error);
  }
}

testConnection();