import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const db = new sqlite3.Database(join(__dirname, 'shipfile.db'));

console.log('=== FIXING MULTI-BUCKET MEMBER SUPPORT ===');

db.serialize(() => {
  // First, let's check current schema
  db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='members'", (err, row) => {
    if (err) {
      console.error('Error checking schema:', err);
      return;
    }
    console.log('Current members table schema:');
    console.log(row.sql);
  });

  // Create new members table with composite unique constraint (email + bucket_name)
  console.log('\n1. Creating new members table with proper constraints...');
  
  db.run(`CREATE TABLE IF NOT EXISTS members_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    password TEXT,
    bucket_name TEXT NOT NULL,
    permissions TEXT,
    scope_type TEXT,
    scope_folders TEXT,
    invited_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(email, bucket_name)
  )`, (err) => {
    if (err) {
      console.error('Error creating new table:', err);
      return;
    }
    console.log('✅ New members table created successfully');

    // Copy existing data
    console.log('\n2. Copying existing member data...');
    db.run(`INSERT INTO members_new (email, password, bucket_name, permissions, scope_type, scope_folders, invited_by, created_at)
            SELECT email, password, bucket_name, permissions, scope_type, scope_folders, invited_by, created_at 
            FROM members`, (err) => {
      if (err) {
        console.error('Error copying data:', err);
        return;
      }
      console.log('✅ Data copied successfully');

      // Drop old table and rename new one
      console.log('\n3. Replacing old table...');
      db.run('DROP TABLE members', (err) => {
        if (err) {
          console.error('Error dropping old table:', err);
          return;
        }
        
        db.run('ALTER TABLE members_new RENAME TO members', (err) => {
          if (err) {
            console.error('Error renaming table:', err);
            return;
          }
          console.log('✅ Table replacement completed');

          // Verify the fix
          console.log('\n4. Verifying new schema...');
          db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='members'", (err, row) => {
            if (err) {
              console.error('Error verifying schema:', err);
              return;
            }
            console.log('New members table schema:');
            console.log(row.sql);

            console.log('\n5. Current members data:');
            db.all('SELECT email, bucket_name FROM members ORDER BY email, bucket_name', (err, rows) => {
              if (err) {
                console.error('Error fetching members:', err);
                return;
              }
              console.log(rows);
              
              console.log('\n✅ MULTI-BUCKET MEMBER SUPPORT ENABLED');
              console.log('Members can now belong to multiple buckets with different permissions');
              db.close();
            });
          });
        });
      });
    });
  });
});