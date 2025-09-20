import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const db = new sqlite3.Database(join(__dirname, 'shipfile.db'));

console.log('=== CHECKING CURRENT MEMBER STATE ===');

db.serialize(() => {
  // Check current schema
  db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='members'", (err, row) => {
    if (err) {
      console.error('Error:', err);
      return;
    }
    console.log('\nCurrent members table schema:');
    console.log(row.sql);
  });

  // Check current members
  db.all('SELECT email, bucket_name, permissions, scope_type FROM members WHERE email = ?', ['nutan@gmail.com'], (err, rows) => {
    if (err) {
      console.error('Error:', err);
      return;
    }
    console.log('\nCurrent members for nutan@gmail.com:');
    console.log(rows);
    
    // Check all members
    db.all('SELECT email, bucket_name FROM members ORDER BY email', (err, allRows) => {
      if (err) {
        console.error('Error:', err);
        return;
      }
      console.log('\nAll members in database:');
      console.log(allRows);
      db.close();
    });
  });
});