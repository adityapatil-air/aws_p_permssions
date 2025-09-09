// Quick fix for invitation issues
// This script will help identify and fix common invitation problems

import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const db = new sqlite3.Database(join(__dirname, 'shipfile.db'));

console.log('=== INVITATION TROUBLESHOOTING ===');

// Check database structure
console.log('\n1. Checking database tables...');
db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
  if (err) {
    console.error('Database error:', err);
    return;
  }
  
  console.log('Available tables:', tables.map(t => t.name));
  
  // Check organizations table
  db.all("SELECT * FROM organizations", (err, orgs) => {
    if (err) {
      console.error('Error reading organizations:', err);
    } else {
      console.log('\n2. Organizations in database:', orgs);
      
      if (orgs.length === 0) {
        console.log('❌ No organizations found! This might be the issue.');
        console.log('🔧 SOLUTION: Create an organization first before sending invitations.');
      }
    }
  });
  
  // Check members table
  db.all("SELECT email, bucket_name, permissions FROM members", (err, members) => {
    if (err) {
      console.error('Error reading members:', err);
    } else {
      console.log('\n3. Current members:', members);
    }
  });
  
  // Check invitations table
  db.all("SELECT * FROM invitations ORDER BY created_at DESC LIMIT 5", (err, invites) => {
    if (err) {
      console.error('Error reading invitations:', err);
    } else {
      console.log('\n4. Recent invitations:', invites);
    }
    
    // Close database
    db.close();
  });
});

console.log('\n=== COMMON SOLUTIONS ===');
console.log('1. Make sure an organization exists for your bucket');
console.log('2. Check that the inviting user has invite_members permission');
console.log('3. Verify SMTP settings in .env file');
console.log('4. Check browser console for frontend errors');
console.log('5. Check server logs for detailed error messages');