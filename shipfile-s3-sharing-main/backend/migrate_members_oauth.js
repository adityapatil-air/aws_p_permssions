import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const db = new sqlite3.Database(join(__dirname, 'shipfile.db'));

console.log('🔄 Migrating members table for Google OAuth...');

db.serialize(() => {
  // First, let's see the current structure
  db.all("PRAGMA table_info(members)", (err, columns) => {
    if (err) {
      console.error('Error getting table info:', err);
      return;
    }
    
    console.log('Current members table structure:');
    columns.forEach(col => {
      console.log(`  ${col.name}: ${col.type} ${col.notnull ? 'NOT NULL' : 'NULL'} ${col.pk ? 'PRIMARY KEY' : ''}`);
    });
    
    // Create new table with updated structure
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
      
      console.log('✅ Created new members table structure');
      
      // Copy data from old table to new table
      db.run(`INSERT INTO members_new (id, email, password, bucket_name, permissions, scope_type, scope_folders, invited_by, created_at)
              SELECT id, email, password, bucket_name, permissions, scope_type, scope_folders, invited_by, created_at 
              FROM members`, (err) => {
        if (err) {
          console.error('Error copying data:', err);
          return;
        }
        
        console.log('✅ Copied existing data to new table');
        
        // Drop old table and rename new table
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
            
            console.log('✅ Migration completed successfully!');
            console.log('📝 Members can now use Google OAuth without passwords');
            
            // Show final structure
            db.all("PRAGMA table_info(members)", (err, columns) => {
              if (err) {
                console.error('Error getting final table info:', err);
                return;
              }
              
              console.log('\nFinal members table structure:');
              columns.forEach(col => {
                console.log(`  ${col.name}: ${col.type} ${col.notnull ? 'NOT NULL' : 'NULL'} ${col.pk ? 'PRIMARY KEY' : ''}`);
              });
              
              db.close();
            });
          });
        });
      });
    });
  });
});