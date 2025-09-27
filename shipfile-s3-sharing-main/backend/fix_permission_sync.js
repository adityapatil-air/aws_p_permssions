import database from './database.js';

const db = database;

console.log('=== FIXING PERMISSION SYNCHRONIZATION ISSUE ===');

// Function to verify database integrity
function verifyDatabaseIntegrity() {
  return new Promise((resolve, reject) => {
    db.all('SELECT email, bucket_name, permissions, scope_type, scope_folders FROM members', (err, members) => {
      if (err) {
        reject(err);
        return;
      }
      
      console.log('\n📊 Current Database State:');
      console.log(`Total members: ${members.length}`);
      
      members.forEach((member, index) => {
        console.log(`\n${index + 1}. ${member.email} (${member.bucket_name})`);
        console.log(`   Permissions: ${member.permissions}`);
        console.log(`   Scope: ${member.scope_type || 'null'} - ${member.scope_folders || 'null'}`);
        
        try {
          const perms = JSON.parse(member.permissions);
          console.log(`   Parsed: ${JSON.stringify(perms, null, 2)}`);
        } catch (e) {
          console.log(`   ❌ Invalid JSON: ${e.message}`);
        }
      });
      
      resolve(members);
    });
  });
}

// Function to test permission update
function testPermissionUpdate(email, bucketName) {
  return new Promise((resolve, reject) => {
    console.log(`\n🔧 Testing permission update for ${email} in ${bucketName}`);
    
    const testPermissions = {
      viewOnly: false,
      viewDownload: true,
      uploadOnly: false,
      uploadViewOwn: false,
      uploadViewAll: false,
      deleteFiles: false,
      generateLinks: true,
      createFolder: false,
      deleteOwnFiles: false,
      inviteMembers: false
    };
    
    const testScopeType = 'entire';
    const testScopeFolders = [];
    
    console.log('Updating with test permissions:', testPermissions);
    
    db.run(
      'UPDATE members SET permissions = ?, scope_type = ?, scope_folders = ? WHERE email = ? AND bucket_name = ?',
      [JSON.stringify(testPermissions), testScopeType, JSON.stringify(testScopeFolders), email, bucketName],
      function(err) {
        if (err) {
          console.error('❌ Update failed:', err);
          reject(err);
          return;
        }
        
        console.log(`✅ Update successful. Changes: ${this.changes}`);
        
        // Verify the update immediately
        db.get('SELECT email, permissions, scope_type, scope_folders FROM members WHERE email = ? AND bucket_name = ?',
          [email, bucketName], (err, updated) => {
          if (err) {
            console.error('❌ Verification failed:', err);
            reject(err);
            return;
          }
          
          console.log('\n📋 Verification Result:');
          console.log(`Email: ${updated.email}`);
          console.log(`Permissions: ${updated.permissions}`);
          console.log(`Scope: ${updated.scope_type} - ${updated.scope_folders}`);
          
          try {
            const parsedPerms = JSON.parse(updated.permissions);
            console.log('✅ Permissions are valid JSON:', parsedPerms);
            resolve(updated);
          } catch (e) {
            console.log('❌ Permissions are invalid JSON:', e.message);
            reject(e);
          }
        });
      }
    );
  });
}

// Function to check for database locks or connection issues
function checkDatabaseHealth() {
  return new Promise((resolve, reject) => {
    console.log('\n🏥 Checking database health...');
    
    // Test a simple query
    db.get('SELECT COUNT(*) as count FROM members', (err, result) => {
      if (err) {
        console.error('❌ Database health check failed:', err);
        reject(err);
        return;
      }
      
      console.log(`✅ Database is healthy. Total members: ${result.count}`);
      resolve(result);
    });
  });
}

// Main execution
async function main() {
  try {
    // Check database health
    await checkDatabaseHealth();
    
    // Verify current state
    const members = await verifyDatabaseIntegrity();
    
    if (members.length > 0) {
      // Test update with first member
      const testMember = members[0];
      console.log(`\n🧪 Testing with member: ${testMember.email} in ${testMember.bucket_name}`);
      
      await testPermissionUpdate(testMember.email, testMember.bucket_name);
      
      // Verify the change persisted
      console.log('\n🔍 Final verification...');
      await verifyDatabaseIntegrity();
      
      console.log('\n✅ Permission synchronization test completed successfully!');
      console.log('\n💡 If the issue persists, it might be:');
      console.log('   1. Frontend caching issue - try hard refresh (Ctrl+F5)');
      console.log('   2. API response caching - check network tab in browser');
      console.log('   3. React state not updating - check component re-renders');
      console.log('   4. Database connection pooling issue - restart the server');
      
    } else {
      console.log('❌ No members found to test with');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    db.close();
  }
}

main();