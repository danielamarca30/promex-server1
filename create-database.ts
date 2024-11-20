import mysql from 'mysql2/promise';

async function main() {
  const host = process.env.DB_HOST || 'mysql';
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || 'root';
  const dbName = process.env.DB_NAME || 'sistema_colas';

  

  try {
    const connection = await mysql.createConnection({
      host,
      user,
      password,
    });

    

    await connection.query(`CREATE DATABASE IF NOT EXISTS ${dbName}`);
    

    await connection.end();
  } catch (error) {
    console.error('Error al crear la base de datos:', error);
  }
}

main().catch(console.error);
