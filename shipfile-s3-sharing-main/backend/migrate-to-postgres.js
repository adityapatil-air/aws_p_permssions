import sqlite3 from 'sqlite3';
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// SQLite connection
const sqliteDb = new sqlite3.Database(join(__dirname, 'database.sqlite'));

// PostgreSQL connection
const { Client } = pg;
const pgClient = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const migrateTables = async () => {
  try {
    await pgClient.connect();
    console.log('Connected to PostgreSQL');

    // Tables to migrate
    const tables = [
      'owners',
      'buckets', 
      'organizations',
      'members',
      'invitations',
      'shares',
      'file_ownership',
      'activity_logs'
    ];

    for (const table of tables) {
      console.log(`\nMigrating ${table}...`);
      
      // Get SQLite data
      const sqliteData = await new Promise((resolve, reject) => {
        sqliteDb.all(`SELECT * FROM ${table}`, (err, rows) => {
          if (err) {
            if (err.message.includes('no such table')) {
              console.log(`Table ${table} doesn't exist in SQLite, skipping...`);
              resolve([]);
            } else {
              reject(err);
            }
          } else {
            resolve(rows);
          }
        });
      });

      if (sqliteData.length === 0) {
        console.log(`No data found in ${table}`);
        continue;
      }

      console.log(`Found ${sqliteData.length} records in ${table}`);

      // Clear existing PostgreSQL data
      await pgClient.query(`DELETE FROM ${table}`);
      
      // Insert data into PostgreSQL
      for (const row of sqliteData) {
        const columns = Object.keys(row);
        const values = Object.values(row);
        const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
        
        const query = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
        
        try {
          await pgClient.query(query, values);
        } catch (err) {
          console.error(`Error inserting into ${table}:`, err.message);
          console.error('Row data:', row);
        }
      }
      
      console.log(`✅ Migrated ${sqliteData.length} records to ${table}`);
    }

    console.log('\n🎉 Migration completed successfully!');
    
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    sqliteDb.close();
    await pgClient.end();
  }
};

migrateTables();