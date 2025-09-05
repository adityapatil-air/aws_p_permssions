import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const db = new sqlite3.Database(join(__dirname, 'shipfile.db'));

console.log('Starting database schema migration...');

db.serialize(() => {
  // Check if scope_type column exists in members table
  db.all("PRAGMA table_info(members)", (err, columns) => {
    if (err) {
      console.error('Error checking members table:', err);
      return;
    }
    
    const hasScopeType = columns.some(col => col.name === 'scope_type');
    const hasScopeFolders = columns.some(col => col.name === 'scope_folders');
    
    if (!hasScopeType || !hasScopeFolders) {
      console.log('Adding missing columns to members table...');
      
      if (!hasScopeType) {
        db.run("ALTER TABLE members ADD COLUMN scope_type TEXT", (err) => {
          if (err) {
            console.error('Error adding scope_type to members:', err);
          } else {
            console.log('Added scope_type column to members table');
          }
        });
      }
      
      if (!hasScopeFolders) {
        db.run("ALTER TABLE members ADD COLUMN scope_folders TEXT", (err) => {
          if (err) {
            console.error('Error adding scope_folders to members:', err);
          } else {
            console.log('Added scope_folders column to members table');
          }
        });
      }
    } else {
      console.log('Members table already has required columns');
    }
  });
  
  // Check if scope_type column exists in invitations table
  db.all("PRAGMA table_info(invitations)", (err, columns) => {
    if (err) {
      console.error('Error checking invitations table:', err);
      return;
    }
    
    const hasScopeType = columns.some(col => col.name === 'scope_type');
    const hasScopeFolders = columns.some(col => col.name === 'scope_folders');
    
    if (!hasScopeType || !hasScopeFolders) {
      console.log('Adding missing columns to invitations table...');
      
      if (!hasScopeType) {
        db.run("ALTER TABLE invitations ADD COLUMN scope_type TEXT", (err) => {
          if (err) {
            console.error('Error adding scope_type to invitations:', err);
          } else {
            console.log('Added scope_type column to invitations table');
          }
        });
      }
      
      if (!hasScopeFolders) {
        db.run("ALTER TABLE invitations ADD COLUMN scope_folders TEXT", (err) => {
          if (err) {
            console.error('Error adding scope_folders to invitations:', err);
          } else {
            console.log('Added scope_folders column to invitations table');
          }
        });
      }
    } else {
      console.log('Invitations table already has required columns');
    }
  });
  
  // Wait a bit for async operations to complete
  setTimeout(() => {
    console.log('Database schema migration completed!');
    db.close();
  }, 1000);
});
