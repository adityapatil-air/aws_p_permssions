import database from './database.js';

const db = database;

console.log('=== CHECKING MEMBERS IN DATABASE ===');

db.all('SELECT email, bucket_name, permissions FROM members', (err, members) => {
  if (err) {
    console.error('Error:', err);
    db.close();
    return;
  }
  
  console.log(`Found ${members.length} members:`);
  
  if (members.length === 0) {
    console.log('❌ No members found in database');
  } else {
    members.forEach((member, index) => {
      console.log(`\n${index + 1}. ${member.email} (${member.bucket_name})`);
      console.log(`   Permissions: ${member.permissions}`);
      
      try {
        const perms = JSON.parse(member.permissions);
        console.log(`   Parsed:`, perms);
      } catch (e) {
        console.log(`   ❌ Invalid JSON: ${e.message}`);
      }
    });
  }
  
  db.close();
});