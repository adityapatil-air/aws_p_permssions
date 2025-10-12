import database from './database.js';

console.log('=== DEBUGGING BUCKET OWNERSHIP ===');

// Check all buckets in database
database.all('SELECT id, name, owner_email, created_at FROM buckets', [], (err, buckets) => {
  if (err) {
    console.error('Error fetching buckets:', err);
    return;
  }
  
  console.log('\n📦 ALL BUCKETS IN DATABASE:');
  console.log('Total buckets found:', buckets.length);
  
  buckets.forEach((bucket, index) => {
    console.log(`\n${index + 1}. Bucket Details:`);
    console.log(`   ID: ${bucket.id}`);
    console.log(`   Name: ${bucket.name}`);
    console.log(`   Owner Email: ${bucket.owner_email}`);
    console.log(`   Created: ${bucket.created_at}`);
  });
  
  // Check all owners
  database.all('SELECT email, name, created_at FROM owners', [], (err, owners) => {
    if (err) {
      console.error('Error fetching owners:', err);
      return;
    }
    
    console.log('\n👥 ALL OWNERS IN DATABASE:');
    console.log('Total owners found:', owners.length);
    
    owners.forEach((owner, index) => {
      console.log(`\n${index + 1}. Owner Details:`);
      console.log(`   Email: ${owner.email}`);
      console.log(`   Name: ${owner.name || 'N/A'}`);
      console.log(`   Created: ${owner.created_at}`);
    });
    
    // Check all members
    database.all('SELECT email, bucket_name, permissions FROM members', [], (err, members) => {
      if (err) {
        console.error('Error fetching members:', err);
        return;
      }
      
      console.log('\n🤝 ALL MEMBERS IN DATABASE:');
      console.log('Total members found:', members.length);
      
      members.forEach((member, index) => {
        console.log(`\n${index + 1}. Member Details:`);
        console.log(`   Email: ${member.email}`);
        console.log(`   Bucket: ${member.bucket_name}`);
        console.log(`   Permissions: ${member.permissions}`);
      });
      
      console.log('\n=== DEBUG COMPLETE ===');
      process.exit(0);
    });
  });
});