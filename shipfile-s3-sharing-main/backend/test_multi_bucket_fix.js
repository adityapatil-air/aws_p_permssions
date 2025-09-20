import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const db = new sqlite3.Database(join(__dirname, 'shipfile.db'));

console.log('=== TESTING MULTI-BUCKET MEMBER SUPPORT ===');

// Test scenario: Create test data to simulate the issue
db.serialize(() => {
  console.log('\n1. Setting up test data...');
  
  // Clear existing test data
  db.run('DELETE FROM members WHERE email = ?', ['test@example.com']);
  db.run('DELETE FROM invitations WHERE email = ?', ['test@example.com']);
  
  // Insert test buckets (assuming they exist)
  console.log('2. Testing member insertion for multiple buckets...');
  
  // Simulate first bucket invitation acceptance
  db.run(`INSERT INTO members (email, password, bucket_name, permissions, scope_type, scope_folders, invited_by) 
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['test@example.com', 'password123', 'bucket1', '{"viewOnly": true}', 'specific', '["mit/artificial-intelligence"]', 'owner@example.com'],
    function(err) {
      if (err) {
        console.error('❌ Error inserting first bucket member:', err);
        return;
      }
      console.log('✅ Member added to bucket1');
      
      // Simulate second bucket invitation acceptance
      db.run(`INSERT INTO members (email, password, bucket_name, permissions, scope_type, scope_folders, invited_by) 
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['test@example.com', 'password123', 'bucket2', '{"uploadViewAll": true}', 'entire', '[]', 'owner@example.com'],
        function(err) {
          if (err) {
            console.error('❌ Error inserting second bucket member:', err);
            return;
          }
          console.log('✅ Member added to bucket2');
          
          // Check if member exists in both buckets
          console.log('\n3. Verifying member exists in both buckets...');
          db.all('SELECT email, bucket_name, permissions, scope_type FROM members WHERE email = ?', 
            ['test@example.com'], (err, rows) => {
            if (err) {
              console.error('❌ Error checking members:', err);
              return;
            }
            
            console.log('Found members:');
            rows.forEach(row => {
              console.log(`  - ${row.email} in ${row.bucket_name} with ${row.scope_type} scope`);
            });
            
            if (rows.length === 2) {
              console.log('\n✅ SUCCESS: Member exists in both buckets!');
              console.log('✅ Multi-bucket support is working correctly');
            } else {
              console.log('\n❌ FAILED: Member should exist in 2 buckets but found', rows.length);
            }
            
            // Test login simulation
            console.log('\n4. Testing login simulation...');
            db.all('SELECT bucket_name, permissions, scope_type, scope_folders FROM members WHERE email = ? AND password = ?',
              ['test@example.com', 'password123'], (err, members) => {
              if (err) {
                console.error('❌ Login test failed:', err);
                return;
              }
              
              console.log('Login would return buckets:');
              members.forEach(member => {
                console.log(`  - ${member.bucket_name}: ${member.scope_type} scope`);
              });
              
              // Cleanup
              console.log('\n5. Cleaning up test data...');
              db.run('DELETE FROM members WHERE email = ?', ['test@example.com'], () => {
                console.log('✅ Test data cleaned up');
                console.log('\n=== TEST COMPLETED ===');
                db.close();
              });
            });
          });
        }
      );
    }
  );
});