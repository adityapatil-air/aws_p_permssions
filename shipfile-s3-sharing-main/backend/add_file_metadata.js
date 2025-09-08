import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const db = new sqlite3.Database(join(__dirname, 'shipfile.db'));

db.run(`CREATE TABLE IF NOT EXISTS file_metadata (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bucket_name TEXT,
  file_key TEXT,
  uploaded_by TEXT,
  uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(bucket_name, file_key)
)`, (err) => {
  if (err) {
    console.error('Error creating file_metadata table:', err);
  } else {
    console.log('file_metadata table created successfully');
  }
  db.close();
});