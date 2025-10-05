import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

// Source database (your working host_testing database)
const SOURCE_DB = "postgresql://postgres:XuEHZaKlZXlnmAzhNlVEYddfJxlpWxFd@maglev.proxy.rlwy.net:43706/railway";

// Target database (new Athena database)
const TARGET_DB = "postgresql://postgres:lSymAraAJgGTvhNFkoaqXHtEGozztswZ@shinkansen.proxy.rlwy.net:36649/railway";

async function copyDataToAthenaDB() {
  const sourceClient = new Client({ connectionString: SOURCE_DB });
  const targetClient = new Client({ connectionString: TARGET_DB });

  try {
    await sourceClient.connect();
    await targetClient.connect();
    
    console.log('Connected to both databases');

    // 1. First create tables in target database
    await createTablesInTarget(targetClient);
    
    // 2. Copy data from source to target
    await copyAllData(sourceClient, targetClient);
    
    console.log('✅ Data copy completed successfully!');
    
  } catch (error) {
    console.error('❌ Error copying data:', error);
  } finally {
    await sourceClient.end();
    await targetClient.end();
  }
}

async function createTablesInTarget(client) {
  console.log('Creating tables in target database...');
  
  // Create all existing tables
  const tables = [
    `CREATE TABLE IF NOT EXISTS buckets (
      id SERIAL PRIMARY KEY,
      name TEXT,
      region TEXT,
      access_key TEXT,
      secret_key TEXT,
      owner_email TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(name, owner_email)
    )`,
    
    `CREATE TABLE IF NOT EXISTS shares (
      id TEXT PRIMARY KEY,
      bucket_name TEXT,
      items TEXT,
      permissions TEXT,
      expires_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      revoked BOOLEAN DEFAULT false
    )`,
    
    `CREATE TABLE IF NOT EXISTS organizations (
      id SERIAL PRIMARY KEY,
      bucket_name TEXT UNIQUE,
      name TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    
    `CREATE TABLE IF NOT EXISTS invitations (
      id TEXT PRIMARY KEY,
      bucket_name TEXT,
      email TEXT,
      permissions TEXT,
      scope_type TEXT,
      scope_folders TEXT,
      expires_at TIMESTAMP,
      created_by TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      accepted BOOLEAN DEFAULT false
    )`,
    
    `CREATE TABLE IF NOT EXISTS members (
      id SERIAL PRIMARY KEY,
      email TEXT,
      password TEXT,
      bucket_name TEXT,
      permissions TEXT,
      scope_type TEXT,
      scope_folders TEXT,
      invited_by TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(email, bucket_name)
    )`,
    
    `CREATE TABLE IF NOT EXISTS file_ownership (
      id SERIAL PRIMARY KEY,
      bucket_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      owner_email TEXT NOT NULL,
      uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(bucket_name, file_path)
    )`,
    
    `CREATE TABLE IF NOT EXISTS owners (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE,
      name TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    
    `CREATE TABLE IF NOT EXISTS activity_logs (
      id SERIAL PRIMARY KEY,
      bucket_name TEXT NOT NULL,
      user_email TEXT NOT NULL,
      action TEXT NOT NULL,
      resource_path TEXT NOT NULL,
      old_name TEXT,
      details TEXT,
      timestamp TIMESTAMP NOT NULL
    )`
  ];

  for (const table of tables) {
    await client.query(table);
  }
  
  console.log('✅ Tables created in target database');
}

async function copyAllData(sourceClient, targetClient) {
  const tables = ['buckets', 'shares', 'organizations', 'invitations', 'members', 'file_ownership', 'owners', 'activity_logs'];
  
  for (const table of tables) {
    try {
      console.log(`Copying data from ${table}...`);
      
      // Get data from source
      const result = await sourceClient.query(`SELECT * FROM ${table}`);
      
      if (result.rows.length > 0) {
        // Clear target table first
        await targetClient.query(`DELETE FROM ${table}`);
        
        // Copy each row
        for (const row of result.rows) {
          const columns = Object.keys(row);
          const values = Object.values(row);
          const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
          
          const insertQuery = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
          await targetClient.query(insertQuery, values);
        }
        
        console.log(`✅ Copied ${result.rows.length} rows from ${table}`);
      } else {
        console.log(`⚠️ No data in ${table}`);
      }
      
    } catch (error) {
      console.error(`❌ Error copying ${table}:`, error.message);
    }
  }
}

// Run the copy
copyDataToAthenaDB();