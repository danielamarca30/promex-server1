import { mysqlTable, varchar, int } from 'drizzle-orm/mysql-core';

export const testTable = mysqlTable('test_table', {
  id: varchar('id', { length: 36 }).primaryKey(),
  name: varchar('name', { length: 256 }),
  age: int('age'),
});
