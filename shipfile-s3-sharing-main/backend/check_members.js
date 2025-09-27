import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const db = new sqlite3.Database(join(__dirname, 'shipfile.db'));

console.log('🔍 Checking current members in database...');

db.all('SELECT email, bucket_name, permissions, scope_type, scope_folders FROM members', (err, rows) => {
  if (err) {
    console.error('Error:', err);
  } else {
    console.log(`Found ${rows.length} members:`);
    rows.forEach((row, index) => {
      console.log(`${index + 1}. Email: ${row.email}`);
      console.log(`   Bucket: ${row.bucket_name}`);
      console.log(`   Scope: ${row.scope_type || 'entire'}`);
      console.log(`   Folders: ${row.scope_folders || 'all'}`);
      console.log('');
    });
  }
  db.close();
});