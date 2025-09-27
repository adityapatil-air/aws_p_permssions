import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

console.log('=== CHECKING RAILWAY POSTGRESQL MEMBERS ===');

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function checkMembers() {
  try {
    await client.connect();
    console.log('✅ Connected to Railway PostgreSQL');
    
    // Check members table
    const result = await client.query('SELECT email, bucket_name, permissions, scope_type, scope_folders FROM members ORDER BY email');
    
    console.log(`Found ${result.rows.length} members:`);
    
    if (result.rows.length === 0) {
      console.log('❌ No members found in Railway database');
    } else {
      result.rows.forEach((member, index) => {
        console.log(`\n${index + 1}. ${member.email} (${member.bucket_name})`);
        console.log(`   Permissions: ${member.permissions}`);
        console.log(`   Scope: ${member.scope_type} - ${member.scope_folders}`);
        
        try {
          const perms = JSON.parse(member.permissions);
          console.log(`   Parsed:`, perms);
        } catch (e) {
          console.log(`   ❌ Invalid JSON: ${e.message}`);
        }
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
  }
}

checkMembers();