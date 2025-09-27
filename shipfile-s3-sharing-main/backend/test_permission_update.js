import database from './database.js';

const db = database;

console.log('=== TESTING PERMISSION UPDATE ===');

// Test updating a member's permissions
const testEmail = 'test@example.com';
const testBucket = 'test-bucket';

// First, let's see what members exist
db.all('SELECT email, bucket_name, permissions, scope_type, scope_folders FROM members LIMIT 5', (err, members) => {
  if (err) {
    console.error('Error fetching members:', err);
    return;
  }
  
  console.log('\nExisting members:');
  members.forEach(member => {
    console.log(`- ${member.email} in ${member.bucket_name}`);
    console.log(`  Permissions: ${member.permissions}`);
    console.log(`  Scope: ${member.scope_type} - ${member.scope_folders}`);
  });
  
  if (members.length > 0) {
    const testMember = members[0];
    console.log(`\nTesting update for: ${testMember.email} in ${testMember.bucket_name}`);
    
    const newPermissions = {
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
    
    const newScopeType = 'entire';
    const newScopeFolders = [];
    
    console.log('Updating with:', {
      permissions: newPermissions,
      scopeType: newScopeType,
      scopeFolders: newScopeFolders
    });
    
    db.run(
      'UPDATE members SET permissions = ?, scope_type = ?, scope_folders = ? WHERE email = ? AND bucket_name = ?',
      [JSON.stringify(newPermissions), newScopeType, JSON.stringify(newScopeFolders), testMember.email, testMember.bucket_name],
      function(err) {
        if (err) {
          console.error('Update failed:', err);
        } else {
          console.log(`Update successful. Changes: ${this.changes}`);
          
          // Verify the update
          db.get('SELECT email, permissions, scope_type, scope_folders FROM members WHERE email = ? AND bucket_name = ?',
            [testMember.email, testMember.bucket_name], (err, updated) => {
            if (err) {
              console.error('Verification failed:', err);
            } else {
              console.log('\nVerification - Updated member:');
              console.log(`- Email: ${updated.email}`);
              console.log(`- Permissions: ${updated.permissions}`);
              console.log(`- Scope: ${updated.scope_type} - ${updated.scope_folders}`);
              
              try {
                const parsedPerms = JSON.parse(updated.permissions);
                console.log('- Parsed permissions:', parsedPerms);
              } catch (e) {
                console.log('- Error parsing permissions:', e.message);
              }
            }
            
            db.close();
          });
        }
      }
    );
  } else {
    console.log('No members found to test with');
    db.close();
  }
});