import * as dotenv from 'dotenv';

dotenv.config();

/** @type { import("drizzle-kit").Config } */
export default {
  schema: './src/schema.ts',
  out: './drizzle',
  driver: 'mysql2',
  dbCredentials: {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'sistema_colas',
    port: 3306,
  },
};