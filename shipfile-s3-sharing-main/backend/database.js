import pg from 'pg';
import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let db;
let isPostgreSQL = false;

if (process.env.DATABASE_URL) {
  // PostgreSQL for production
  const { Client } = pg;
  db = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });
  
  await db.connect();
  isPostgreSQL = true;
  console.log('Connected to PostgreSQL');
  
  // Create tables for PostgreSQL
  await createPostgreSQLTables(db);
} else {
  // SQLite for development
  db = new sqlite3.Database(join(__dirname, 'shipfile.db'));
  isPostgreSQL = false;
  console.log('Connected to SQLite');
}

async function createPostgreSQLTables(client) {
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS buckets (
      id SERIAL PRIMARY KEY,
      name TEXT,
      region TEXT,
      access_key TEXT,
      secret_key TEXT,
      owner_email TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(name, owner_email)
    )`);
    
    await client.query(`CREATE TABLE IF NOT EXISTS shares (
      id TEXT PRIMARY KEY,
      bucket_name TEXT,
      items TEXT,
      permissions TEXT,
      expires_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      revoked BOOLEAN DEFAULT false
    )`);
    
    await client.query(`CREATE TABLE IF NOT EXISTS organizations (
      id SERIAL PRIMARY KEY,
      bucket_name TEXT UNIQUE,
      name TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    
    await client.query(`CREATE TABLE IF NOT EXISTS invitations (
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
    )`);
    
    await client.query(`CREATE TABLE IF NOT EXISTS members (
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
    )`);
    
    await client.query(`CREATE TABLE IF NOT EXISTS file_ownership (
      id SERIAL PRIMARY KEY,
      bucket_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      owner_email TEXT NOT NULL,
      uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(bucket_name, file_path)
    )`);
    
    await client.query(`CREATE TABLE IF NOT EXISTS owners (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE,
      name TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    
    await client.query(`CREATE TABLE IF NOT EXISTS activity_logs (
      id SERIAL PRIMARY KEY,
      bucket_name TEXT NOT NULL,
      user_email TEXT NOT NULL,
      action TEXT NOT NULL,
      resource_path TEXT NOT NULL,
      old_name TEXT,
      details TEXT,
      timestamp TIMESTAMP NOT NULL
    )`);
    
    console.log('PostgreSQL tables created/verified');
  } catch (error) {
    console.error('Error creating PostgreSQL tables:', error);
  }
}

// Wrapper object to handle both PostgreSQL and SQLite
const dbWrapper = {
  isPostgreSQL,
  client: db,
  
  get: function(sql, params, callback) {
    if (isPostgreSQL) {
      const queryPromise = this.client.query(sql, params);
      if (queryPromise && queryPromise.then) {
        queryPromise
          .then(result => callback(null, result.rows[0] || null))
          .catch(error => callback(error));
      } else {
        callback(null, null);
      }
    } else {
      this.client.get(sql, params, callback);
    }
  },
  
  all: function(sql, params, callback) {
    if (isPostgreSQL) {
      const queryPromise = this.client.query(sql, params);
      if (queryPromise && queryPromise.then) {
        queryPromise
          .then(result => callback(null, result.rows))
          .catch(error => callback(error));
      } else {
        callback(null, []);
      }
    } else {
      this.client.all(sql, params, callback);
    }
  },
  
  run: function(sql, params, callback) {
    if (isPostgreSQL) {
      // Convert SQLite INSERT OR REPLACE to PostgreSQL UPSERT
      if (sql.includes('INSERT OR REPLACE')) {
        sql = sql.replace('INSERT OR REPLACE', 'INSERT');
        sql += ' ON CONFLICT DO NOTHING';
      }
      
      const queryPromise = this.client.query(sql, params);
      if (queryPromise && queryPromise.then) {
        queryPromise
          .then(result => {
            const mockThis = { 
              lastID: result.insertId || null,
              changes: result.rowCount || 0
            };
            if (callback) callback.call(mockThis, null);
          })
          .catch(error => {
            if (callback) callback(error);
          });
      } else {
        // Handle synchronous case
        const mockThis = { lastID: null, changes: 0 };
        if (callback) callback.call(mockThis, null);
      }
    } else {
      this.client.run(sql, params, callback);
    }
  },
  
  serialize: function(callback) {
    if (callback) callback();
  }
};

export default dbWrapper;