// Test script to verify permission synchronization
import database from './database.js';

const testPermissionSync = async () => {
  console.log('=== TESTING PERMISSION SYNCHRONIZATION ===');
  
  // Test data
  const testEmail = 'test@example.com';
  const testBucket = 'test-bucket';
  
  try {
    // 1. Create a test member with initial permissions
    const initialPermissions = {
      viewOnly: true,
      viewDownload: false,
      uploadOnly: false,
      uploadViewOwn: false,
      uploadViewAll: false,
      deleteFiles: false,
      generateLinks: false,
      createFolder: false,
      deleteOwnFiles: false,
      inviteMembers: false
    };
    
    console.log('1. Creating test member with initial permissions...');
    await new Promise((resolve, reject) => {
      database.run(
        'INSERT OR REPLACE INTO members (email, bucket_name, permissions, scope_type, scope_folders) VALUES (?, ?, ?, ?, ?)',
        [testEmail, testBucket, JSON.stringify(initialPermissions), 'entire', JSON.stringify([])],
        function(err) {
          if (err) reject(err);
          else {
            console.log('✅ Test member created');
            resolve();
          }
        }
      );
    });
    
    // 2. Verify initial permissions
    console.log('2. Verifying initial permissions...');
    const initialMember = await new Promise((resolve, reject) => {
      database.get(
        'SELECT permissions, scope_type, scope_folders FROM members WHERE email = ? AND bucket_name = ?',
        [testEmail, testBucket],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
    
    console.log('Initial permissions:', initialMember.permissions);
    
    // 3. Update permissions
    const updatedPermissions = {
      viewOnly: false,
      viewDownload: true,
      uploadOnly: false,
      uploadViewOwn: false,
      uploadViewAll: true,
      deleteFiles: true,
      generateLinks: true,
      createFolder: true,
      deleteOwnFiles: false,
      inviteMembers: true
    };
    
    console.log('3. Updating permissions...');
    await new Promise((resolve, reject) => {
      database.run(
        'UPDATE members SET permissions = ?, scope_type = ?, scope_folders = ? WHERE email = ? AND bucket_name = ?',
        [JSON.stringify(updatedPermissions), 'specific', JSON.stringify(['folder1', 'folder2']), testEmail, testBucket],
        function(err) {
          if (err) reject(err);
          else {
            console.log('✅ Permissions updated, changes:', this.changes);
            resolve();
          }
        }
      );
    });
    
    // 4. Verify updated permissions
    console.log('4. Verifying updated permissions...');
    const updatedMember = await new Promise((resolve, reject) => {
      database.get(
        'SELECT permissions, scope_type, scope_folders FROM members WHERE email = ? AND bucket_name = ?',
        [testEmail, testBucket],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
    
    console.log('Updated permissions:', updatedMember.permissions);
    console.log('Updated scope type:', updatedMember.scope_type);
    console.log('Updated scope folders:', updatedMember.scope_folders);
    
    // 5. Compare permissions
    const initialPerms = JSON.parse(initialMember.permissions);
    const updatedPerms = JSON.parse(updatedMember.permissions);
    
    console.log('5. Permission comparison:');
    console.log('Upload permissions changed:', initialPerms.uploadViewAll, '->', updatedPerms.uploadViewAll);
    console.log('Extra permissions changed:', initialPerms.generateLinks, '->', updatedPerms.generateLinks);
    console.log('Invite permissions changed:', initialPerms.inviteMembers, '->', updatedPerms.inviteMembers);
    
    // 6. Clean up
    console.log('6. Cleaning up test data...');
    await new Promise((resolve, reject) => {
      database.run(
        'DELETE FROM members WHERE email = ? AND bucket_name = ?',
        [testEmail, testBucket],
        function(err) {
          if (err) reject(err);
          else {
            console.log('✅ Test data cleaned up');
            resolve();
          }
        }
      );
    });
    
    console.log('✅ Permission synchronization test completed successfully!');
    
  } catch (error) {
    console.error('❌ Permission synchronization test failed:', error);
  }
};

// Run the test
testPermissionSync().then(() => {
  console.log('Test completed');
  process.exit(0);
}).catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});