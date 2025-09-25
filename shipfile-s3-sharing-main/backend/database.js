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
      // Convert SQLite syntax to PostgreSQL
      let pgSql = this.convertSqlToPostgreSQL(sql);
      const queryPromise = this.client.query(pgSql, params);
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
      // Convert SQLite syntax to PostgreSQL
      let pgSql = this.convertSqlToPostgreSQL(sql);
      const queryPromise = this.client.query(pgSql, params);
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
      // Convert SQLite syntax to PostgreSQL
      let pgSql = this.convertSqlToPostgreSQL(sql);
      
      console.log('PostgreSQL Query:', pgSql);
      console.log('PostgreSQL Params:', params);
      
      const queryPromise = this.client.query(pgSql, params);
      if (queryPromise && queryPromise.then) {
        queryPromise
          .then(result => {
            console.log('PostgreSQL Result:', result);
            const mockThis = { 
              lastID: result.insertId || null,
              changes: result.rowCount || 0
            };
            if (callback) callback.call(mockThis, null);
          })
          .catch(error => {
            console.error('PostgreSQL Error:', error);
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
  },
  
  convertSqlToPostgreSQL: function(sql) {
    let pgSql = sql;
    
    // Convert SQLite syntax to PostgreSQL
    pgSql = pgSql.replace(/INTEGER PRIMARY KEY AUTOINCREMENT/g, 'SERIAL PRIMARY KEY');
    pgSql = pgSql.replace(/DATETIME DEFAULT CURRENT_TIMESTAMP/g, 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
    pgSql = pgSql.replace(/BOOLEAN DEFAULT 0/g, 'BOOLEAN DEFAULT false');
    pgSql = pgSql.replace(/BOOLEAN DEFAULT 1/g, 'BOOLEAN DEFAULT true');
    
    // Convert SQLite ? placeholders to PostgreSQL $1, $2, etc.
    let paramIndex = 1;
    pgSql = pgSql.replace(/\?/g, () => `$${paramIndex++}`);
    
    // Handle INSERT OR REPLACE
    if (pgSql.includes('INSERT OR REPLACE')) {
      pgSql = pgSql.replace('INSERT OR REPLACE', 'INSERT');
      pgSql += ' ON CONFLICT DO NOTHING';
    }
    
    // Handle boolean values in WHERE clauses
    pgSql = pgSql.replace(/= 0(?=\s|$)/g, '= false');
    pgSql = pgSql.replace(/= 1(?=\s|$)/g, '= true');
    
    // Handle UPDATE SET boolean values
    pgSql = pgSql.replace(/SET accepted = 1/g, 'SET accepted = true');
    pgSql = pgSql.replace(/SET accepted = 0/g, 'SET accepted = false');
    pgSql = pgSql.replace(/SET revoked = 1/g, 'SET revoked = true');
    pgSql = pgSql.replace(/SET revoked = 0/g, 'SET revoked = false');
    
    return pgSql;
  }
};

export default dbWrapper;