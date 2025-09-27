import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

console.log('=== TESTING PERMISSION UPDATE IN RAILWAY ===');

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function testPermissionUpdate() {
  try {
    await client.connect();
    console.log('✅ Connected to Railway PostgreSQL');
    
    // Get first member
    const result = await client.query('SELECT email, bucket_name, permissions FROM members LIMIT 1');
    
    if (result.rows.length === 0) {
      console.log('❌ No members found');
      return;
    }
    
    const member = result.rows[0];
    console.log(`\n📋 Testing with: ${member.email} in ${member.bucket_name}`);
    console.log('Current permissions:', member.permissions);
    
    // Parse current permissions
    const currentPerms = JSON.parse(member.permissions);
    console.log('Parsed permissions:', currentPerms);
    
    // Create test update - give upload permissions
    const updatedPerms = {
      ...currentPerms,
      uploadViewAll: true,
      deleteFiles: true,
      generateLinks: true,
      createFolder: true,
      inviteMembers: true
    };
    
    console.log('\n🔄 Updating to:', updatedPerms);
    
    // Update in database
    const updateResult = await client.query(
      'UPDATE members SET permissions = $1 WHERE email = $2 AND bucket_name = $3',
      [JSON.stringify(updatedPerms), member.email, member.bucket_name]
    );
    
    console.log(`✅ Update completed. Rows affected: ${updateResult.rowCount}`);
    
    // Verify update
    const verifyResult = await client.query(
      'SELECT permissions FROM members WHERE email = $1 AND bucket_name = $2',
      [member.email, member.bucket_name]
    );
    
    console.log('\n📋 Verification:');
    console.log('Updated permissions in DB:', verifyResult.rows[0].permissions);
    console.log('Parsed updated:', JSON.parse(verifyResult.rows[0].permissions));
    
    console.log('\n✅ Permission update test completed!');
    console.log('\n💡 For member to see changes:');
    console.log('   1. Member should refresh browser (F5)');
    console.log('   2. Or try any action (upload/download)');
    console.log('   3. Server will check fresh permissions from database');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
  }
}

testPermissionUpdate();