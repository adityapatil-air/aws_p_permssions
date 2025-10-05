import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function setupFreshAthenaDB() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: false
  });

  try {
    await client.connect();
    console.log('Connected to Athena database');

    // Create all tables (existing + new Athena tables)
    await createAllTables(client);
    
    console.log('✅ Fresh Athena database setup complete!');
    console.log('You can now add buckets and test Athena integration');
    
  } catch (error) {
    console.error('❌ Error setting up database:', error);
  } finally {
    await client.end();
  }
}

async function createAllTables(client) {
  console.log('Creating all tables...');
  
  // Existing tables
  const existingTables = [
    `CREATE TABLE IF NOT EXISTS buckets (
      id SERIAL PRIMARY KEY,
      name TEXT,
      region TEXT,
      access_key TEXT,
      secret_key TEXT,
      owner_email TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      athena_enabled BOOLEAN DEFAULT false,
      athena_database VARCHAR(255),
      query_result_location VARCHAR(500),
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
      can_analyze BOOLEAN DEFAULT false,
      analysis_folders TEXT,
      UNIQUE(email, bucket_name)
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
    
    `CREATE TABLE IF NOT EXISTS file_ownership (
      id SERIAL PRIMARY KEY,
      bucket_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      owner_email TEXT NOT NULL,
      uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(bucket_name, file_path)
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

  // New Athena tables
  const athenaTables = [
    `CREATE TABLE IF NOT EXISTS data_files (
      id SERIAL PRIMARY KEY,
      bucket_id INTEGER REFERENCES buckets(id) ON DELETE CASCADE,
      file_name VARCHAR(255) NOT NULL,
      file_path VARCHAR(500) NOT NULL,
      file_type VARCHAR(10) NOT NULL CHECK (file_type IN ('csv', 'excel')),
      processed BOOLEAN DEFAULT false,
      athena_table_name VARCHAR(255),
      schema_json TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    
    `CREATE TABLE IF NOT EXISTS analysis_permissions (
      id SERIAL PRIMARY KEY,
      bucket_id INTEGER REFERENCES buckets(id) ON DELETE CASCADE,
      user_email VARCHAR(255) NOT NULL,
      can_analyze BOOLEAN DEFAULT false,
      allowed_folders TEXT,
      result_access_level VARCHAR(20) DEFAULT 'own_queries',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(bucket_id, user_email)
    )`,
    
    `CREATE TABLE IF NOT EXISTS query_history (
      id SERIAL PRIMARY KEY,
      bucket_id INTEGER REFERENCES buckets(id) ON DELETE CASCADE,
      user_email VARCHAR(255) NOT NULL,
      query_type VARCHAR(10) NOT NULL CHECK (query_type IN ('natural', 'sql')),
      original_query TEXT NOT NULL,
      generated_sql TEXT,
      file_path VARCHAR(500),
      execution_time_ms INTEGER,
      data_scanned_bytes BIGINT,
      result_location VARCHAR(500),
      status VARCHAR(10) DEFAULT 'running',
      error_message TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    
    `CREATE TABLE IF NOT EXISTS processing_options (
      id SERIAL PRIMARY KEY,
      file_id INTEGER REFERENCES data_files(id) ON DELETE CASCADE,
      remove_typos BOOLEAN DEFAULT false,
      remove_duplicates BOOLEAN DEFAULT false,
      fill_missing_values BOOLEAN DEFAULT false,
      standardize_formats BOOLEAN DEFAULT false,
      normalize_data BOOLEAN DEFAULT false,
      processing_status VARCHAR(15) DEFAULT 'pending',
      processed_file_path VARCHAR(500),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`
  ];

  // Create all tables
  for (const table of [...existingTables, ...athenaTables]) {
    await client.query(table);
  }
  
  // Create indexes
  await client.query(`CREATE INDEX IF NOT EXISTS idx_data_files_bucket_id ON data_files(bucket_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_analysis_permissions_bucket_user ON analysis_permissions(bucket_id, user_email)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_query_history_bucket_user ON query_history(bucket_id, user_email)`);
  
  console.log('✅ All tables created');
}

setupFreshAthenaDB();