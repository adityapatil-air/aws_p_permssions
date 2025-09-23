import dotenv from 'dotenv';
import pkg from 'pg';
const { Pool } = pkg;

dotenv.config();

console.log('Testing database connection...');
console.log('DATABASE_URL exists:', !!process.env.DATABASE_URL);

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function testConnection() {
  try {
    console.log('Attempting to connect...');
    const result = await db.query('SELECT NOW() as current_time, version() as db_version');
    console.log('✅ Connection successful!');
    console.log('Current time:', result.rows[0].current_time);
    console.log('Database version:', result.rows[0].db_version);
    
    // Test table creation
    await db.query(`CREATE TABLE IF NOT EXISTS test_table (
      id SERIAL PRIMARY KEY,
      name TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    console.log('✅ Table creation successful!');
    
    // Clean up
    await db.query('DROP TABLE IF EXISTS test_table');
    console.log('✅ Table cleanup successful!');
    
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    console.error('Full error:', error);
  } finally {
    await db.end();
    process.exit(0);
  }
}

testConnection();