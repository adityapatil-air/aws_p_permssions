import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const db = new sqlite3.Database(join(__dirname, 'shipfile.db'));

console.log('🔧 Fixing timestamp issues in activity logs...');

db.serialize(() => {
  // First, let's check the current schema
  db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='activity_logs'", (err, row) => {
    if (err) {
      console.error('Error checking schema:', err);
      return;
    }
    
    console.log('Current activity_logs schema:', row?.sql);
    
    // Create a new table with the correct schema
    db.run(`CREATE TABLE IF NOT EXISTS activity_logs_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bucket_name TEXT NOT NULL,
      user_email TEXT NOT NULL,
      action TEXT NOT NULL,
      resource_path TEXT NOT NULL,
      old_name TEXT,
      details TEXT,
      timestamp DATETIME NOT NULL
    )`, (err) => {
      if (err) {
        console.error('Error creating new table:', err);
        return;
      }
      
      console.log('✅ Created new activity_logs table');
      
      // Copy existing data with proper timestamp conversion
      db.run(`INSERT INTO activity_logs_new (id, bucket_name, user_email, action, resource_path, old_name, details, timestamp)
              SELECT id, bucket_name, user_email, action, resource_path, old_name, details, 
                     CASE 
                       WHEN timestamp IS NULL THEN datetime('now')
                       ELSE timestamp
                     END
              FROM activity_logs`, (err) => {
        if (err) {
          console.error('Error copying data:', err);
          return;
        }
        
        console.log('✅ Copied existing data to new table');
        
        // Drop old table and rename new one
        db.run('DROP TABLE activity_logs', (err) => {
          if (err) {
            console.error('Error dropping old table:', err);
            return;
          }
          
          db.run('ALTER TABLE activity_logs_new RENAME TO activity_logs', (err) => {
            if (err) {
              console.error('Error renaming table:', err);
              return;
            }
            
            console.log('✅ Successfully updated activity_logs table schema');
            
            // Verify the fix by checking recent logs
            db.all('SELECT user_email, action, timestamp FROM activity_logs ORDER BY id DESC LIMIT 5', (err, rows) => {
              if (err) {
                console.error('Error verifying fix:', err);
                return;
              }
              
              console.log('\n📊 Recent activity logs:');
              rows.forEach(row => {
                const date = new Date(row.timestamp);
                console.log(`- ${row.user_email} ${row.action} at ${date.toLocaleString()}`);
              });
              
              console.log('\n🎉 Timestamp fix completed successfully!');
              console.log('💡 Restart your server to see the changes.');
              
              db.close();
            });
          });
        });
      });
    });
  });
});