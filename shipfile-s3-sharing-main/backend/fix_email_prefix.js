import database from './database.js';

console.log('=== FIXING EMAIL PREFIX ISSUE ===');

// Remove "mailto:" prefix from emails
database.run("UPDATE buckets SET owner_email = REPLACE(owner_email, 'mailto:', '') WHERE owner_email LIKE 'mailto:%'", [], function(err) {
  if (err) {
    console.error('Error updating bucket emails:', err);
    return;
  }
  console.log(`✅ Fixed ${this.changes} bucket email(s)`);
  
  database.run("UPDATE owners SET email = REPLACE(email, 'mailto:', '') WHERE email LIKE 'mailto:%'", [], function(err) {
    if (err) {
      console.error('Error updating owner emails:', err);
      return;
    }
    console.log(`✅ Fixed ${this.changes} owner email(s)`);
    
    // Verify the fix
    database.all('SELECT id, name, owner_email FROM buckets', [], (err, buckets) => {
      if (err) {
        console.error('Error verifying fix:', err);
        return;
      }
      
      console.log('\n📦 UPDATED BUCKETS:');
      buckets.forEach(bucket => {
        console.log(`   ID: ${bucket.id}, Name: ${bucket.name}, Owner: ${bucket.owner_email}`);
      });
      
      console.log('\n🎉 Email prefix fix complete!');
      console.log('Now try logging in with: 202301040203@mitaoe.ac.in');
      process.exit(0);
    });
  });
});