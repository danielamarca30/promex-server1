import { drizzle } from 'drizzle-orm/mysql2';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true
  });

  const db = drizzle(connection);

  console.log('Aplicando migraciones...');
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('Migraciones aplicadas con éxito.');

  await connection.end();
}

main().catch(console.error);