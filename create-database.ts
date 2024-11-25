import mysql from 'mysql2/promise';

async function main() {
  const host = process.env.DB_HOST || 'mysql';
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || 'root';
  const dbName = process.env.DB_NAME || 'sistema_colas';

  try {
    // Establecer la conexión inicial sin base de datos
    const connection = await mysql.createConnection({
      host,
      user,
      password,
    });

    // Crear la base de datos si no existe
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);

    // Seleccionar la base de datos recién creada
    await connection.changeUser({ database: dbName });

    // Aquí puedes continuar con las consultas a la base de datos, si es necesario

    console.log(`Base de datos ${dbName} creada o ya existe.`);

    // Cerrar la conexión
    await connection.end();
  } catch (error) {
    console.error('Error al crear la base de datos:', error);
  }
}

main().catch(console.error);
