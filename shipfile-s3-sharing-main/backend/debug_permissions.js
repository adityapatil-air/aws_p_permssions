import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const db = new sqlite3.Database(join(__dirname, 'shipfile.db'));

console.log('=== DEBUGGING MEMBER PERMISSIONS ===');

db.serialize(() => {
  // Check all members and their permissions
  db.all('SELECT email, bucket_name, permissions FROM members', (err, rows) => {
    if (err) {
      console.error('Error:', err);
      return;
    }
    
    console.log('\nAll members and their permissions:');
    rows.forEach(row => {
      console.log(`\nMember: ${row.email}`);
      console.log(`Bucket: ${row.bucket_name}`);
      console.log(`Raw permissions: ${row.permissions}`);
      
      try {
        const perms = JSON.parse(row.permissions);
        console.log('Parsed permissions:', perms);
        
        // Check if this should be "view own files"
        if (perms.uploadViewOwn && !perms.uploadViewAll && !perms.viewOnly && !perms.viewDownload) {
          console.log('✅ This member should only see own files');
        } else {
          console.log('❌ This member can see all files');
        }
      } catch (e) {
        console.log('Error parsing permissions:', e.message);
      }
    });
    
    db.close();
  });
});