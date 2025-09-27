import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const db = new sqlite3.Database(join(__dirname, 'shipfile.db'));

console.log('🗑️  Truncating all data from local SQLite database...');

const truncateAll = () => {
  const tables = [
    'activity_logs',
    'file_ownership', 
    'shares',
    'invitations',
    'members',
    'organizations',
    'buckets',
    'owners'
  ];

  db.serialize(() => {
    tables.forEach(table => {
      db.run(`DELETE FROM ${table}`, (err) => {
        if (err) {
          console.log(`⚠️  Could not truncate ${table}:`, err.message);
        } else {
          console.log(`✅ Truncated ${table}`);
        }
      });
    });

    // Reset auto-increment counters
    tables.forEach(table => {
      db.run(`DELETE FROM sqlite_sequence WHERE name='${table}'`, (err) => {
        if (err && !err.message.includes('no such table')) {
          console.log(`⚠️  Could not reset sequence for ${table}:`, err.message);
        }
      });
    });

    console.log('🎉 Local SQLite database truncated successfully!');
    db.close();
  });
};

truncateAll();