import mysql from 'mysql2/promise';

async function main() {
  const host = process.env.DB_HOST || 'localhost';
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || '';
  const dbName = process.env.DB_NAME || 'sistema_colas';

  console.log(`Intentando conectar a MySQL en ${host} como ${user}`);

  try {
    const connection = await mysql.createConnection({
      host,
      user,
      password,
    });

    console.log('Conexión establecida. Creando base de datos...');

    await connection.query(`CREATE DATABASE IF NOT EXISTS ${dbName}`);
    console.log(`Base de datos '${dbName}' creada o ya existente.`);

    await connection.end();
  } catch (error) {
    console.error('Error al crear la base de datos:', error);
  }
}

main().catch(console.error);