import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function clearAthenaData() {
  const client = new Client({
    connectionString: "postgresql://postgres:lSymAraAJgGTvhNFkoaqXHtEGozztswZ@shinkansen.proxy.rlwy.net:36649/railway",
    ssl: false
  });

  try {
    await client.connect();
    console.log('Connected to Athena database');

    // Clear all data but keep table structure
    const tables = [
      'activity_logs',
      'file_ownership', 
      'members',
      'invitations',
      'organizations',
      'shares',
      'buckets',
      'owners',
      // New Athena tables
      'processing_options',
      'query_history',
      'analysis_permissions',
      'data_files'
    ];

    for (const table of tables) {
      try {
        await client.query(`DELETE FROM ${table}`);
        console.log(`✅ Cleared ${table}`);
      } catch (error) {
        console.log(`⚠️ ${table} - ${error.message}`);
      }
    }

    // Reset sequences for auto-increment IDs
    const sequences = [
      'buckets_id_seq',
      'organizations_id_seq', 
      'members_id_seq',
      'file_ownership_id_seq',
      'owners_id_seq',
      'activity_logs_id_seq',
      'data_files_id_seq',
      'analysis_permissions_id_seq',
      'query_history_id_seq',
      'processing_options_id_seq'
    ];

    for (const seq of sequences) {
      try {
        await client.query(`ALTER SEQUENCE ${seq} RESTART WITH 1`);
        console.log(`✅ Reset ${seq}`);
      } catch (error) {
        console.log(`⚠️ ${seq} - ${error.message}`);
      }
    }
    
    console.log('\n🎉 Athena database cleared successfully!');
    console.log('📧 Ready for fresh testing with Mailtrap emails');
    
  } catch (error) {
    console.error('❌ Error clearing database:', error);
  } finally {
    await client.end();
  }
}

clearAthenaData();