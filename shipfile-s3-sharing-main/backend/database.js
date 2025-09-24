import pg from 'pg';
import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let db;

if (process.env.DATABASE_URL) {
  // PostgreSQL for production
  const { Client } = pg;
  db = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });
  
  await db.connect();
  console.log('Connected to PostgreSQL');
} else {
  // SQLite for development
  db = new sqlite3.Database(join(__dirname, 'shipfile.db'));
  console.log('Connected to SQLite');
}

export default db;