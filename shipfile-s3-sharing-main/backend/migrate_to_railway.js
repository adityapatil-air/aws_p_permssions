import sqlite3 from 'sqlite3';
import pg from 'pg';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Local SQLite database
const localDb = new sqlite3.Database(join(__dirname, 'shipfile.db'));

// Railway PostgreSQL database
const { Client } = pg;
const railwayDb = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

console.log('🚀 Starting migration from local SQLite to Railway PostgreSQL...');

const migrate = async () => {
  try {
    await railwayDb.connect();
    console.log('✅ Connected to Railway PostgreSQL');

    // Migrate owners
    await migrateTable('owners', [
      'id', 'email', 'name', 'created_at'
    ]);

    // Migrate buckets
    await migrateTable('buckets', [
      'id', 'name', 'region', 'access_key', 'secret_key', 'owner_email', 'created_at'
    ]);

    // Migrate organizations
    await migrateTable('organizations', [
      'id', 'bucket_name', 'name', 'created_at'
    ]);

    // Migrate members
    await migrateTable('members', [
      'id', 'email', 'password', 'bucket_name', 'permissions', 'scope_type', 'scope_folders', 'invited_by', 'created_at'
    ]);

    // Migrate invitations
    await migrateTable('invitations', [
      'id', 'bucket_name', 'email', 'permissions', 'scope_type', 'scope_folders', 'expires_at', 'created_by', 'created_at', 'accepted'
    ]);

    // Migrate file_ownership
    await migrateTable('file_ownership', [
      'id', 'bucket_name', 'file_path', 'owner_email', 'uploaded_at'
    ]);

    // Migrate activity_logs
    await migrateTable('activity_logs', [
      'id', 'bucket_name', 'user_email', 'action', 'resource_path', 'old_name', 'details', 'timestamp'
    ]);

    // Migrate shares
    await migrateTable('shares', [
      'id', 'bucket_name', 'items', 'permissions', 'expires_at', 'created_at', 'revoked'
    ]);

    console.log('🎉 Migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    localDb.close();
    await railwayDb.end();
  }
};

const migrateTable = async (tableName, columns) => {
  return new Promise((resolve, reject) => {
    console.log(`\n📋 Migrating table: ${tableName}`);
    
    localDb.all(`SELECT * FROM ${tableName}`, async (err, rows) => {
      if (err) {
        console.error(`❌ Error reading ${tableName}:`, err);
        return reject(err);
      }

      if (rows.length === 0) {
        console.log(`⚠️  No data found in ${tableName}`);
        return resolve();
      }

      console.log(`📊 Found ${rows.length} rows in ${tableName}`);

      try {
        // Clear existing data in PostgreSQL
        await railwayDb.query(`TRUNCATE TABLE ${tableName} RESTART IDENTITY CASCADE`);
        console.log(`🗑️  Cleared existing data in ${tableName}`);

        // Insert data
        for (const row of rows) {
          const values = columns.map(col => {
            let value = row[col];
            
            // Handle boolean conversion
            if (tableName === 'invitations' && col === 'accepted') {
              value = value === 1 ? true : false;
            }
            if (tableName === 'shares' && col === 'revoked') {
              value = value === 1 ? true : false;
            }
            
            return value;
          });

          const placeholders = values.map((_, index) => `$${index + 1}`).join(', ');
          const columnNames = columns.join(', ');
          
          const query = `INSERT INTO ${tableName} (${columnNames}) VALUES (${placeholders})`;
          
          await railwayDb.query(query, values);
        }

        console.log(`✅ Successfully migrated ${rows.length} rows to ${tableName}`);
        resolve();
        
      } catch (pgError) {
        console.error(`❌ Error inserting into ${tableName}:`, pgError);
        reject(pgError);
      }
    });
  });
};

migrate();