import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;
const railwayDb = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

console.log('🗑️  Truncating all data from Railway PostgreSQL...');

const truncateAll = async () => {
  try {
    await railwayDb.connect();
    console.log('✅ Connected to Railway PostgreSQL');

    const tables = [
      'activity_logs',
      'file_ownership', 
      'shares',
      'invitations',
      'members',
      'organizations',
      'buckets',
      'owners'
    ];

    for (const table of tables) {
      try {
        await railwayDb.query(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`);
        console.log(`✅ Truncated ${table}`);
      } catch (error) {
        console.log(`⚠️  Could not truncate ${table}:`, error.message);
      }
    }

    console.log('🎉 All data truncated successfully!');
    
  } catch (error) {
    console.error('❌ Truncation failed:', error);
  } finally {
    await railwayDb.end();
  }
};

truncateAll();