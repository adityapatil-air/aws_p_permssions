import database from './database.js';

const db = database;

console.log('=== DEBUGGING PERMISSION UPDATE FLOW ===');

// Test the entire permission update flow
async function testPermissionFlow() {
  try {
    // Get a member to test with
    const members = await new Promise((resolve, reject) => {
      db.all('SELECT email, bucket_name, permissions, scope_type, scope_folders FROM members LIMIT 1', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    if (members.length === 0) {
      console.log('❌ No members found to test with');
      return;
    }

    const testMember = members[0];
    console.log('\n📋 Testing with member:', testMember.email);
    console.log('Current permissions:', testMember.permissions);

    // Parse current permissions
    const currentPerms = JSON.parse(testMember.permissions);
    console.log('\n🔍 Current parsed permissions:', currentPerms);

    // Test conversion to simplified format (what frontend does when editing)
    const simplified = {
      view: 'none',
      upload: 'none',
      download: false,
      share: false,
      create_folder: false,
      invite_members: false
    };

    // Handle view permissions first
    if (currentPerms.viewOnly) {
      simplified.view = 'all';
      simplified.download = false;
    }
    if (currentPerms.viewDownload) {
      simplified.view = 'all';
      simplified.download = true;
    }

    // Handle upload permissions (these override view)
    if (currentPerms.uploadViewOwn) {
      simplified.view = 'own';
      simplified.upload = 'own';
      simplified.download = true;
    }
    if (currentPerms.uploadViewAll) {
      simplified.view = 'all';
      simplified.upload = 'all';
      simplified.download = true;
    }

    // Handle extra permissions
    if (currentPerms.generateLinks) simplified.share = true;
    if (currentPerms.createFolder) simplified.create_folder = true;
    if (currentPerms.inviteMembers) simplified.invite_members = true;

    console.log('\n🔄 Converted to simplified format:', simplified);

    // Test conversion back to old format (what happens when saving)
    const convertedBack = {
      viewOnly: false,
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

    // Handle view permissions
    if (simplified.view === 'all') {
      if (simplified.download) {
        convertedBack.viewDownload = true;
      } else {
        convertedBack.viewOnly = true;
      }
    }

    // Handle upload permissions - these override view permissions
    if (simplified.upload === 'own') {
      convertedBack.uploadViewOwn = true;
      convertedBack.deleteOwnFiles = true;
      // Reset view-only flags since upload includes view
      convertedBack.viewOnly = false;
      convertedBack.viewDownload = false;
    }
    if (simplified.upload === 'all') {
      convertedBack.uploadViewAll = true;
      convertedBack.deleteFiles = true;
      // Reset view-only flags since upload includes view
      convertedBack.viewOnly = false;
      convertedBack.viewDownload = false;
    }

    // Handle extra permissions - ALWAYS set these regardless of other permissions
    convertedBack.generateLinks = Boolean(simplified.share);
    convertedBack.createFolder = Boolean(simplified.create_folder);
    convertedBack.inviteMembers = Boolean(simplified.invite_members);

    // Ensure download permission is preserved for upload users
    if (simplified.upload !== 'none') {
      convertedBack.viewDownload = true;
    } else if (simplified.download) {
      convertedBack.viewDownload = true;
    }

    console.log('\n🔄 Converted back to old format:', convertedBack);

    // Compare original vs converted
    console.log('\n📊 COMPARISON:');
    console.log('Original:', currentPerms);
    console.log('Converted:', convertedBack);

    // Check if they match
    const keys = Object.keys(currentPerms);
    let matches = true;
    for (const key of keys) {
      if (currentPerms[key] !== convertedBack[key]) {
        console.log(`❌ Mismatch: ${key} - Original: ${currentPerms[key]}, Converted: ${convertedBack[key]}`);
        matches = false;
      }
    }

    if (matches) {
      console.log('✅ Conversion is working correctly!');
    } else {
      console.log('❌ Conversion has issues - this explains why permissions aren\'t updating properly');
    }

    // Test actual database update
    console.log('\n🧪 Testing database update...');
    const updateResult = await new Promise((resolve, reject) => {
      db.run(
        'UPDATE members SET permissions = ? WHERE email = ? AND bucket_name = ?',
        [JSON.stringify(convertedBack), testMember.email, testMember.bucket_name],
        function(err) {
          if (err) reject(err);
          else resolve({ changes: this.changes });
        }
      );
    });

    console.log('Update result:', updateResult);

    // Verify the update
    const updatedMember = await new Promise((resolve, reject) => {
      db.get('SELECT permissions FROM members WHERE email = ? AND bucket_name = ?', 
        [testMember.email, testMember.bucket_name], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    console.log('Updated permissions in DB:', updatedMember.permissions);
    console.log('Parsed updated permissions:', JSON.parse(updatedMember.permissions));

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    db.close();
  }
}

testPermissionFlow();