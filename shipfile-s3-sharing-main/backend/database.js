import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// For production, use PostgreSQL; for development, use SQLite
const isProduction = process.env.NODE_ENV === 'production';

let db;

if (isProduction && process.env.DATABASE_URL) {
  // PostgreSQL for production
  import('pg').then(({ default: pg }) => {
    const { Pool } = pg;
    db = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
    });
  });
} else {
  // SQLite for development
  db = new sqlite3.Database(join(__dirname, 'shipfile.db'));
}

export default db;