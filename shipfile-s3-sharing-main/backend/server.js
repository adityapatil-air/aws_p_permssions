import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { S3Client, CreateBucketCommand, ListObjectsV2Command, PutBucketCorsCommand, GetObjectCommand, DeleteObjectCommand, DeleteObjectsCommand, PutObjectAclCommand, CopyObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import archiver from 'archiver';
import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Readable } from 'stream';
import nodemailer from 'nodemailer';
import sgMail from '@sendgrid/mail';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Health check endpoint for Railway
app.get('/', (req, res) => {
  res.json({ 
    status: 'healthy', 
    message: 'ShipFile Backend API is running',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    message: 'ShipFile Backend API is running',
    timestamp: new Date().toISOString()
  });
});

// Database setup - Railway compatible
const db = process.env.RAILWAY_ENVIRONMENT 
  ? new sqlite3.Database(':memory:')  // In-memory for Railway
  : new sqlite3.Database(join(__dirname, 'shipfile.db'));  // File for local

console.log('SQLite database initialized:', process.env.RAILWAY_ENVIRONMENT ? 'in-memory' : 'file-based');
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS buckets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    region TEXT,
    access_key TEXT,
    secret_key TEXT,
    owner_email TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(name, owner_email)
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS shares (
    id TEXT PRIMARY KEY,
    bucket_name TEXT,
    items TEXT,
    permissions TEXT,
    expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    revoked BOOLEAN DEFAULT 0
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS organizations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bucket_name TEXT UNIQUE,
    name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS invitations (
    id TEXT PRIMARY KEY,
    bucket_name TEXT,
    email TEXT,
    permissions TEXT,
    scope_type TEXT,
    scope_folders TEXT,
    expires_at DATETIME,
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    accepted BOOLEAN DEFAULT 0
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    password TEXT,
    bucket_name TEXT,
    permissions TEXT,
    scope_type TEXT,
    scope_folders TEXT,
    invited_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS file_ownership (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bucket_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    owner_email TEXT NOT NULL,
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(bucket_name, file_path)
  )`);
  
  // Create activity logs table
  db.run(`CREATE TABLE IF NOT EXISTS activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bucket_name TEXT NOT NULL,
    user_email TEXT NOT NULL,
    action TEXT NOT NULL,
    resource_path TEXT NOT NULL,
    old_name TEXT,
    details TEXT,
    timestamp DATETIME NOT NULL
  )`);
  
  // Add missing columns to existing tables
  db.run(`ALTER TABLE members ADD COLUMN invited_by TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.log('Column invited_by already exists or other error:', err.message);
    }
  });
  
  db.run(`ALTER TABLE invitations ADD COLUMN created_by TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.log('Column created_by already exists or other error:', err.message);
    }
  });
});

// Email transporter setup
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT),
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// SendGrid setup
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

// Helper function to log activities
const logActivity = (bucketName, userEmail, action, resourcePath, oldName = null, details = null) => {
  const timestamp = new Date().toISOString();
  db.run(
    'INSERT INTO activity_logs (bucket_name, user_email, action, resource_path, old_name, details, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [bucketName, userEmail, action, resourcePath, oldName, details, timestamp],
    function(err) {
      if (err) {
        console.error('Error logging activity:', err);
      } else {
        console.log(`Activity logged: ${userEmail} ${action} ${resourcePath} at ${timestamp}`);
      }
    }
  );
};

// Helper function to check if user has access to specific files/folders
const checkFolderAccess = (userEmail, bucketName, items) => {
  return new Promise((resolve, reject) => {
    db.get('SELECT owner_email FROM buckets WHERE name = ?', [bucketName], (err, bucket) => {
      if (err || !bucket) {
        return reject(new Error('Bucket not found'));
      }
      
      // Owner has access to everything
      if (bucket.owner_email === userEmail) {
        return resolve(true);
      }
      
      // Check member permissions
      db.get('SELECT scope_type, scope_folders FROM members WHERE email = ? AND bucket_name = ?', [userEmail, bucketName], (err, member) => {
        if (err || !member) {
          return reject(new Error('Access denied'));
        }
        
        // If scope_type is 'entire' or undefined, allow access
        if (!member.scope_type || member.scope_type === 'entire') {
          return resolve(true);
        }
        
        const allowedFolders = JSON.parse(member.scope_folders || '[]');
        
        // Check each item
        for (const item of items) {
          const itemKey = item.key || item;
          
          if (member.scope_type === 'specific') {
            const isAllowed = allowedFolders.some(allowedFolder => {
              return itemKey === allowedFolder || 
                     itemKey.startsWith(allowedFolder + '/') || 
                     allowedFolder.startsWith(itemKey + '/');
            });
            
            if (!isAllowed) {
              return reject(new Error(`You do not have permission to access: ${itemKey}. Allowed folders: ${allowedFolders.join(', ')}`));
            }
          } else if (member.scope_type === 'nested') {
            const isAllowed = allowedFolders.some(folder => 
              itemKey.startsWith(folder) || folder.startsWith(itemKey)
            );
            if (!isAllowed) {
              return reject(new Error(`You do not have permission to access: ${itemKey}`));
            }
          }
        }
        
        resolve(true);
      });
    });
  });
};

// Normalize old permissions to simplified structure
const normalizePermissions = (oldPerms) => {
  const normalized = {
    view: 'none',
    upload: 'none',
    download: false,
    share: false,
    create_folder: false,
    invite_members: false
  };

  // View permissions
  if (oldPerms.viewOnly) normalized.view = 'all';
  if (oldPerms.viewDownload) {
    normalized.view = 'all';
    normalized.download = true;
  }
  
  // Upload permissions (manage = upload + rename + delete)
  if (oldPerms.uploadViewOwn) {
    normalized.upload = 'own';
    normalized.view = 'own';
  }
  if (oldPerms.uploadViewAll) {
    normalized.upload = 'all';
    normalized.view = 'all';
  }
  
  // Extra permissions
  if (oldPerms.generateLinks) normalized.share = true;
  if (oldPerms.createFolder) normalized.create_folder = true;
  if (oldPerms.inviteMembers) normalized.invite_members = true;

  return normalized;
};

// Check if invitee permissions are subset of inviter permissions
const isSubset = (inviterPerms, inviteePerms) => {
  const inviter = normalizePermissions(inviterPerms);
  const invitee = normalizePermissions(inviteePerms);
  
  const scopeLevel = { 'none': 0, 'own': 1, 'all': 2 };
  
  // Check scope permissions
  if (scopeLevel[invitee.view] > scopeLevel[inviter.view]) return false;
  if (scopeLevel[invitee.upload] > scopeLevel[inviter.upload]) return false;
  
  // Check boolean permissions
  if (invitee.download && !inviter.download) return false;
  if (invitee.share && !inviter.share) return false;
  if (invitee.create_folder && !inviter.create_folder) return false;
  if (invitee.invite_members && !inviter.invite_members) return false;
  
  return true;
};

// Permission checking middleware
const checkPermission = (action) => {
  return (req, res, next) => {
    const { bucketName, userEmail, items } = req.body;
    
    if (!userEmail) {
      return res.status(401).json({ error: 'User email required' });
    }
    
    db.get('SELECT owner_email FROM buckets WHERE name = ?', [bucketName], (err, bucket) => {
      if (err || !bucket) {
        return res.status(404).json({ error: 'Bucket not found' });
      }
      
      if (bucket.owner_email === userEmail) {
        return next();
      }
      
      db.get('SELECT permissions, scope_type, scope_folders FROM members WHERE email = ? AND bucket_name = ?', [userEmail, bucketName], (err, member) => {
        if (err || !member) {
          return res.status(403).json({ error: `You do not have permission to perform ${action.toUpperCase()} on this bucket. Please contact the owner for access.` });
        }
        
        const permissions = JSON.parse(member.permissions);
        let hasPermission = false;
        
        switch (action) {
          case 'download':
            hasPermission = permissions.viewDownload || permissions.uploadViewAll;
            break;
          case 'delete':
            hasPermission = permissions.deleteFiles || permissions.deleteOwnFiles;
            break;
          case 'deleteOwn':
            hasPermission = permissions.deleteOwnFiles;
            break;
          case 'share':
            hasPermission = permissions.generateLinks;
            break;
          case 'createFolder':
            hasPermission = permissions.createFolder;
            break;
          case 'invite':
            hasPermission = permissions.inviteMembers;
            break;
        }
        
        if (!hasPermission) {
          let errorMsg = `You do not have permission to perform ${action.toUpperCase()} on this bucket. Please contact the owner for access.`;
          if (action === 'invite') {
            errorMsg = 'You do not have permission to invite members. Please contact the owner for access.';
          }
          return res.status(403).json({ error: errorMsg });
        }
        
        // For invite action, store member permissions for validation
        if (action === 'invite') {
          req.memberPermissions = { permissions, scopeType: member.scope_type, scopeFolders: JSON.parse(member.scope_folders || '[]') };
        }
        
        // For operations that involve specific files/folders, check folder access
        if (items && items.length > 0) {
          checkFolderAccess(userEmail, bucketName, items)
            .then(() => next())
            .catch(error => res.status(403).json({ error: error.message }));
        } else {
          next();
        }
      });
    });
  };
};

// Validate AWS credentials and create bucket
app.post('/api/buckets', async (req, res) => {
  const { accessKey, secretKey, region, bucketName, ownerEmail } = req.body;

  try {
    const s3Client = new S3Client({
      region,
      credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
      },
    });

    const createBucketCommand = new CreateBucketCommand({
      Bucket: bucketName,
      CreateBucketConfiguration: region !== 'us-east-1' ? { LocationConstraint: region } : undefined,
    });

    try {
      await s3Client.send(createBucketCommand);
    } catch (error) {
      if (error.name === 'BucketAlreadyOwnedByYou') {
        // Bucket exists and we own it - that's fine
      } else {
        throw error;
      }
    }

    const corsCommand = new PutBucketCorsCommand({
      Bucket: bucketName,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedHeaders: ['*'],
            AllowedMethods: ['GET', 'PUT', 'POST', 'DELETE', 'HEAD'],
            AllowedOrigins: ['*'],
            ExposeHeaders: ['ETag'],
            MaxAgeSeconds: 3000,
          },
        ],
      },
    });

    await s3Client.send(corsCommand);

    db.run(
      'INSERT INTO buckets (name, region, access_key, secret_key, owner_email) VALUES (?, ?, ?, ?, ?)',
      [bucketName, region, accessKey, secretKey, ownerEmail],
      function(err) {
        if (err) {
          if (err.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({ error: 'You already have a bucket with this name. Please choose a different name.' });
          }
          return res.status(500).json({ error: 'Database error: ' + err.message });
        }
        res.json({ 
          id: this.lastID,
          name: bucketName,
          region,
          created: new Date().toISOString().split('T')[0]
        });
      }
    );

  } catch (error) {
    res.status(400).json({ 
      error: error.name === 'InvalidAccessKeyId' || error.name === 'SignatureDoesNotMatch' 
        ? 'Invalid AWS credentials' 
        : error.message 
    });
  }
});

// Get bucket info
app.get('/api/buckets/:bucketName/info', (req, res) => {
  const { bucketName } = req.params;
  
  db.get('SELECT owner_email FROM buckets WHERE name = ?', [bucketName], (err, bucket) => {
    if (err || !bucket) {
      return res.status(404).json({ error: 'Bucket not found' });
    }
    res.json({ owner_email: bucket.owner_email });
  });
});

// Get buckets for owner
app.get('/api/buckets', (req, res) => {
  const { ownerEmail } = req.query;
  
  if (!ownerEmail) {
    return res.status(400).json({ error: 'Owner email is required' });
  }
  
  db.all('SELECT id, name, region, created_at FROM buckets WHERE owner_email = ?', [ownerEmail], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    
    const buckets = rows.map(row => ({
      id: row.id,
      name: row.name,
      region: row.region,
      created: row.created_at.split(' ')[0]
    }));
    
    // Get member count for each bucket
    let completed = 0;
    buckets.forEach((bucket, index) => {
      db.get('SELECT COUNT(*) as count FROM members WHERE bucket_name = ?', [bucket.name], (err, result) => {
        buckets[index].userCount = result ? result.count : 0;
        completed++;
        if (completed === buckets.length) {
          res.json(buckets);
        }
      });
    });
    
    if (buckets.length === 0) {
      res.json(buckets);
    }
  });
});

// Get buckets for member
app.get('/api/member/buckets', (req, res) => {
  const { memberEmail } = req.query;
  
  if (!memberEmail) {
    return res.status(400).json({ error: 'Member email is required' });
  }
  
  db.all('SELECT bucket_name, permissions, scope_type, scope_folders FROM members WHERE email = ?', [memberEmail], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    
    const buckets = rows.map(row => ({
      bucketName: row.bucket_name,
      permissions: row.permissions,
      scopeType: row.scope_type,
      scopeFolders: row.scope_folders
    }));
    
    res.json(buckets);
  });
});

// Generate pre-signed upload URL
app.post('/api/upload-url', async (req, res) => {
  const { bucketName, fileName, fileType, folderPath = '', userEmail } = req.body;

  try {
    db.get('SELECT access_key, secret_key, region, owner_email FROM buckets WHERE name = ?', [bucketName], async (err, row) => {
      if (err || !row) {
        return res.status(404).json({ error: 'Bucket not found' });
      }
      
      // Check permissions if not owner
      if (row.owner_email !== userEmail) {
        db.get('SELECT permissions, scope_type, scope_folders FROM members WHERE email = ? AND bucket_name = ?', [userEmail, bucketName], async (err, member) => {
          if (err || !member) {
            return res.status(403).json({ error: 'You do not have permission to perform UPLOAD on this bucket. Please contact the owner for access.' });
          }
          
          const permissions = JSON.parse(member.permissions);
          if (!permissions.uploadOnly && !permissions.uploadViewOwn && !permissions.uploadViewAll) {
            return res.status(403).json({ error: 'You do not have permission to perform UPLOAD on this bucket. Please contact the owner for access.' });
          }
          
          // Check folder access for upload
          if (folderPath) {
            try {
              await checkFolderAccess(userEmail, bucketName, [{ key: folderPath }]);
            } catch (error) {
              console.log('Upload folder access denied:', error.message);
              return res.status(403).json({ error: error.message });
            }
          }
          
          generateUploadUrl();
        });
        return;
      }
      
      generateUploadUrl();
      
      async function generateUploadUrl() {
        const s3Client = new S3Client({
          region: row.region,
          credentials: {
            accessKeyId: row.access_key,
            secretAccessKey: row.secret_key,
          },
        });

        // Ensure proper folder path construction
        let s3Key;
        if (folderPath && folderPath.trim()) {
          // Remove any trailing slashes and ensure proper path
          const cleanFolderPath = folderPath.replace(/\/+$/, '');
          s3Key = `${cleanFolderPath}/${fileName}`;
        } else {
          s3Key = fileName;
        }
        
        console.log('Upload S3 Key:', s3Key);
        console.log('Folder Path:', folderPath);

        const command = new PutObjectCommand({
          Bucket: bucketName,
          Key: s3Key,
        });

        const signedUrl = await getSignedUrl(s3Client, command, { 
          expiresIn: 3600,
          unhoistableHeaders: new Set(['content-type'])
        });
        res.json({ uploadUrl: signedUrl });
      }
    });

  } catch (error) {
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
});

// Create folder
app.post('/api/folders', checkPermission('createFolder'), async (req, res) => {
  const { bucketName, folderName, currentPath = '', userEmail } = req.body;

  try {
    db.get('SELECT access_key, secret_key, region, owner_email FROM buckets WHERE name = ?', [bucketName], async (err, row) => {
      if (err || !row) {
        return res.status(404).json({ error: 'Bucket not found' });
      }

      const s3Client = new S3Client({
        region: row.region,
        credentials: {
          accessKeyId: row.access_key,
          secretAccessKey: row.secret_key,
        },
      });

      const folderKey = currentPath ? `${currentPath}/${folderName}/` : `${folderName}/`;
      
      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: folderKey,
        Body: '',
      });

      await s3Client.send(command);
      
      // Log folder creation
      logActivity(bucketName, userEmail, 'create_folder', folderKey);
      
      res.json({ success: true, folderPath: folderKey });
    });

  } catch (error) {
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

// Get all files recursively from all folders
app.get('/api/buckets/:bucketName/files/all', async (req, res) => {
  const { bucketName } = req.params;
  const { userEmail } = req.query;

  try {
    const bucket = await new Promise((resolve, reject) => {
      db.get('SELECT access_key, secret_key, region, owner_email FROM buckets WHERE name = ?', [bucketName], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!bucket) {
      return res.status(404).json({ error: 'Bucket not found' });
    }

    const s3Client = new S3Client({
      region: bucket.region,
      credentials: {
        accessKeyId: bucket.access_key,
        secretAccessKey: bucket.secret_key,
      },
    });

    // Get all objects in bucket (no delimiter for recursive)
    const command = new ListObjectsV2Command({ 
      Bucket: bucketName,
      MaxKeys: 1000
    });
    const response = await s3Client.send(command);

    const items = [];
    const folderSet = new Set();

    if (response.Contents) {
      response.Contents.forEach(obj => {
        if (obj.Key.endsWith('/')) {
          // Folder marker
          const folderName = obj.Key.slice(0, -1).split('/').pop();
          const parentPath = obj.Key.includes('/') ? obj.Key.substring(0, obj.Key.lastIndexOf('/', obj.Key.length - 2)) : '';
          
          if (folderName && !folderSet.has(obj.Key)) {
            folderSet.add(obj.Key);
            items.push({
              id: obj.Key,
              name: folderName,
              type: 'folder',
              modified: obj.LastModified.toISOString().split('T')[0],
              folderPath: parentPath
            });
          }
        } else {
          // File
          const fileName = obj.Key.split('/').pop();
          const folderPath = obj.Key.includes('/') ? obj.Key.substring(0, obj.Key.lastIndexOf('/')) : '';
          
          // Also add parent folders if they don't exist as folder markers
          if (folderPath) {
            const pathParts = folderPath.split('/');
            let currentPath = '';
            
            pathParts.forEach((part, index) => {
              const parentPath = pathParts.slice(0, index).join('/');
              currentPath = currentPath ? `${currentPath}/${part}` : part;
              const folderKey = `${currentPath}/`;
              
              if (!folderSet.has(folderKey)) {
                folderSet.add(folderKey);
                items.push({
                  id: folderKey,
                  name: part,
                  type: 'folder',
                  modified: new Date().toISOString().split('T')[0],
                  folderPath: parentPath
                });
              }
            });
          }
          
          items.push({
            id: obj.Key,
            name: fileName,
            type: 'file',
            size: `${(obj.Size / 1024 / 1024).toFixed(2)} MB`,
            modified: obj.LastModified.toISOString().split('T')[0],
            fileType: fileName.split('.').pop(),
            folderPath: folderPath
          });
        }
      });
    }

    // Apply permission filtering
    if (userEmail && bucket.owner_email !== userEmail) {
      const member = await new Promise((resolve) => {
        db.get('SELECT scope_type, scope_folders FROM members WHERE email = ? AND bucket_name = ?', [userEmail, bucketName], (err, row) => {
          resolve(row);
        });
      });

      if (member && member.scope_type === 'specific') {
        const allowedFolders = JSON.parse(member.scope_folders || '[]');
        const filteredItems = items.filter(item => {
          if (!item.folderPath) return false; // Root files not allowed for scoped users
          
          // Check if item is within any allowed folder prefix
          return allowedFolders.some(folder => 
            item.folderPath === folder || item.folderPath.startsWith(folder + '/')
          );
        });
        return res.json(filteredItems);
      }
    }

    res.json(items);

  } catch (error) {
    console.error('Error listing all files:', error);
    res.status(500).json({ error: 'Failed to list files' });
  }
});

// List files in bucket
app.get('/api/buckets/:bucketName/files', async (req, res) => {
  const { bucketName } = req.params;
  const { prefix = '', userEmail } = req.query;

  try {
    // Get bucket info
    const bucket = await new Promise((resolve, reject) => {
      db.get('SELECT access_key, secret_key, region, owner_email FROM buckets WHERE name = ?', [bucketName], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!bucket) {
      return res.status(404).json({ error: 'Bucket not found' });
    }

    // Get S3 items
    const s3Client = new S3Client({
      region: bucket.region,
      credentials: {
        accessKeyId: bucket.access_key,
        secretAccessKey: bucket.secret_key,
      },
    });

    const command = new ListObjectsV2Command({ 
      Bucket: bucketName,
      Prefix: prefix || '',
      Delimiter: '/'
    });
    const response = await s3Client.send(command);

    const items = [];

    if (response.CommonPrefixes) {
      response.CommonPrefixes.forEach(prefixObj => {
        const folderName = prefixObj.Prefix.replace(prefix || '', '').replace('/', '');
        if (folderName) {
          items.push({
            id: prefixObj.Prefix,
            name: folderName,
            type: 'folder',
            modified: new Date().toISOString().split('T')[0]
          });
        }
      });
    }

    if (response.Contents) {
      response.Contents.forEach(obj => {
        if (!obj.Key.endsWith('/')) {
          const fileName = obj.Key.replace(prefix || '', '');
          if (fileName && !fileName.includes('/')) {
            items.push({
              id: obj.Key,
              name: fileName,
              type: 'file',
              size: `${(obj.Size / 1024 / 1024).toFixed(2)} MB`,
              modified: obj.LastModified.toISOString().split('T')[0],
              fileType: fileName.split('.').pop()
            });
          }
        }
      });
    }

    // Check if user is owner
    if (userEmail && bucket.owner_email === userEmail) {
      return res.json(items);
    }

    // If no userEmail, check if there are any members for this bucket
    if (!userEmail) {
      const memberCount = await new Promise((resolve) => {
        db.get('SELECT COUNT(*) as count FROM members WHERE bucket_name = ?', [bucketName], (err, result) => {
          resolve(result ? result.count : 0);
        });
      });
      
      // If no members exist, treat as owner access
      if (memberCount === 0) {
        return res.json(items);
      }
      
      // If members exist but no userEmail provided, deny access
      return res.status(403).json({ error: 'Access denied - authentication required' });
    }

    // Check member permissions and apply filtering
    const member = await new Promise((resolve, reject) => {
      db.get('SELECT permissions, scope_type, scope_folders FROM members WHERE email = ? AND bucket_name = ?', [userEmail, bucketName], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!member) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Check if member can only view own files
    const permissions = JSON.parse(member.permissions || '{}');
    console.log('=== PERMISSION CHECK DEBUG ===');
    console.log('User:', userEmail);
    console.log('Bucket:', bucketName);
    console.log('Raw permissions:', member.permissions);
    console.log('Parsed permissions:', permissions);
    console.log('uploadViewOwn:', permissions.uploadViewOwn);
    console.log('uploadViewAll:', permissions.uploadViewAll);
    console.log('viewOnly:', permissions.viewOnly);
    console.log('viewDownload:', permissions.viewDownload);
    
    // Check if member should only see own files
    // This happens when: uploadViewOwn=true OR (uploadOnly=true AND no view-all permissions)
    const shouldFilterToOwnFiles = permissions.uploadViewOwn || 
                                   (permissions.uploadOnly && !permissions.viewOnly && !permissions.viewDownload && !permissions.uploadViewAll);
    
    if (shouldFilterToOwnFiles) {
      console.log('✅ Member should only see own files - filtering...');
      
      // Get files owned by this member
      const ownedFiles = await new Promise((resolve) => {
        db.all('SELECT file_path FROM file_ownership WHERE bucket_name = ? AND owner_email = ?', [bucketName, userEmail], (err, rows) => {
          resolve(rows || []);
        });
      });
      
      const ownedFilePaths = new Set(ownedFiles.map(f => f.file_path));
      console.log('Owned file paths for', userEmail, ':', Array.from(ownedFilePaths));
      
      // Filter items to only show owned files and folders
      const filteredItems = items.filter(item => {
        if (item.type === 'folder') return true; // Always show folders
        return ownedFilePaths.has(item.id);
      });
      
      console.log('Filtered items count:', filteredItems.length, 'from', items.length);
      
      // Apply folder scoping if needed
      if (member.scope_type === 'specific') {
        const allowedFolders = JSON.parse(member.scope_folders || '[]');
        const scopedItems = filteredItems.filter(item => {
          if (item.type === 'folder') {
            if (!prefix) {
              // Root directory - show virtual folders
              return allowedFolders.some(folder => folder.startsWith(item.name));
            } else {
              // Inside folder - check if current path is allowed
              const currentPath = prefix.replace(/\/$/, '');
              return allowedFolders.some(folder => folder.startsWith(currentPath));
            }
          } else {
            // For files, check if they're in allowed folders
            const filePath = item.id;
            return allowedFolders.some(folder => filePath.startsWith(folder));
          }
        });
        return res.json(scopedItems);
      }
      
      return res.json(filteredItems);
    }

    // Apply folder scoping
    if (member.scope_type === 'specific') {
      const allowedFolders = JSON.parse(member.scope_folders || '[]');
      
      console.log('=== FOLDER ACCESS DEBUG ===');
      console.log('User:', userEmail);
      console.log('Prefix:', prefix);
      console.log('Allowed folders:', allowedFolders);
      console.log('Available items:', items.map(i => ({name: i.name, type: i.type})));
      
      if (!prefix) {
        // Root directory - show the deepest allowed folders directly with virtual mapping
        console.log('=== SCOPED MEMBER ROOT ACCESS ===');
        console.log('User:', userEmail);
        console.log('Allowed folders from DB:', allowedFolders);
        console.log('Member scope data:', member);
        
        // Remove duplicates and create virtual folders
        const uniquePaths = [...new Set(allowedFolders)];
        const virtualFolders = uniquePaths.map(path => {
          const parts = path.split('/');
          const folderName = parts[parts.length - 1]; // Last part (deepest folder)
          
          return {
            id: path + '/', // Use full S3 path as ID
            name: folderName,
            type: 'folder',
            modified: new Date().toISOString().split('T')[0],
            virtualPath: path // Store the real path for upload mapping
          };
        });
        
        console.log('Virtual folders to show at root:', virtualFolders);
        return res.json(virtualFolders);
      } else {
        // Inside folder - show only items that are in the allowed path
        const currentPath = prefix.replace(/\/$/, '');
        
        // Check if current path leads to any allowed folder
        const relevantAllowedPaths = allowedFolders.filter(allowedPath => 
          allowedPath.startsWith(currentPath + '/') || allowedPath === currentPath
        );
        
        if (relevantAllowedPaths.length === 0) {
          return res.status(403).json({ error: 'You do not have permission to view this folder.' });
        }
        
        // Filter items to show only those in the allowed path
        const filteredItems = items.filter(item => {
          if (item.type === 'file') {
            // For files, check if we're in an allowed folder and user has view permissions
            return relevantAllowedPaths.some(allowedPath => currentPath === allowedPath);
          } else {
            // For folders, check if this folder is part of any allowed path
            const itemPath = currentPath ? `${currentPath}/${item.name}` : item.name;
            return relevantAllowedPaths.some(allowedPath => 
              allowedPath.startsWith(itemPath + '/') || allowedPath === itemPath
            );
          }
        });
        
        console.log('Current path:', currentPath);
        console.log('Relevant allowed paths:', relevantAllowedPaths);
        console.log('Filtered items:', filteredItems.map(i => ({name: i.name, type: i.type})));
        
        return res.json(filteredItems);
      }
    } else if (member.scope_type === 'nested') {
      const allowedFolders = JSON.parse(member.scope_folders || '[]');
      
      if (!prefix) {
        const filteredItems = items.filter(item => 
          item.type === 'folder' && allowedFolders.includes(item.name)
        );
        return res.json(filteredItems);
      } else {
        const currentPath = prefix.replace(/\/$/, '');
        const isAllowed = allowedFolders.some(folder => 
          currentPath.startsWith(folder) || folder.startsWith(currentPath)
        );
        
        if (!isAllowed) {
          return res.status(403).json({ error: 'You do not have permission to view this folder.' });
        }
        // If allowed, show all items in this folder
        return res.json(items);
      }
    }
    // If scope_type is 'entire' or undefined, show all items
    res.json(items);

  } catch (error) {
    console.error('Error listing files:', error);
    res.status(500).json({ error: 'Failed to list files' });
  }
});

// Preview file (inline view)
app.get('/api/preview/:bucketName/*', async (req, res) => {
  const { bucketName } = req.params;
  const fileKey = req.params[0];
  const { userEmail } = req.query;

  try {
    const bucket = await new Promise((resolve, reject) => {
      db.get('SELECT access_key, secret_key, region, owner_email FROM buckets WHERE name = ?', [bucketName], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!bucket) {
      return res.status(404).send('Bucket not found');
    }

    // Basic permission check - if userEmail provided, verify access
    if (userEmail && bucket.owner_email !== userEmail) {
      const member = await new Promise((resolve) => {
        db.get('SELECT permissions FROM members WHERE email = ? AND bucket_name = ?', [userEmail, bucketName], (err, row) => {
          resolve(row);
        });
      });
      
      if (!member) {
        return res.status(403).send('Access denied');
      }
    }

    const s3Client = new S3Client({
      region: bucket.region,
      credentials: {
        accessKeyId: bucket.access_key,
        secretAccessKey: bucket.secret_key,
      },
    });

    const decodedFileKey = decodeURIComponent(fileKey);
    const command = new GetObjectCommand({ Bucket: bucketName, Key: decodedFileKey });
    const response = await s3Client.send(command);
    
    res.setHeader('Content-Type', response.ContentType || 'application/octet-stream');
    res.setHeader('Content-Disposition', 'inline');
    
    response.Body.pipe(res);

  } catch (error) {
    console.error('Preview error:', error);
    res.status(500).send('Preview failed');
  }
});

// Download files/folders
app.post('/api/download', checkPermission('download'), async (req, res) => {
  const { bucketName, items, userEmail } = req.body;

  try {
    db.get('SELECT access_key, secret_key, region, owner_email FROM buckets WHERE name = ?', [bucketName], async (err, row) => {
      if (err || !row) {
        return res.status(404).json({ error: 'Bucket not found' });
      }

      const s3Client = new S3Client({
        region: row.region,
        credentials: {
          accessKeyId: row.access_key,
          secretAccessKey: row.secret_key,
        },
      });

      if (items.length === 1 && items[0].type === 'file') {
        const fileKey = items[0].key;
        const command = new GetObjectCommand({ Bucket: bucketName, Key: fileKey });
        const response = await s3Client.send(command);
        
        res.setHeader('Content-Type', response.ContentType || 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${items[0].name}"`);
        
        response.Body.pipe(res);
      } else {
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', 'attachment; filename="download.zip"');
        
        const archive = archiver('zip', { zlib: { level: 9 } });
        archive.pipe(res);
        
        const filesToDownload = [];
        
        for (const item of items) {
          if (item.type === 'folder') {
            const folderKey = item.key.endsWith('/') ? item.key : item.key + '/';
            const listCommand = new ListObjectsV2Command({ Bucket: bucketName, Prefix: folderKey });
            const listResponse = await s3Client.send(listCommand);
            
            if (listResponse.Contents) {
              listResponse.Contents.forEach(obj => {
                if (!obj.Key.endsWith('/')) {
                  filesToDownload.push(obj.Key);
                }
              });
            }
          } else {
            filesToDownload.push(item.key);
          }
        }
        
        for (const fileKey of filesToDownload) {
          try {
            const command = new GetObjectCommand({ Bucket: bucketName, Key: fileKey });
            const response = await s3Client.send(command);
            
            archive.append(response.Body, { name: fileKey });
          } catch (error) {
            console.error(`Failed to add ${fileKey} to zip:`, error);
          }
        }
        
        archive.finalize();
      }
    });

  } catch (error) {
    res.status(500).json({ error: 'Download failed' });
  }
});

// Generate share links
app.post('/api/share', checkPermission('share'), async (req, res) => {
  const { bucketName, items, shareType, expiryHours, userEmail } = req.body;

  try {
    db.get('SELECT access_key, secret_key, region, owner_email FROM buckets WHERE name = ?', [bucketName], async (err, row) => {
      if (err || !row) {
        return res.status(404).json({ error: 'Bucket not found' });
      }

      const s3Client = new S3Client({
        region: row.region,
        credentials: {
          accessKeyId: row.access_key,
          secretAccessKey: row.secret_key,
        },
      });

      const expiresIn = shareType === 'limited' ? expiryHours * 3600 : 604800;
      
      if (items.length === 1 && items[0].type === 'file') {
        const fileKey = items[0].key;
        const command = new GetObjectCommand({ 
          Bucket: bucketName, 
          Key: fileKey
        });
        
        const shareUrl = await getSignedUrl(s3Client, command, { expiresIn });
        
        // Log share activity
        logActivity(bucketName, userEmail, 'share', fileKey, null, `${shareType} - ${expiryHours}h`);
        
        res.json({ shareUrl });
      } else {
        const shareId = Math.random().toString(36).substring(2, 15);
        const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
        
        // Check if sharing a single folder
        const isSingleFolder = items.length === 1 && items[0].type === 'folder';
        
        db.run(
          'INSERT INTO shares (id, bucket_name, items, permissions, expires_at) VALUES (?, ?, ?, ?, ?)',
          [shareId, bucketName, JSON.stringify(items), 'read', expiresAt],
          function(err) {
            if (err) {
              return res.status(500).json({ error: 'Database error' });
            }
            
            const shareUrl = `${process.env.FRONTEND_URL}/shared/${shareId}`;
            
            // Log share activity for multiple items
            const resourcePath = items.length === 1 ? items[0].key : `${items.length} items`;
            logActivity(bucketName, userEmail, 'share', resourcePath, null, `${shareType} - ${expiryHours}h`);
            
            res.json({ shareUrl });
          }
        );
      }
    });

  } catch (error) {
    res.status(500).json({ error: 'Failed to generate share link' });
  }
});

// Delete files/folders
app.delete('/api/delete', checkPermission('delete'), async (req, res) => {
  const { bucketName, items, userEmail } = req.body;
  
  console.log('=== DELETE REQUEST RECEIVED ===');
  console.log('Bucket:', bucketName);
  console.log('Items to delete:', items);
  console.log('User email:', userEmail);

  // Check ownership for non-owners with limited permissions
  const bucket = await new Promise((resolve, reject) => {
    db.get('SELECT owner_email FROM buckets WHERE name = ?', [bucketName], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });

  if (bucket && bucket.owner_email !== userEmail) {
    const member = await new Promise((resolve, reject) => {
      db.get('SELECT permissions FROM members WHERE email = ? AND bucket_name = ?', [userEmail, bucketName], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (member) {
      const permissions = JSON.parse(member.permissions);
      console.log('Delete permissions check:', permissions);

      // If user can only delete own files, check ownership
      if (!permissions.deleteFiles && !permissions.uploadViewAll && (permissions.deleteOwnFiles || permissions.uploadViewOwn)) {
        console.log('Checking ownership for delete operation...');
        for (const item of items) {
          const ownership = await new Promise((resolve, reject) => {
            db.get('SELECT owner_email FROM file_ownership WHERE bucket_name = ? AND file_path = ?', [bucketName, item], (err, row) => {
              if (err) reject(err);
              else resolve(row);
            });
          });

          console.log(`Ownership check for ${item}:`, ownership);
          console.log(`User email: ${userEmail}`);
          
          if (!ownership) {
            console.log(`No ownership record found for: ${item}`);
            return res.status(403).json({ error: `You can only delete files you uploaded. Cannot delete: ${item} (no ownership record)` });
          }
          
          if (ownership.owner_email !== userEmail) {
            console.log(`Ownership mismatch: ${ownership.owner_email} vs ${userEmail}`);
            return res.status(403).json({ error: `You can only delete files you uploaded. Cannot delete: ${item}` });
          }
        }
        console.log('All ownership checks passed');
      }
    }
  }

  try {
    db.get('SELECT access_key, secret_key, region, owner_email FROM buckets WHERE name = ?', [bucketName], async (err, row) => {
      if (err || !row) {
        return res.status(404).json({ error: 'Bucket not found' });
      }

      const s3Client = new S3Client({
        region: row.region,
        credentials: {
          accessKeyId: row.access_key,
          secretAccessKey: row.secret_key,
        },
      });

      const objectsToDelete = [];
      
      console.log('Processing items for deletion:', items);
      
      for (const item of items) {
        console.log('Processing item:', item);
        
        if (item.endsWith('/')) {
          console.log('Item is folder, checking for contents...');
          const listCommand = new ListObjectsV2Command({ Bucket: bucketName, Prefix: item });
          const listResponse = await s3Client.send(listCommand);
          
          if (listResponse.Contents) {
            console.log('Found contents for folder:', listResponse.Contents.length);
            listResponse.Contents.forEach(obj => {
              console.log('Adding to delete list:', obj.Key);
              objectsToDelete.push({ Key: obj.Key });
            });
          }
        } else {
          console.log('Item is file, adding directly:', item);
          objectsToDelete.push({ Key: item });
        }
      }
      
      console.log('Final objects to delete:', objectsToDelete);

      if (objectsToDelete.length > 0) {
        console.log('Objects to delete from S3:', objectsToDelete);
        
        const deleteCommand = new DeleteObjectsCommand({
          Bucket: bucketName,
          Delete: { Objects: objectsToDelete }
        });
        
        console.log('Sending delete command to S3...');
        const deleteResult = await s3Client.send(deleteCommand);
        console.log('S3 delete result:', deleteResult);
        
        // Clean up ownership records for deleted files
        const deletedKeys = objectsToDelete.map(obj => obj.Key);
        console.log('Cleaning up ownership records for:', deletedKeys);
        
        for (const key of deletedKeys) {
          db.run('DELETE FROM file_ownership WHERE bucket_name = ? AND file_path = ?', [bucketName, key], (err) => {
            if (err) console.error('Error cleaning up ownership record:', err);
            else console.log('Cleaned up ownership record for:', key);
          });
          
          // Log delete activity
          const action = key.endsWith('/') ? 'delete_folder' : 'delete';
          logActivity(bucketName, userEmail, action, key);
        }
      }
      
      console.log('Delete operation completed successfully');
      res.json({ success: true, deleted: objectsToDelete.length });
    });

  } catch (error) {
    res.status(500).json({ error: 'Delete failed' });
  }
});

// Create organization
app.post('/api/organizations', async (req, res) => {
  const { bucketName, organizationName } = req.body;
  
  try {
    db.run(
      'INSERT INTO organizations (bucket_name, name) VALUES (?, ?)',
      [bucketName, organizationName],
      function(err) {
        if (err) {
          return res.status(500).json({ error: 'Failed to create organization' });
        }
        res.json({ id: this.lastID, name: organizationName });
      }
    );
  } catch (error) {
    res.status(500).json({ error: 'Failed to create organization' });
  }
});

// Get folders in bucket for permission selection
app.get('/api/buckets/:bucketName/folders', async (req, res) => {
  const { bucketName } = req.params;
  const { ownerEmail } = req.query;
  
  try {
    db.get('SELECT access_key, secret_key, region, owner_email FROM buckets WHERE name = ? AND owner_email = ?', [bucketName, ownerEmail], async (err, row) => {
      if (err || !row) {
        return res.status(404).json({ error: 'Bucket not found or access denied' });
      }

      const s3Client = new S3Client({
        region: row.region,
        credentials: {
          accessKeyId: row.access_key,
          secretAccessKey: row.secret_key,
        },
      });

      const command = new ListObjectsV2Command({ 
        Bucket: bucketName,
        Delimiter: '/'
      });
      const response = await s3Client.send(command);

      const folders = [];
      if (response.CommonPrefixes) {
        response.CommonPrefixes.forEach(prefixObj => {
          const folderName = prefixObj.Prefix.replace('/', '');
          if (folderName) {
            folders.push(folderName);
          }
        });
      }

      res.json(folders);
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch folders' });
  }
});

// Get organization for bucket
app.get('/api/organizations/:bucketName', async (req, res) => {
  const { bucketName } = req.params;
  
  try {
    db.get('SELECT * FROM organizations WHERE bucket_name = ?', [bucketName], (err, org) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      res.json(org || null);
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get organization' });
  }
});

// Send invitation
app.post('/api/invite', checkPermission('invite'), async (req, res) => {
  const { bucketName, email, permissions, scopeType, scopeFolders, userEmail } = req.body;
  
  console.log('=== INVITATION DEBUG ===');
  console.log('Request body:', { bucketName, email, permissions, scopeType, scopeFolders, userEmail });
  console.log('Member permissions:', req.memberPermissions);
  console.log('Environment variables:', {
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_USER: process.env.SMTP_USER ? 'SET' : 'NOT SET',
    SMTP_PASS: process.env.SMTP_PASS ? 'SET' : 'NOT SET',
    FRONTEND_URL: process.env.FRONTEND_URL
  });
  
  try {
    // Check if member is trying to grant permissions they don't have
    if (req.memberPermissions) {
      const memberPerms = req.memberPermissions.permissions;
      const memberScopeType = req.memberPermissions.scopeType;
      const memberScopeFolders = req.memberPermissions.scopeFolders;
      
      console.log('Validating permissions...');
      console.log('Member perms:', memberPerms);
      console.log('Requested perms:', permissions);
      
      // Use isSubset to validate permission escalation
      if (!isSubset(memberPerms, permissions)) {
        console.log('Permission escalation detected');
        return res.status(403).json({ error: 'You can\'t grant permissions higher than your own.' });
      }
      
      console.log('Permission validation passed');
      
      // Check scope restrictions
      if (scopeType === 'specific' && memberScopeType === 'specific') {
        const requestedFolders = scopeFolders || [];
        const memberAllowedFolders = Array.isArray(memberScopeFolders) ? memberScopeFolders : JSON.parse(memberScopeFolders || '[]');
        
        console.log('Checking scope restrictions...');
        console.log('Member allowed folders:', memberAllowedFolders);
        console.log('Requested folders:', requestedFolders);
        
        // Check if requested folders are within member's scope
        const invalidFolders = requestedFolders.filter(folder => {
          return !memberAllowedFolders.some(allowedFolder => {
            // Allow exact match or subfolder access
            return folder === allowedFolder || 
                   folder.startsWith(allowedFolder + '/') || 
                   allowedFolder.startsWith(folder + '/');
          });
        });
        
        if (invalidFolders.length > 0) {
          console.log('Invalid folders detected:', invalidFolders);
          return res.status(403).json({ error: `You can't grant access to folders outside your scope: ${invalidFolders.join(', ')}` });
        }
      } else if (scopeType === 'entire' && memberScopeType === 'specific') {
        console.log('Entire bucket access denied for limited member');
        return res.status(403).json({ error: 'You can\'t grant entire bucket access when you have limited access.' });
      }
      
      console.log('Scope validation passed');
    }
    
    console.log('Looking for organization...');
    db.get('SELECT * FROM organizations WHERE bucket_name = ?', [bucketName], async (err, org) => {
      if (err) {
        console.error('Database error finding organization:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      if (!org) {
        console.log('No organization found for bucket:', bucketName);
        return res.status(404).json({ error: 'Organization not found for this bucket' });
      }
      
      console.log('Organization found:', org.name);
      
      const inviteToken = uuidv4();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      
      console.log('Creating invitation in database...');
      db.run(
        'INSERT INTO invitations (id, bucket_name, email, permissions, scope_type, scope_folders, expires_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [inviteToken, bucketName, email, JSON.stringify(permissions), scopeType, JSON.stringify(scopeFolders || []), expiresAt, userEmail],
        async function(err) {
          if (err) {
            console.error('Database error creating invitation:', err);
            return res.status(500).json({ error: 'Failed to create invitation: ' + err.message });
          }
          
          console.log('Invitation created successfully');
          
          const inviteLink = `${process.env.FRONTEND_URL}/accept-invite/${inviteToken}`;
          
          // Always succeed invitation creation, email is optional
          let emailSent = false;
          try {
            console.log('Attempting to send email...');
            console.log('SendGrid API Key configured:', !!process.env.SENDGRID_API_KEY);
            console.log('SMTP configured:', !!process.env.SMTP_HOST);
            
            if (process.env.SENDGRID_API_KEY) {
              console.log('Sending email via SendGrid Web API...');
              const msg = {
                to: email,
                from: 'nameisnanna@gmail.com', // SendGrid verified sender
                subject: "You've been invited to join ShipFile",
                html: `
                  <h2>You've been invited to join ShipFile</h2>
                  <p>You have been invited to join the organization <strong>${org.name}</strong>.</p>
                  <p>Click the link below to accept the invitation:</p>
                  <a href="${inviteLink}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Accept Invitation</a>
                  <p>This invitation will expire in 7 days.</p>
                `
              };
              console.log('SendGrid message:', msg);
              
              const result = await sgMail.send(msg);
              console.log('Email send result:', result[0].statusCode);
              emailSent = true;
              console.log('Email sent successfully to:', email);
            } else if (transporter && process.env.SMTP_HOST) {
              console.log('Sending email via SMTP...');
              const mailOptions = {
                from: '"ShipFile" <adityapatil.air@gmail.com>',
                to: email,
                subject: "You've been invited to join ShipFile",
                html: `
                  <h2>You've been invited to join ShipFile</h2>
                  <p>You have been invited to join the organization <strong>${org.name}</strong>.</p>
                  <p>Click the link below to accept the invitation:</p>
                  <a href="${inviteLink}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Accept Invitation</a>
                  <p>This invitation will expire in 7 days.</p>
                `
              };
              
              const result = await transporter.sendMail(mailOptions);
              console.log('Email send result:', result);
              emailSent = true;
              console.log('Email sent successfully to:', email);
            } else {
              console.log('No email service configured, providing invite link instead');
            }
          } catch (emailError) {
            console.error('Email send failed - Full error:', emailError);
            console.error('Error message:', emailError.message);
            console.error('Error stack:', emailError.stack);
            emailSent = false;
          }
          
          // Always return success with invite link as fallback
          res.json({ 
            message: 'Invitation created successfully',
            email: email,
            inviteLink: inviteLink,
            emailSent: emailSent
          });
        }
      );
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to send invitation' });
  }
});

// Get invitation details
app.get('/api/invite/:token', async (req, res) => {
  const { token } = req.params;
  
  try {
    db.get('SELECT i.*, o.name as org_name FROM invitations i JOIN organizations o ON i.bucket_name = o.bucket_name WHERE i.id = ? AND i.accepted = 0', [token], (err, invite) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      if (!invite) {
        return res.status(404).json({ error: 'Invitation not found or already accepted' });
      }
      
      if (new Date(invite.expires_at) < new Date()) {
        return res.status(410).json({ error: 'Invitation has expired' });
      }
      
      res.json({
        email: invite.email,
        permissions: invite.permissions,
        orgName: invite.org_name,
        bucketName: invite.bucket_name
      });
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get invitation' });
  }
});

// Accept invitation
app.post('/api/invite/:token/accept', async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;
  
  try {
    db.get('SELECT * FROM invitations WHERE id = ? AND accepted = 0', [token], (err, invite) => {
      if (err || !invite) {
        return res.status(404).json({ error: 'Invitation not found' });
      }
      
      if (new Date(invite.expires_at) < new Date()) {
        return res.status(410).json({ error: 'Invitation has expired' });
      }
      
      // Get who sent the invitation
      db.get('SELECT created_by FROM invitations WHERE id = ?', [token], (err, inviteData) => {
        const invitedBy = inviteData?.created_by || 'owner';
        
        // Check if member already exists for this bucket
        db.get('SELECT * FROM members WHERE email = ? AND bucket_name = ?', [invite.email, invite.bucket_name], (err, existingMember) => {
          if (err) {
            return res.status(500).json({ error: 'Database error checking existing member' });
          }
          
          if (existingMember) {
            // Update existing member's permissions
            db.run(
              'UPDATE members SET password = ?, permissions = ?, scope_type = ?, scope_folders = ?, invited_by = ? WHERE email = ? AND bucket_name = ?',
              [password, invite.permissions, invite.scope_type, invite.scope_folders, invitedBy, invite.email, invite.bucket_name],
              function(err) {
                if (err) {
                  return res.status(500).json({ error: 'Failed to update member account' });
                }
                
                db.run('UPDATE invitations SET accepted = 1 WHERE id = ?', [token], (err) => {
                  if (err) {
                    return res.status(500).json({ error: 'Failed to accept invitation' });
                  }
                  
                  res.json({ 
                    message: 'Account updated successfully',
                    bucketName: invite.bucket_name,
                    email: invite.email,
                    scopeType: invite.scope_type,
                    scopeFolders: invite.scope_folders
                  });
                });
              }
            );
          } else {
            // Insert new member for this bucket
            db.run(
              'INSERT INTO members (email, password, bucket_name, permissions, scope_type, scope_folders, invited_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
              [invite.email, password, invite.bucket_name, invite.permissions, invite.scope_type, invite.scope_folders, invitedBy],
              function(err) {
                if (err) {
                  return res.status(500).json({ error: 'Failed to create member account' });
                }
                
                db.run('UPDATE invitations SET accepted = 1 WHERE id = ?', [token], (err) => {
                  if (err) {
                    return res.status(500).json({ error: 'Failed to accept invitation' });
                  }
                  
                  res.json({ 
                    message: 'Account created successfully',
                    bucketName: invite.bucket_name,
                    email: invite.email,
                    scopeType: invite.scope_type,
                    scopeFolders: invite.scope_folders
                  });
                });
              }
            );
          }
        });
      });
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to accept invitation' });
  }
});

// Member login
app.post('/api/member/login', async (req, res) => {
  const { email, password } = req.body;
  
  try {
    // Get all buckets this member belongs to
    db.all('SELECT * FROM members WHERE email = ? AND password = ?', [email, password], (err, members) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      if (!members || members.length === 0) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }
      
      // Return all buckets the member has access to
      const buckets = members.map(member => ({
        bucketName: member.bucket_name,
        permissions: member.permissions,
        scopeType: member.scope_type,
        scopeFolders: member.scope_folders
      }));
      
      res.json({
        message: 'Login successful',
        email: email,
        buckets: buckets
      });
    });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get shared content (files and folders)
app.get('/api/shared/:shareId', async (req, res) => {
  const { shareId } = req.params;
  const { path = '' } = req.query;
  
  console.log('Shared folder request:', shareId, 'path:', path);
  
  try {
    const share = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM shares WHERE id = ? AND revoked = 0', [shareId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!share) {
      return res.status(404).json({ error: 'Share not found or expired' });
    }
    
    if (new Date(share.expires_at) < new Date()) {
      return res.status(410).json({ error: 'Share has expired' });
    }
    
    // Get bucket info
    const bucket = await new Promise((resolve, reject) => {
      db.get('SELECT access_key, secret_key, region FROM buckets WHERE name = ?', [share.bucket_name], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!bucket) {
      return res.status(404).json({ error: 'Bucket not found' });
    }
    
    const s3Client = new S3Client({
      region: bucket.region,
      credentials: {
        accessKeyId: bucket.access_key,
        secretAccessKey: bucket.secret_key,
      },
    });
    
    const sharedItems = JSON.parse(share.items);
    let allFiles = [];
    
    console.log('Processing shared items:', sharedItems);
    
    for (const item of sharedItems) {
      if (item.type === 'folder') {
        const folderKey = item.key.endsWith('/') ? item.key : item.key + '/';
        const listCommand = new ListObjectsV2Command({ Bucket: share.bucket_name, Prefix: folderKey });
        const listResponse = await s3Client.send(listCommand);
        
        if (listResponse.Contents) {
          listResponse.Contents.forEach(obj => {
            if (!obj.Key.endsWith('/')) {
              allFiles.push({
                name: obj.Key.split('/').pop(),
                key: obj.Key,
                type: 'file',
                size: `${(obj.Size / 1024 / 1024).toFixed(2)} MB`,
                modified: obj.LastModified.toISOString().split('T')[0],
                fileType: obj.Key.split('.').pop(),
                folderPath: obj.Key.includes('/') ? obj.Key.substring(0, obj.Key.lastIndexOf('/')) : ''
              });
            }
          });
        }
      } else {
        // Add individual files
        allFiles.push({
          name: item.name,
          key: item.key,
          type: 'file',
          size: 'N/A',
          modified: 'N/A',
          fileType: item.name.split('.').pop(),
          folderPath: item.key.includes('/') ? item.key.substring(0, item.key.lastIndexOf('/')) : ''
        });
      }
    }
    
    res.json({
      shareId: shareId,
      bucketName: share.bucket_name,
      files: allFiles,
      expiresAt: share.expires_at,
      sharedItems: sharedItems
    });
    
  } catch (error) {
    console.error('Shared folder error:', error);
    res.status(500).json({ error: 'Failed to load shared folder' });
  }
});

// Preview file from shared content
app.get('/api/shared/:shareId/preview/:fileKey(*)', async (req, res) => {
  const { shareId, fileKey } = req.params;
  
  try {
    const share = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM shares WHERE id = ? AND revoked = 0', [shareId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!share || new Date(share.expires_at) < new Date()) {
      return res.status(404).send('Share not found or expired');
    }
    
    const bucket = await new Promise((resolve, reject) => {
      db.get('SELECT access_key, secret_key, region FROM buckets WHERE name = ?', [share.bucket_name], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    const s3Client = new S3Client({
      region: bucket.region,
      credentials: {
        accessKeyId: bucket.access_key,
        secretAccessKey: bucket.secret_key,
      },
    });
    
    const decodedFileKey = decodeURIComponent(fileKey);
    const command = new GetObjectCommand({ Bucket: share.bucket_name, Key: decodedFileKey });
    const response = await s3Client.send(command);
    
    const contentType = response.ContentType || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    
    response.Body.pipe(res);
    
  } catch (error) {
    console.error('Preview error:', error);
    res.status(500).send('Preview failed');
  }
});

// Download file from shared content
app.get('/api/shared/:shareId/download/:fileKey(*)', async (req, res) => {
  const { shareId, fileKey } = req.params;
  
  console.log('Shared folder download:', shareId, 'fileKey:', fileKey);
  
  try {
    const share = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM shares WHERE id = ? AND revoked = 0', [shareId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!share || new Date(share.expires_at) < new Date()) {
      return res.status(404).send('Share not found or expired');
    }
    
    const bucket = await new Promise((resolve, reject) => {
      db.get('SELECT access_key, secret_key, region FROM buckets WHERE name = ?', [share.bucket_name], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    const s3Client = new S3Client({
      region: bucket.region,
      credentials: {
        accessKeyId: bucket.access_key,
        secretAccessKey: bucket.secret_key,
      },
    });
    
    const decodedFileKey = decodeURIComponent(fileKey);
    const command = new GetObjectCommand({ Bucket: share.bucket_name, Key: decodedFileKey });
    const response = await s3Client.send(command);
    
    const fileName = decodedFileKey.split('/').pop();
    res.setHeader('Content-Type', response.ContentType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    
    response.Body.pipe(res);
    
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).send('Download failed');
  }
});

// Rename file or folder
app.post('/api/rename', async (req, res) => {
  const { bucketName, oldKey, newName, type, currentPath, userEmail } = req.body;

  console.log('=== RENAME REQUEST ===');
  console.log('User:', userEmail);
  console.log('File:', oldKey);
  console.log('New name:', newName);

  try {
    const bucket = await new Promise((resolve, reject) => {
      db.get('SELECT access_key, secret_key, region, owner_email FROM buckets WHERE name = ?', [bucketName], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!bucket) {
      return res.status(404).json({ error: 'Bucket not found' });
    }

    // Check permissions if not owner
    if (bucket.owner_email !== userEmail) {
      const member = await new Promise((resolve, reject) => {
        db.get('SELECT permissions FROM members WHERE email = ? AND bucket_name = ?', [userEmail, bucketName], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });

      if (!member) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const permissions = JSON.parse(member.permissions);
      console.log('Member permissions:', permissions);

      // Check if user has rename permissions
      if (!permissions.uploadViewAll && !permissions.deleteFiles) {
        // User can only rename own files - check ownership
        if (permissions.uploadViewOwn || permissions.deleteOwnFiles) {
          const ownership = await new Promise((resolve, reject) => {
            db.get('SELECT owner_email FROM file_ownership WHERE bucket_name = ? AND file_path = ?', [bucketName, oldKey], (err, row) => {
              if (err) reject(err);
              else resolve(row);
            });
          });

          console.log('File ownership check:', ownership);
          
          if (!ownership || ownership.owner_email !== userEmail) {
            return res.status(403).json({ error: 'You can only rename files you uploaded' });
          }
        } else {
          return res.status(403).json({ error: 'You do not have permission to rename files' });
        }
      }
    }

    const s3Client = new S3Client({
      region: bucket.region,
      credentials: {
        accessKeyId: bucket.access_key,
        secretAccessKey: bucket.secret_key,
      },
    });

    if (type === 'folder') {
      // For folders, rename all objects with the folder prefix
      const oldPrefix = oldKey.endsWith('/') ? oldKey : oldKey + '/';
      const newPrefix = currentPath ? `${currentPath}/${newName}/` : `${newName}/`;
      
      // List all objects in the folder
      const listCommand = new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: oldPrefix
      });
      
      const listResponse = await s3Client.send(listCommand);
      
      if (listResponse.Contents && listResponse.Contents.length > 0) {
        // Copy each object to new location
        for (const obj of listResponse.Contents) {
          const newKey = obj.Key.replace(oldPrefix, newPrefix);
          
          const copyCommand = new CopyObjectCommand({
            Bucket: bucketName,
            CopySource: `${bucketName}/${obj.Key}`,
            Key: newKey
          });
          
          await s3Client.send(copyCommand);
        }
        
        // Delete old objects
        const deleteObjects = listResponse.Contents.map(obj => ({ Key: obj.Key }));
        const deleteCommand = new DeleteObjectsCommand({
          Bucket: bucketName,
          Delete: { Objects: deleteObjects }
        });
        
        await s3Client.send(deleteCommand);
      }
      
      // Update member permissions that reference the old folder path
      const oldFolderPath = oldPrefix.replace(/\/$/, ''); // Remove trailing slash
      const newFolderPath = newPrefix.replace(/\/$/, ''); // Remove trailing slash
      
      db.all('SELECT email, scope_folders FROM members WHERE bucket_name = ? AND scope_type = "specific"', [bucketName], (err, members) => {
        if (err) {
          console.error('Error fetching members for folder rename update:', err);
          return;
        }
        
        members.forEach(member => {
          try {
            const scopeFolders = JSON.parse(member.scope_folders || '[]');
            let updated = false;
            
            const updatedFolders = scopeFolders
              .map(folder => {
                if (folder === oldFolderPath || folder.startsWith(oldFolderPath + '/')) {
                  updated = true;
                  return folder.replace(oldFolderPath, newFolderPath);
                }
                return folder;
              })
              .filter((folder, index, arr) => {
                // Remove duplicates - keep only unique folder paths
                return arr.indexOf(folder) === index;
              });
            
            if (updated) {
              console.log(`Updating permissions for ${member.email}:`);
              console.log(`  Old folders: ${JSON.stringify(scopeFolders)}`);
              console.log(`  New folders: ${JSON.stringify(updatedFolders)}`);
              
              db.run('UPDATE members SET scope_folders = ? WHERE email = ? AND bucket_name = ?', 
                [JSON.stringify(updatedFolders), member.email, bucketName], (updateErr) => {
                if (updateErr) {
                  console.error('Error updating member permissions after folder rename:', updateErr);
                } else {
                  console.log(`✅ Updated permissions for ${member.email}`);
                }
              });
            }
          } catch (parseErr) {
            console.error('Error parsing scope_folders for member:', member.email, parseErr);
          }
        });
      });
    } else {
      // For files, copy to new name and delete old
      const fileExtension = oldKey.split('.').pop();
      const newKey = currentPath ? `${currentPath}/${newName}` : newName;
      
      // Add extension if not present
      const finalNewKey = newName.includes('.') ? newKey : `${newKey}.${fileExtension}`;
      
      const copyCommand = new CopyObjectCommand({
        Bucket: bucketName,
        CopySource: `${bucketName}/${oldKey}`,
        Key: finalNewKey
      });
      
      await s3Client.send(copyCommand);
      
      const deleteCommand = new DeleteObjectCommand({
        Bucket: bucketName,
        Key: oldKey
      });
      
      await s3Client.send(deleteCommand);
    }

    // Update ownership records for renamed files/folders
    if (type === 'file') {
      const fileExtension = oldKey.split('.').pop();
      const newKey = currentPath ? `${currentPath}/${newName}` : newName;
      const finalNewKey = newName.includes('.') ? newKey : `${newKey}.${fileExtension}`;
      
      db.run('UPDATE file_ownership SET file_path = ? WHERE bucket_name = ? AND file_path = ?', 
        [finalNewKey, bucketName, oldKey], (err) => {
        if (err) console.error('Error updating ownership record:', err);
        else console.log('Updated ownership record:', oldKey, '->', finalNewKey);
      });
    } else if (type === 'folder') {
      // Update ownership records for all files in the renamed folder
      const oldPrefix = oldKey.endsWith('/') ? oldKey : oldKey + '/';
      const newPrefix = currentPath ? `${currentPath}/${newName}/` : `${newName}/`;
      
      db.all('SELECT file_path FROM file_ownership WHERE bucket_name = ? AND file_path LIKE ?', 
        [bucketName, oldPrefix + '%'], (err, files) => {
        if (err) {
          console.error('Error fetching ownership records for folder rename:', err);
          return;
        }
        
        files.forEach(file => {
          const newFilePath = file.file_path.replace(oldPrefix, newPrefix);
          db.run('UPDATE file_ownership SET file_path = ? WHERE bucket_name = ? AND file_path = ?', 
            [newFilePath, bucketName, file.file_path], (updateErr) => {
            if (updateErr) {
              console.error('Error updating ownership record for file in renamed folder:', updateErr);
            } else {
              console.log('Updated ownership record:', file.file_path, '->', newFilePath);
            }
          });
        });
      });
    }
    
    // Log rename activity
    const finalNewKey = type === 'folder' ? 
      (currentPath ? `${currentPath}/${newName}/` : `${newName}/`) :
      (currentPath ? `${currentPath}/${newName}` : newName);
    
    const oldFileName = oldKey.split('/').pop();
    const newFileName = type === 'folder' ? newName : (newName.includes('.') ? newName : `${newName}.${oldFileName.split('.').pop()}`);
    
    logActivity(bucketName, userEmail, 'rename', finalNewKey, oldFileName, newFileName);
    
    res.json({ success: true, message: 'Renamed successfully' });

  } catch (error) {
    console.error('Rename error:', error);
    res.status(500).json({ error: 'Failed to rename' });
  }
});

// Global search files across all folders
app.get('/api/buckets/:bucketName/search', async (req, res) => {
  const { bucketName } = req.params;
  const { query, userEmail } = req.query;

  if (!query || query.trim().length < 2) {
    return res.json([]);
  }

  try {
    const bucket = await new Promise((resolve, reject) => {
      db.get('SELECT access_key, secret_key, region, owner_email FROM buckets WHERE name = ?', [bucketName], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!bucket) {
      return res.status(404).json({ error: 'Bucket not found' });
    }

    const s3Client = new S3Client({
      region: bucket.region,
      credentials: {
        accessKeyId: bucket.access_key,
        secretAccessKey: bucket.secret_key,
      },
    });

    // Get all objects in bucket
    const command = new ListObjectsV2Command({ 
      Bucket: bucketName,
      MaxKeys: 1000
    });
    const response = await s3Client.send(command);

    let allFiles = [];
    if (response.Contents) {
      allFiles = response.Contents
        .filter(obj => !obj.Key.endsWith('/')) // Exclude folder markers
        .map(obj => {
          const fileName = obj.Key.split('/').pop();
          const folderPath = obj.Key.includes('/') ? obj.Key.substring(0, obj.Key.lastIndexOf('/')) : '';
          return {
            id: obj.Key,
            name: fileName,
            type: 'file',
            size: `${(obj.Size / 1024 / 1024).toFixed(2)} MB`,
            modified: obj.LastModified.toISOString().split('T')[0],
            fileType: fileName.split('.').pop(),
            folderPath: folderPath
          };
        });
    }

    // Apply permission-based filtering
    if (userEmail && bucket.owner_email !== userEmail) {
      const member = await new Promise((resolve) => {
        db.get('SELECT scope_type, scope_folders FROM members WHERE email = ? AND bucket_name = ?', [userEmail, bucketName], (err, row) => {
          resolve(row);
        });
      });

      if (member && (member.scope_type === 'specific' || member.scope_type === 'nested')) {
        const allowedFolders = JSON.parse(member.scope_folders || '[]');
        allFiles = allFiles.filter(file => {
          if (!file.folderPath) return false; // Root files not allowed for scoped users
          
          if (member.scope_type === 'specific') {
            return allowedFolders.some(folder => file.folderPath.startsWith(folder));
          } else if (member.scope_type === 'nested') {
            return allowedFolders.some(folder => 
              file.folderPath.startsWith(folder) || folder.startsWith(file.folderPath)
            );
          }
          return false;
        });
      }
    }

    // Filter by search query
    const searchResults = allFiles.filter(file => 
      file.name.toLowerCase().includes(query.toLowerCase())
    );

    res.json(searchResults);

  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Get complete folder tree structure
app.get('/api/buckets/:bucketName/folders/tree', async (req, res) => {
  const { bucketName } = req.params;
  const { ownerEmail, memberEmail } = req.query;

  try {
    const bucket = await new Promise((resolve, reject) => {
      db.get('SELECT access_key, secret_key, region, owner_email FROM buckets WHERE name = ?', [bucketName], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!bucket) {
      return res.status(404).json({ error: 'Bucket not found' });
    }

    const s3Client = new S3Client({
      region: bucket.region,
      credentials: {
        accessKeyId: bucket.access_key,
        secretAccessKey: bucket.secret_key,
      },
    });

    // Get all objects to build folder structure
    const command = new ListObjectsV2Command({ 
      Bucket: bucketName,
      MaxKeys: 1000
    });
    const response = await s3Client.send(command);

    const folderPaths = new Set();

    if (response.Contents) {
      response.Contents.forEach(obj => {
        if (obj.Key.includes('/')) {
          const pathParts = obj.Key.split('/');
          // Add all parent folder paths
          for (let i = 1; i < pathParts.length; i++) {
            const folderPath = pathParts.slice(0, i).join('/');
            if (folderPath) {
              folderPaths.add(folderPath);
            }
          }
        }
      });
    }

    let filteredPaths = Array.from(folderPaths);

    // If member is requesting, filter by their accessible scope
    if (memberEmail && bucket.owner_email !== memberEmail) {
      const member = await new Promise((resolve) => {
        db.get('SELECT scope_type, scope_folders FROM members WHERE email = ? AND bucket_name = ?', [memberEmail, bucketName], (err, row) => {
          resolve(row);
        });
      });

      if (member && member.scope_type === 'specific') {
        const allowedFolders = JSON.parse(member.scope_folders || '[]');
        
        // Filter to only show folders within member's scope
        filteredPaths = filteredPaths.filter(folderPath => {
          return allowedFolders.some(allowedFolder => 
            folderPath.startsWith(allowedFolder) || allowedFolder.startsWith(folderPath)
          );
        });
      }
    }

    res.json(filteredPaths.sort());

  } catch (error) {
    console.error('Error listing folder tree:', error);
    res.status(500).json({ error: 'Failed to list folders' });
  }
});

// Get all members for owner view
app.get('/api/buckets/:bucketName/all-members', async (req, res) => {
  const { bucketName } = req.params;
  const { ownerEmail } = req.query;

  console.log('=== ALL MEMBERS REQUEST ===');
  console.log('Bucket Name:', bucketName);
  console.log('Owner Email:', ownerEmail);

  try {
    // Verify the requester is the bucket owner
    db.get('SELECT owner_email FROM buckets WHERE name = ?', [bucketName], (err, bucket) => {
      if (err || !bucket) {
        console.log('Bucket not found or error:', err);
        return res.status(404).json({ error: 'Bucket not found' });
      }
      
      console.log('Bucket owner email:', bucket.owner_email);
      console.log('Requested by email:', ownerEmail);
      
      if (bucket.owner_email !== ownerEmail) {
        console.log('Owner email mismatch!');
        return res.status(403).json({ error: 'Only bucket owner can view all members' });
      }
      
      // Get all members for this bucket
      db.all('SELECT email, permissions, scope_type, scope_folders, invited_by FROM members WHERE bucket_name = ?', [bucketName], (err, members) => {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ error: 'Database error' });
        }
        console.log('Members found:', members);
        res.json(members || []);
      });
    });
  } catch (error) {
    console.error('Failed to load all members:', error);
    res.status(500).json({ error: 'Failed to load members' });
  }
});

// Get members for permission copying
app.get('/api/buckets/:bucketName/members', async (req, res) => {
  const { bucketName } = req.params;
  const { userEmail, isOwner } = req.query;

  try {
    if (isOwner === 'true') {
      // Owner can see all members
      db.all('SELECT email, scope_type, scope_folders FROM members WHERE bucket_name = ?', [bucketName], (err, members) => {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ error: 'Database error' });
        }
        res.json(members || []);
      });
    } else {
      // Member can only see members they invited
      db.all('SELECT email, scope_type, scope_folders FROM members WHERE bucket_name = ? AND invited_by = ?', [bucketName, userEmail], (err, members) => {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ error: 'Database error' });
        }
        res.json(members || []);
      });
    }
  } catch (error) {
    console.error('Failed to load members:', error);
    res.status(500).json({ error: 'Failed to load members' });
  }
});

// Get member permissions for copying
app.get('/api/members/:email/permissions', async (req, res) => {
  const { email } = req.params;
  const { bucketName } = req.query;

  try {
    db.get('SELECT permissions, scope_type, scope_folders FROM members WHERE email = ? AND bucket_name = ?', 
      [email, bucketName], (err, member) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      if (!member) {
        return res.status(404).json({ error: 'Member not found in this bucket' });
      }
      res.json(member);
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get member permissions' });
  }
});

// Get member's bucket-specific permissions
app.get('/api/member/:email/bucket/:bucketName', async (req, res) => {
  const { email, bucketName } = req.params;

  try {
    db.get('SELECT permissions, scope_type, scope_folders FROM members WHERE email = ? AND bucket_name = ?', 
      [email, bucketName], (err, member) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      if (!member) {
        return res.status(404).json({ error: 'Member not found in this bucket' });
      }
      res.json({
        bucketName: bucketName,
        permissions: member.permissions,
        scopeType: member.scope_type,
        scopeFolders: member.scope_folders
      });
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get member bucket permissions' });
  }
});

// Track file ownership
app.post('/api/files/ownership', async (req, res) => {
  const { bucketName, fileName, filePath, ownerEmail } = req.body;

  console.log('=== TRACKING FILE OWNERSHIP ===');
  console.log('Bucket:', bucketName);
  console.log('File Name:', fileName);
  console.log('File Path:', filePath);
  console.log('Owner Email:', ownerEmail);

  try {
    db.run(
      'INSERT OR REPLACE INTO file_ownership (bucket_name, file_path, owner_email, uploaded_at) VALUES (?, ?, ?, ?)',
      [bucketName, filePath, ownerEmail, new Date().toISOString()],
      function(err) {
        if (err) {
          console.error('Error tracking file ownership:', err);
          return res.status(500).json({ error: 'Failed to track ownership' });
        }
        console.log('✅ File ownership tracked successfully');
        
        // Log the upload activity
        logActivity(bucketName, ownerEmail, 'upload', filePath);
        
        res.json({ success: true });
      }
    );
  } catch (error) {
    console.error('File ownership tracking error:', error);
    res.status(500).json({ error: 'Failed to track ownership' });
  }
});

// Get files owned by user
app.get('/api/files/ownership/:bucketName', async (req, res) => {
  const { bucketName } = req.params;
  const { userEmail } = req.query;

  console.log('=== GETTING OWNED FILES ===');
  console.log('Bucket:', bucketName);
  console.log('User Email:', userEmail);

  try {
    db.all(
      'SELECT file_path FROM file_ownership WHERE bucket_name = ? AND owner_email = ?',
      [bucketName, userEmail],
      (err, files) => {
        if (err) {
          console.error('Error getting owned files:', err);
          return res.status(500).json({ error: 'Failed to get owned files' });
        }
        console.log('Owned files found:', files);
        res.json(files || []);
      }
    );
  } catch (error) {
    console.error('Get owned files error:', error);
    res.status(500).json({ error: 'Failed to get owned files' });
  }
});

// Member Google login
app.post('/api/member/google-login', async (req, res) => {
  const { email } = req.body;
  
  try {
    // Get all buckets this member belongs to
    db.all('SELECT * FROM members WHERE email = ?', [email], (err, members) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      if (!members || members.length === 0) {
        return res.status(401).json({ error: 'You are not a member of any organization. Please contact your administrator for an invitation.' });
      }
      
      // Return all buckets the member has access to
      const buckets = members.map(member => ({
        bucketName: member.bucket_name,
        permissions: member.permissions,
        scopeType: member.scope_type,
        scopeFolders: member.scope_folders
      }));
      
      res.json({
        message: 'Google login successful',
        email: email,
        buckets: buckets
      });
    });
  } catch (error) {
    res.status(500).json({ error: 'Google login failed' });
  }
});

// Change member password
app.post('/api/member/change-password', async (req, res) => {
  const { email, currentPassword, newPassword } = req.body;
  
  try {
    db.get('SELECT * FROM members WHERE email = ? AND password = ?', [email, currentPassword], (err, member) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      if (!member) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }
      
      db.run('UPDATE members SET password = ? WHERE email = ?', [newPassword, email], function(err) {
        if (err) {
          return res.status(500).json({ error: 'Failed to update password' });
        }
        
        res.json({ message: 'Password changed successfully' });
      });
    });
  } catch (error) {
    res.status(500).json({ error: 'Password change failed' });
  }
});

// Update member permissions (owner only)
app.put('/api/members/:email/permissions', async (req, res) => {
  const { email } = req.params;
  const { bucketName, permissions, scopeType, scopeFolders } = req.body;
  
  console.log('=== UPDATE MEMBER PERMISSIONS ===');
  console.log('Member email:', email);
  console.log('Bucket:', bucketName);
  console.log('New permissions:', permissions);
  console.log('New scope:', scopeType, scopeFolders);
  
  try {
    db.run(
      'UPDATE members SET permissions = ?, scope_type = ?, scope_folders = ? WHERE email = ? AND bucket_name = ?',
      [JSON.stringify(permissions), scopeType, JSON.stringify(scopeFolders), email, bucketName],
      function(err) {
        if (err) {
          console.error('Database error updating member:', err);
          return res.status(500).json({ error: 'Failed to update member permissions' });
        }
        
        if (this.changes === 0) {
          return res.status(404).json({ error: 'Member not found' });
        }
        
        console.log('Member permissions updated successfully');
        
        // Log permission change activity
        logActivity(bucketName, 'owner', 'permission_change', email, null, 'Permissions updated');
        
        res.json({ success: true, message: 'Permissions updated successfully' });
      }
    );
  } catch (error) {
    console.error('Error updating member permissions:', error);
    res.status(500).json({ error: 'Failed to update permissions' });
  }
});

// Get activity logs (owner only)
app.get('/api/buckets/:bucketName/logs', async (req, res) => {
  const { bucketName } = req.params;
  const { ownerEmail } = req.query;

  console.log('=== ACTIVITY LOGS REQUEST ===');
  console.log('Bucket Name:', bucketName);
  console.log('Owner Email:', ownerEmail);

  try {
    // Verify the requester is the bucket owner
    db.get('SELECT owner_email FROM buckets WHERE name = ?', [bucketName], (err, bucket) => {
      if (err || !bucket) {
        console.log('Bucket not found or error:', err);
        return res.status(404).json({ error: 'Bucket not found' });
      }
      
      if (bucket.owner_email !== ownerEmail) {
        console.log('Owner email mismatch!');
        return res.status(403).json({ error: 'Only bucket owner can view activity logs' });
      }
      
      // Get activity logs for this bucket (most recent first)
      db.all(
        'SELECT user_email, action, resource_path, old_name, details, timestamp FROM activity_logs WHERE bucket_name = ? ORDER BY timestamp DESC LIMIT 100',
        [bucketName],
        (err, logs) => {
          if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
          }
          console.log('Activity logs found:', logs.length);
          res.json(logs || []);
        }
      );
    });
  } catch (error) {
    console.error('Failed to load activity logs:', error);
    res.status(500).json({ error: 'Failed to load logs' });
  }
});

// Remove member from organization
app.delete('/api/members/:email', async (req, res) => {
  const { email } = req.params;
  const { bucketName } = req.body;
  
  try {
    db.run(
      'DELETE FROM members WHERE email = ? AND bucket_name = ?',
      [email, bucketName],
      function(err) {
        if (err) {
          console.error('Database error removing member:', err);
          return res.status(500).json({ error: 'Failed to remove member' });
        }
        
        if (this.changes === 0) {
          return res.status(404).json({ error: 'Member not found' });
        }
        
        console.log('Member removed successfully:', email);
        
        // Log member removal activity
        logActivity(bucketName, 'owner', 'member_removed', email, null, 'Member removed from organization');
        
        res.json({ success: true, message: 'Member removed successfully' });
      }
    );
  } catch (error) {
    console.error('Error removing member:', error);
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

// Change owner password (for Google login users)
app.post('/api/owner/change-password', async (req, res) => {
  const { email, currentPassword, newPassword } = req.body;
  
  try {
    // Owners use Google login, they don't have passwords in our database
    return res.status(400).json({ 
      error: 'You are signed in with Google. Please change your password through your Google account settings.',
      isGoogleUser: true
    });
  } catch (error) {
    res.status(500).json({ error: 'Password change failed' });
  }
});

// Test invitation endpoint for debugging
app.post('/api/test-invite', async (req, res) => {
  console.log('=== TEST INVITATION ENDPOINT ===');
  console.log('Request body:', req.body);
  
  const testData = {
    bucketName: 'shipfile01',
    email: 'pk@gmail.com',
    permissions: {
      viewOnly: true,
      viewDownload: false,
      uploadOnly: false,
      uploadViewOwn: true,
      uploadViewAll: false,
      deleteFiles: false,
      generateLinks: true,
      createFolder: false,
      deleteOwnFiles: true,
      inviteMembers: true
    },
    scopeType: 'specific',
    scopeFolders: ['limux/checking_permissions'],
    userEmail: 'rr@gmail.com'
  };
  
  try {
    // Simulate the invitation process
    const response = await fetch(`http://localhost:${PORT}/api/invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testData)
    });
    
    const result = await response.json();
    
    res.json({
      success: response.ok,
      status: response.status,
      data: result,
      testData: testData
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      testData: testData
    });
  }
});

// Debug member permissions
app.get('/api/debug/member/:email', async (req, res) => {
  const { email } = req.params;
  const { bucketName } = req.query;
  
  try {
    db.get('SELECT email, scope_folders, scope_type FROM members WHERE email = ? AND bucket_name = ?', 
      [email, bucketName], (err, member) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      if (!member) {
        return res.status(404).json({ error: 'Member not found' });
      }
      
      let scopeFolders = [];
      try {
        scopeFolders = JSON.parse(member.scope_folders || '[]');
      } catch (e) {
        scopeFolders = [];
      }
      
      res.json({
        email: member.email,
        scopeType: member.scope_type,
        scopeFolders: scopeFolders,
        rawScopeFolders: member.scope_folders
      });
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get member info' });
  }
});

// Access shared content
app.get('/api/share/:shareId', async (req, res) => {
  const { shareId } = req.params;
  
  try {
    const share = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM shares WHERE id = ? AND revoked = 0', [shareId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!share) {
      return res.status(404).send(`
        <html><body>
          <h2>Share Not Found</h2>
          <p>This share link is invalid or has been revoked.</p>
        </body></html>
      `);
    }
    
    if (new Date(share.expires_at) < new Date()) {
      return res.status(410).send(`
        <html><body>
          <h2>Share Expired</h2>
          <p>This share link has expired.</p>
        </body></html>
      `);
    }
    
    const items = JSON.parse(share.items);
    
    // If single file, redirect to download
    if (items.length === 1 && items[0].type === 'file') {
      return res.redirect(`/api/share/${shareId}/download/${encodeURIComponent(items[0].key)}`);
    }
    
    // For multiple items or folders, redirect to React share viewer
    return res.redirect(`${process.env.FRONTEND_URL}/shared/${shareId}`);
    const bucket = await new Promise((resolve, reject) => {
      db.get('SELECT access_key, secret_key, region FROM buckets WHERE name = ?', [share.bucket_name], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!bucket) {
      return res.status(404).send('Bucket not found');
    }
    
    const s3Client = new S3Client({
      region: bucket.region,
      credentials: {
        accessKeyId: bucket.access_key,
        secretAccessKey: bucket.secret_key,
      },
    });
    
    let fileList = [];
    
    for (const item of items) {
      if (item.type === 'folder') {
        const folderKey = item.key.endsWith('/') ? item.key : item.key + '/';
        const listCommand = new ListObjectsV2Command({ Bucket: share.bucket_name, Prefix: folderKey });
        const listResponse = await s3Client.send(listCommand);
        
        if (listResponse.Contents) {
          listResponse.Contents.forEach(obj => {
            if (!obj.Key.endsWith('/')) {
              fileList.push({
                name: obj.Key.split('/').pop(),
                key: obj.Key,
                size: `${(obj.Size / 1024 / 1024).toFixed(2)} MB`,
                modified: obj.LastModified.toISOString().split('T')[0],
                folderPath: obj.Key.includes('/') ? obj.Key.substring(0, obj.Key.lastIndexOf('/')) : ''
              });
            }
          });
        }
      } else {
        // For individual files, get their actual S3 metadata
        try {
          const headCommand = new GetObjectCommand({ Bucket: share.bucket_name, Key: item.key });
          const headResponse = await s3Client.send(headCommand);
          fileList.push({
            name: item.name,
            key: item.key,
            size: headResponse.ContentLength ? `${(headResponse.ContentLength / 1024 / 1024).toFixed(2)} MB` : 'N/A',
            modified: headResponse.LastModified ? headResponse.LastModified.toISOString().split('T')[0] : 'N/A',
            folderPath: item.key.includes('/') ? item.key.substring(0, item.key.lastIndexOf('/')) : ''
          });
        } catch (error) {
          // If head request fails, add with basic info
          fileList.push({
            name: item.name,
            key: item.key,
            size: 'N/A',
            modified: 'N/A',
            folderPath: item.key.includes('/') ? item.key.substring(0, item.key.lastIndexOf('/')) : ''
          });
        }
      }
    }
    
    // This code is now unused as we redirect to React component
    
  } catch (error) {
    console.error('Share access error:', error);
    res.status(500).send('Failed to access shared content');
  }
});

// Download file from share
app.get('/api/share/:shareId/download/:fileKey(*)', async (req, res) => {
  const { shareId, fileKey } = req.params;
  
  try {
    const share = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM shares WHERE id = ? AND revoked = 0', [shareId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!share || new Date(share.expires_at) < new Date()) {
      return res.status(404).send('Share not found or expired');
    }
    
    const bucket = await new Promise((resolve, reject) => {
      db.get('SELECT access_key, secret_key, region FROM buckets WHERE name = ?', [share.bucket_name], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    const s3Client = new S3Client({
      region: bucket.region,
      credentials: {
        accessKeyId: bucket.access_key,
        secretAccessKey: bucket.secret_key,
      },
    });
    
    const decodedFileKey = decodeURIComponent(fileKey);
    const command = new GetObjectCommand({ Bucket: share.bucket_name, Key: decodedFileKey });
    const response = await s3Client.send(command);
    
    const fileName = decodedFileKey.split('/').pop();
    res.setHeader('Content-Type', response.ContentType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    
    response.Body.pipe(res);
    
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).send('Download failed');
  }
});

// Get complete analytics for all buckets (owner only)
app.get('/api/analytics/complete', async (req, res) => {
  const { ownerEmail } = req.query;

  try {
    // Verify owner
    if (!ownerEmail) {
      return res.status(401).json({ error: 'Owner email required' });
    }

    // Get all buckets for owner
    const buckets = await new Promise((resolve, reject) => {
      db.all('SELECT name, access_key, secret_key, region FROM buckets WHERE owner_email = ?', [ownerEmail], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    if (!buckets || buckets.length === 0) {
      return res.status(404).json({ error: 'No buckets found' });
    }

    let totalSize = 0;
    let totalFiles = 0;
    let totalFolders = 0;
    const allFileTypes = {};
    const bucketStats = [];
    const allFolders = {};
    const memberStats = {};
    const shareStats = {};

    // Analyze each bucket
    for (const bucket of buckets) {
      const s3Client = new S3Client({
        region: bucket.region,
        credentials: {
          accessKeyId: bucket.access_key,
          secretAccessKey: bucket.secret_key,
        },
      });

      try {
        const command = new ListObjectsV2Command({ Bucket: bucket.name, MaxKeys: 1000 });
        const response = await s3Client.send(command);

        let bucketSize = 0;
        let bucketFiles = 0;
        let bucketFolders = 0;
        const folderSet = new Set();

        if (response.Contents) {
          response.Contents.forEach(obj => {
            if (obj.Key.endsWith('/')) {
              folderSet.add(obj.Key);
              bucketFolders++;
            } else {
              bucketFiles++;
              bucketSize += obj.Size || 0;
              totalFiles++;
              totalSize += obj.Size || 0;
              
              const ext = obj.Key.split('.').pop()?.toLowerCase() || 'unknown';
              allFileTypes[ext] = (allFileTypes[ext] || 0) + 1;
              
              // Track folder structure
              if (obj.Key.includes('/')) {
                const pathParts = obj.Key.split('/');
                for (let i = 1; i < pathParts.length; i++) {
                  const folderPath = pathParts.slice(0, i).join('/');
                  if (folderPath) {
                    folderSet.add(folderPath + '/');
                  }
                }
              }
              
              const folderPath = obj.Key.includes('/') ? `${bucket.name}/${obj.Key.substring(0, obj.Key.lastIndexOf('/'))}` : `${bucket.name}/root`;
              allFolders[folderPath] = (allFolders[folderPath] || { size: 0, files: 0 });
              allFolders[folderPath].size += obj.Size || 0;
              allFolders[folderPath].files += 1;
            }
          });
        }

        totalFolders += folderSet.size;
        bucketStats.push({
          name: bucket.name,
          size: bucketSize,
          files: bucketFiles,
          folders: folderSet.size
        });

        // Get member count for this bucket
        const memberCount = await new Promise((resolve) => {
          db.get('SELECT COUNT(*) as count FROM members WHERE bucket_name = ?', [bucket.name], (err, result) => {
            resolve(result ? result.count : 0);
          });
        });
        memberStats[bucket.name] = memberCount;

        // Get share count for this bucket
        const shareCount = await new Promise((resolve) => {
          db.get('SELECT COUNT(*) as count FROM shares WHERE bucket_name = ? AND revoked = 0 AND expires_at > datetime("now")', [bucket.name], (err, result) => {
            resolve(result ? result.count : 0);
          });
        });
        shareStats[bucket.name] = shareCount;

      } catch (error) {
        console.error(`Error analyzing bucket ${bucket.name}:`, error);
      }
    }

    // Get overall activity stats
    const activeUsers = await new Promise((resolve) => {
      db.get('SELECT COUNT(DISTINCT user_email) as count FROM activity_logs WHERE timestamp > datetime("now", "-30 days")', [], (err, result) => {
        resolve(result ? result.count : 0);
      });
    });

    const recentUploads = await new Promise((resolve) => {
      db.get('SELECT COUNT(*) as count FROM activity_logs WHERE action = "upload" AND timestamp > datetime("now", "-7 days")', [], (err, result) => {
        resolve(result ? result.count : 0);
      });
    });

    const totalMembers = await new Promise((resolve) => {
      db.get('SELECT COUNT(*) as count FROM members', [], (err, result) => {
        resolve(result ? result.count : 0);
      });
    });

    const totalShares = await new Promise((resolve) => {
      db.get('SELECT COUNT(*) as count FROM shares WHERE revoked = 0 AND expires_at > datetime("now")', [], (err, result) => {
        resolve(result ? result.count : 0);
      });
    });

    const recentActivity = await new Promise((resolve) => {
      db.all('SELECT user_email, action, resource_path, timestamp, bucket_name FROM activity_logs ORDER BY timestamp DESC LIMIT 20', [], (err, rows) => {
        resolve(rows || []);
      });
    });

    // Format data
    const formatSize = (bytes) => {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const topFileTypes = Object.entries(allFileTypes)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([ext, count]) => ({ extension: ext, count }));

    const topFolders = Object.entries(allFolders)
      .sort(([,a], [,b]) => b.size - a.size)
      .slice(0, 10)
      .map(([name, data]) => ({ 
        name: name.includes('/root') ? name.replace('/root', ' (Root)') : name, 
        size: formatSize(data.size), 
        files: data.files 
      }));

    const topBuckets = bucketStats
      .sort((a, b) => b.size - a.size)
      .map(bucket => ({
        name: bucket.name,
        size: formatSize(bucket.size),
        files: bucket.files,
        folders: bucket.folders,
        members: memberStats[bucket.name] || 0,
        shares: shareStats[bucket.name] || 0
      }));

    res.json({
      totalSize: formatSize(totalSize),
      totalFiles,
      totalFolders,
      totalBuckets: buckets.length,
      totalMembers,
      totalShares,
      activeUsers,
      recentUploads,
      fileTypes: topFileTypes,
      topFolders,
      topBuckets,
      recentActivity
    });

  } catch (error) {
    console.error('Complete analytics error:', error);
    res.status(500).json({ error: 'Failed to load complete analytics' });
  }
});

// Get storage analytics for bucket (owner only)
app.get('/api/buckets/:bucketName/analytics', async (req, res) => {
  const { bucketName } = req.params;
  const { ownerEmail } = req.query;

  try {
    // Verify owner
    const bucket = await new Promise((resolve, reject) => {
      db.get('SELECT access_key, secret_key, region, owner_email FROM buckets WHERE name = ? AND owner_email = ?', [bucketName, ownerEmail], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!bucket) {
      return res.status(404).json({ error: 'Bucket not found or access denied' });
    }

    const s3Client = new S3Client({
      region: bucket.region,
      credentials: {
        accessKeyId: bucket.access_key,
        secretAccessKey: bucket.secret_key,
      },
    });

    // Get all objects
    const command = new ListObjectsV2Command({ Bucket: bucketName, MaxKeys: 1000 });
    const response = await s3Client.send(command);

    let totalSize = 0;
    let totalFiles = 0;
    let totalFolders = 0;
    const fileTypes = {};
    const folderSizes = {};
    const folderSet = new Set();
    const uploadsByUser = {};
    const sizeByUser = {};

    if (response.Contents) {
      response.Contents.forEach(obj => {
        if (obj.Key.endsWith('/')) {
          folderSet.add(obj.Key);
        } else {
          totalFiles++;
          totalSize += obj.Size || 0;
          
          // File type analysis
          const ext = obj.Key.split('.').pop()?.toLowerCase() || 'unknown';
          fileTypes[ext] = (fileTypes[ext] || 0) + 1;
          
          // Track folder structure
          if (obj.Key.includes('/')) {
            const pathParts = obj.Key.split('/');
            for (let i = 1; i < pathParts.length; i++) {
              const folderPath = pathParts.slice(0, i).join('/');
              if (folderPath) {
                folderSet.add(folderPath + '/');
              }
            }
          }
          
          // Folder size analysis
          const folderPath = obj.Key.includes('/') ? obj.Key.substring(0, obj.Key.lastIndexOf('/')) : 'root';
          folderSizes[folderPath] = (folderSizes[folderPath] || { size: 0, files: 0 });
          folderSizes[folderPath].size += obj.Size || 0;
          folderSizes[folderPath].files += 1;
        }
      });
    }

    totalFolders = folderSet.size;

    // Get file ownership data for user statistics
    const fileOwnership = await new Promise((resolve) => {
      db.all('SELECT owner_email, COUNT(*) as files FROM file_ownership WHERE bucket_name = ? GROUP BY owner_email', [bucketName], (err, rows) => {
        resolve(rows || []);
      });
    });

    fileOwnership.forEach(row => {
      uploadsByUser[row.owner_email] = row.files;
    });

    // Get user activity stats
    const activeUsers = await new Promise((resolve) => {
      db.get('SELECT COUNT(DISTINCT user_email) as count FROM activity_logs WHERE bucket_name = ? AND timestamp > datetime("now", "-30 days")', [bucketName], (err, result) => {
        resolve(result ? result.count : 0);
      });
    });

    const recentUploads = await new Promise((resolve) => {
      db.get('SELECT COUNT(*) as count FROM activity_logs WHERE bucket_name = ? AND action = "upload" AND timestamp > datetime("now", "-7 days")', [bucketName], (err, result) => {
        resolve(result ? result.count : 0);
      });
    });

    const totalMembers = await new Promise((resolve) => {
      db.get('SELECT COUNT(*) as count FROM members WHERE bucket_name = ?', [bucketName], (err, result) => {
        resolve(result ? result.count : 0);
      });
    });

    const totalShares = await new Promise((resolve) => {
      db.get('SELECT COUNT(*) as count FROM shares WHERE bucket_name = ? AND revoked = 0 AND expires_at > datetime("now")', [bucketName], (err, result) => {
        resolve(result ? result.count : 0);
      });
    });

    const recentActivity = await new Promise((resolve) => {
      db.all('SELECT user_email, action, resource_path, timestamp FROM activity_logs WHERE bucket_name = ? ORDER BY timestamp DESC LIMIT 15', [bucketName], (err, rows) => {
        resolve(rows || []);
      });
    });

    const memberList = await new Promise((resolve) => {
      db.all('SELECT email, permissions, scope_type FROM members WHERE bucket_name = ?', [bucketName], (err, rows) => {
        resolve(rows || []);
      });
    });

    // Format data
    const formatSize = (bytes) => {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const topFileTypes = Object.entries(fileTypes)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 8)
      .map(([ext, count]) => ({ extension: ext, count }));

    const topFolders = Object.entries(folderSizes)
      .sort(([,a], [,b]) => b.size - a.size)
      .slice(0, 8)
      .map(([name, data]) => ({ 
        name: name === 'root' ? 'Root Directory' : name, 
        size: formatSize(data.size), 
        files: data.files 
      }));

    const topUploaders = Object.entries(uploadsByUser)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([email, files]) => ({ email, files }));

    res.json({
      totalSize: formatSize(totalSize),
      totalFiles,
      totalFolders,
      totalMembers,
      totalShares,
      activeUsers,
      recentUploads,
      fileTypes: topFileTypes,
      topFolders,
      topUploaders,
      memberList,
      recentActivity
    });

  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Failed to load analytics' });
  }
});

// Test email configuration
app.post('/api/test-email', async (req, res) => {
  const { testEmail } = req.body;
  
  try {
    console.log('Testing email configuration...');
    console.log('SMTP Config:', {
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      user: process.env.SMTP_USER ? 'SET' : 'NOT SET',
      pass: process.env.SMTP_PASS ? 'SET' : 'NOT SET'
    });
    
    if (!transporter) {
      return res.status(500).json({ error: 'Email transporter not configured' });
    }
    
    const result = await transporter.sendMail({
      from: '"ShipFile Test" <noreply@example.com>',
      to: testEmail || 'test@example.com',
      subject: 'ShipFile Email Test',
      html: '<h2>Email configuration test successful!</h2><p>Your SMTP settings are working correctly.</p>'
    });
    
    console.log('Test email result:', result);
    res.json({ 
      success: true, 
      message: 'Test email sent successfully',
      messageId: result.messageId
    });
    
  } catch (error) {
    console.error('Test email failed:', error);
    res.status(500).json({ 
      error: 'Test email failed: ' + error.message,
      details: error.stack
    });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Environment check:');
  console.log('- SMTP_HOST:', process.env.SMTP_HOST);
  console.log('- SMTP_PORT:', process.env.SMTP_PORT);
  console.log('- SMTP_USER:', process.env.SMTP_USER ? 'SET' : 'NOT SET');
  console.log('- SMTP_PASS:', process.env.SMTP_PASS ? 'SET' : 'NOT SET');
  console.log('- FRONTEND_URL:', process.env.FRONTEND_URL);
  console.log('- Transporter configured:', !!transporter);
  console.log('Analytics endpoints available:');
  console.log('- GET /api/analytics/complete - Complete dashboard analytics (owner only)');
  console.log('- GET /api/buckets/:bucketName/analytics - Bucket-specific analytics (owner only)');
});