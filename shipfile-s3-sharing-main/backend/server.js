import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { S3Client, CreateBucketCommand, ListObjectsV2Command, PutBucketCorsCommand, GetObjectCommand, DeleteObjectCommand, DeleteObjectsCommand, PutObjectAclCommand, CopyObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import archiver from 'archiver';
import pkg from 'pg';
const { Pool } = pkg;
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Readable } from 'stream';
import nodemailer from 'nodemailer';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(cors({
  origin: [process.env.FRONTEND_URL || 'http://localhost:8080', 'https://shipfile.netlify.app'],
  credentials: true
}));
app.use(express.json());

// Database setup - PostgreSQL only
const dbConfig = {
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? {
    rejectUnauthorized: false
  } : false
};

const db = new Pool(dbConfig);

// Initialize database tables
const initDB = async () => {
  try {
    console.log('Initializing database connection...');
    console.log('Database config:', {
      hasConnectionString: !!process.env.DATABASE_URL,
      nodeEnv: process.env.NODE_ENV,
      sslEnabled: !!dbConfig.ssl
    });
    
    // Test connection first
    await db.query('SELECT NOW()');
    console.log('Database connection successful');
    
    await db.query(`CREATE TABLE IF NOT EXISTS buckets (
      id SERIAL PRIMARY KEY,
      name TEXT,
      region TEXT,
      access_key TEXT,
      secret_key TEXT,
      owner_email TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(name, owner_email)
    )`);
    
    await db.query(`CREATE TABLE IF NOT EXISTS shares (
      id TEXT PRIMARY KEY,
      bucket_name TEXT,
      items TEXT,
      permissions TEXT,
      expires_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      revoked BOOLEAN DEFAULT FALSE
    )`);
    
    await db.query(`CREATE TABLE IF NOT EXISTS organizations (
      id SERIAL PRIMARY KEY,
      bucket_name TEXT UNIQUE,
      name TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    
    await db.query(`CREATE TABLE IF NOT EXISTS invitations (
      id TEXT PRIMARY KEY,
      bucket_name TEXT,
      email TEXT,
      permissions TEXT,
      scope_type TEXT,
      scope_folders TEXT,
      expires_at TIMESTAMP,
      created_by TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      accepted BOOLEAN DEFAULT FALSE
    )`);
    
    await db.query(`CREATE TABLE IF NOT EXISTS members (
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
    
    await db.query(`CREATE TABLE IF NOT EXISTS file_ownership (
      id SERIAL PRIMARY KEY,
      bucket_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      owner_email TEXT NOT NULL,
      uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(bucket_name, file_path)
    )`);
    
    await db.query(`CREATE TABLE IF NOT EXISTS activity_logs (
      id SERIAL PRIMARY KEY,
      bucket_name TEXT NOT NULL,
      user_email TEXT NOT NULL,
      action TEXT NOT NULL,
      resource_path TEXT NOT NULL,
      old_name TEXT,
      details TEXT,
      timestamp TIMESTAMP NOT NULL
    )`);
    
    console.log('Database tables initialized successfully');
  } catch (error) {
    console.error('Database initialization error:', error.message);
    console.error('Full error:', error);
    
    // Don't exit the process, let Vercel handle the error
    if (process.env.NODE_ENV !== 'production') {
      process.exit(1);
    }
  }
};

initDB();

// Email transporter setup
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT),
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Helper function to log activities
const logActivity = async (bucketName, userEmail, action, resourcePath, oldName = null, details = null) => {
  const timestamp = new Date().toISOString();
  try {
    await db.query(
      'INSERT INTO activity_logs (bucket_name, user_email, action, resource_path, old_name, details, timestamp) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [bucketName, userEmail, action, resourcePath, oldName, details, timestamp]
    );
    console.log(`Activity logged: ${userEmail} ${action} ${resourcePath} at ${timestamp}`);
  } catch (err) {
    console.error('Error logging activity:', err);
  }
};

// Helper function to check if user has access to specific files/folders
const checkFolderAccess = (userEmail, bucketName, items) => {
  return new Promise((resolve, reject) => {
    db.query('SELECT owner_email FROM buckets WHERE name = $1', [bucketName]).then(result => {
      const bucket = result.rows[0];
      if (!bucket) {
        return reject(new Error('Bucket not found'));
      }
      
      // Owner has access to everything
      if (bucket.owner_email === userEmail) {
        return resolve(true);
      }
      
      // Check member permissions
      return db.query('SELECT scope_type, scope_folders FROM members WHERE email = $1 AND bucket_name = $2', [userEmail, bucketName]);
    }).then(result => {
      const member = result.rows[0];
      if (!member) {
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
    }).catch(err => {
      reject(err);
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
  return async (req, res, next) => {
    const { bucketName, userEmail, items } = req.body;
    
    if (!userEmail) {
      return res.status(401).json({ error: 'User email required' });
    }
    
    try {
      const bucketResult = await db.query('SELECT owner_email FROM buckets WHERE name = $1', [bucketName]);
      const bucket = bucketResult.rows[0];
      if (!bucket) {
        return res.status(404).json({ error: 'Bucket not found' });
      }
      
      if (bucket.owner_email === userEmail) {
        return next();
      }
      
      const memberResult = await db.query('SELECT permissions, scope_type, scope_folders FROM members WHERE email = $1 AND bucket_name = $2', [userEmail, bucketName]);
      const member = memberResult.rows[0];
      if (!member) {
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
        try {
          await checkFolderAccess(userEmail, bucketName, items);
          next();
        } catch (error) {
          res.status(403).json({ error: error.message });
        }
      } else {
        next();
      }
    } catch (err) {
      console.error('Permission check error:', err);
      res.status(500).json({ error: 'Database error' });
    }
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

    try {
      const result = await db.query(
        'INSERT INTO buckets (name, region, access_key, secret_key, owner_email) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [bucketName, region, accessKey, secretKey, ownerEmail]
      );
      res.json({ 
        id: result.rows[0].id,
        name: bucketName,
        region,
        created: new Date().toISOString().split('T')[0]
      });
    } catch (err) {
      if (err.code === '23505') { // PostgreSQL unique constraint error
        return res.status(400).json({ error: 'You already have a bucket with this name. Please choose a different name.' });
      }
      return res.status(500).json({ error: 'Database error: ' + err.message });
    }

  } catch (error) {
    res.status(400).json({ 
      error: error.name === 'InvalidAccessKeyId' || error.name === 'SignatureDoesNotMatch' 
        ? 'Invalid AWS credentials' 
        : error.message 
    });
  }
});

// Get bucket info
app.get('/api/buckets/:bucketName/info', async (req, res) => {
  const { bucketName } = req.params;
  
  try {
    const result = await db.query('SELECT owner_email FROM buckets WHERE name = $1', [bucketName]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Bucket not found' });
    }
    res.json({ owner_email: result.rows[0].owner_email });
  } catch (err) {
    return res.status(500).json({ error: 'Database error' });
  }
});

// Get buckets for owner
app.get('/api/buckets', async (req, res) => {
  const { ownerEmail } = req.query;
  
  if (!ownerEmail) {
    return res.status(400).json({ error: 'Owner email is required' });
  }
  
  try {
    const result = await db.query('SELECT id, name, region, created_at FROM buckets WHERE owner_email = $1', [ownerEmail]);
    const rows = result.rows;
    
    const buckets = await Promise.all(rows.map(async (row) => {
      const memberResult = await db.query('SELECT COUNT(*) as count FROM members WHERE bucket_name = $1', [row.name]);
      return {
        id: row.id,
        name: row.name,
        region: row.region,
        created: row.created_at.toISOString().split('T')[0],
        userCount: parseInt(memberResult.rows[0].count)
      };
    }));
    
    res.json(buckets);
  } catch (err) {
    console.error('Database error:', err);
    return res.status(500).json({ error: 'Database error: ' + err.message });
  }
});

// Get buckets for member
app.get('/api/member/buckets', async (req, res) => {
  const { memberEmail } = req.query;
  
  if (!memberEmail) {
    return res.status(400).json({ error: 'Member email is required' });
  }
  
  try {
    const result = await db.query('SELECT bucket_name, permissions, scope_type, scope_folders FROM members WHERE email = $1', [memberEmail]);
    
    const buckets = result.rows.map(row => ({
      bucketName: row.bucket_name,
      permissions: row.permissions,
      scopeType: row.scope_type,
      scopeFolders: row.scope_folders
    }));
    
    res.json(buckets);
  } catch (err) {
    console.error('Database error:', err);
    return res.status(500).json({ error: 'Database error: ' + err.message });
  }
});

// Generate pre-signed upload URL
app.post('/api/upload-url', async (req, res) => {
  const { bucketName, fileName, fileType, folderPath = '', userEmail } = req.body;

  try {
    const bucketResult = await db.query('SELECT access_key, secret_key, region, owner_email FROM buckets WHERE name = $1', [bucketName]);
    const row = bucketResult.rows[0];
    if (!row) {
      return res.status(404).json({ error: 'Bucket not found' });
    }
    
    // Check permissions if not owner
    if (row.owner_email !== userEmail) {
      const memberResult = await db.query('SELECT permissions, scope_type, scope_folders FROM members WHERE email = $1 AND bucket_name = $2', [userEmail, bucketName]);
      const member = memberResult.rows[0];
      if (!member) {
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
    }
    
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

  } catch (error) {
    console.error('Upload URL generation error:', error);
    res.status(500).json({ error: 'Failed to generate upload URL: ' + error.message });
  }
});

// Create folder
app.post('/api/folders', checkPermission('createFolder'), async (req, res) => {
  const { bucketName, folderName, currentPath = '', userEmail } = req.body;

  try {
    const bucketResult = await db.query('SELECT access_key, secret_key, region, owner_email FROM buckets WHERE name = $1', [bucketName]);
    const row = bucketResult.rows[0];
    if (!row) {
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
    await logActivity(bucketName, userEmail, 'create_folder', folderKey);
    
    res.json({ success: true, folderPath: folderKey });

  } catch (error) {
    console.error('Create folder error:', error);
    res.status(500).json({ error: 'Failed to create folder: ' + error.message });
  }
});

// Get all files recursively from all folders
app.get('/api/buckets/:bucketName/files/all', async (req, res) => {
  const { bucketName } = req.params;
  const { userEmail } = req.query;

  try {
    const bucketResult = await db.query('SELECT access_key, secret_key, region, owner_email FROM buckets WHERE name = $1', [bucketName]);
    const bucket = bucketResult.rows[0];

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
      const memberResult = await db.query('SELECT scope_type, scope_folders FROM members WHERE email = $1 AND bucket_name = $2', [userEmail, bucketName]);
      const member = memberResult.rows[0];

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
    const bucketResult = await db.query('SELECT access_key, secret_key, region, owner_email FROM buckets WHERE name = $1', [bucketName]);
    const bucket = bucketResult.rows[0];

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
      const memberCountResult = await db.query('SELECT COUNT(*) as count FROM members WHERE bucket_name = $1', [bucketName]);
      const memberCount = parseInt(memberCountResult.rows[0].count);
      
      // If no members exist, treat as owner access
      if (memberCount === 0) {
        return res.json(items);
      }
      
      // If members exist but no userEmail provided, deny access
      return res.status(403).json({ error: 'Access denied - authentication required' });
    }

    // Check member permissions
    const memberResult = await db.query('SELECT scope_type, scope_folders FROM members WHERE email = $1 AND bucket_name = $2', [userEmail, bucketName]);
    const member = memberResult.rows[0];

    if (!member) {
      return res.status(403).json({ error: 'Access denied' });
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
    const bucketResult = await db.query('SELECT access_key, secret_key, region, owner_email FROM buckets WHERE name = $1', [bucketName]);
    const bucket = bucketResult.rows[0];

    if (!bucket) {
      return res.status(404).send('Bucket not found');
    }

    // Basic permission check - if userEmail provided, verify access
    if (userEmail && bucket.owner_email !== userEmail) {
      const memberResult = await db.query('SELECT permissions FROM members WHERE email = $1 AND bucket_name = $2', [userEmail, bucketName]);
      const member = memberResult.rows[0];
      
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
    const bucketResult = await db.query('SELECT access_key, secret_key, region, owner_email FROM buckets WHERE name = $1', [bucketName]);
    const row = bucketResult.rows[0];
    if (!row) {
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

  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: 'Download failed: ' + error.message });
  }
});

// Generate share links
app.post('/api/share', checkPermission('share'), async (req, res) => {
  const { bucketName, items, shareType, expiryHours, userEmail } = req.body;

  try {
    const bucketResult = await db.query('SELECT access_key, secret_key, region, owner_email FROM buckets WHERE name = $1', [bucketName]);
    const row = bucketResult.rows[0];
    if (!row) {
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
        await logActivity(bucketName, userEmail, 'share', fileKey, null, `${shareType} - ${expiryHours}h`);
        
        res.json({ shareUrl });
      } else {
        const shareId = Math.random().toString(36).substring(2, 15);
        const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
        
        // Check if sharing a single folder
        const isSingleFolder = items.length === 1 && items[0].type === 'folder';
        
        try {
          await db.query(
            'INSERT INTO shares (id, bucket_name, items, permissions, expires_at) VALUES ($1, $2, $3, $4, $5)',
            [shareId, bucketName, JSON.stringify(items), 'read', expiresAt]
          );
          
          const shareUrl = `${process.env.FRONTEND_URL || 'http://localhost:3001'}/api/share/${shareId}`;
          
          // Log share activity for multiple items
          const resourcePath = items.length === 1 ? items[0].key : `${items.length} items`;
          await logActivity(bucketName, userEmail, 'share', resourcePath, null, `${shareType} - ${expiryHours}h`);
          
          res.json({ shareUrl });
        } catch (err) {
          console.error('Share creation error:', err);
          return res.status(500).json({ error: 'Database error: ' + err.message });
        }
      }

  } catch (error) {
    console.error('Share generation error:', error);
    res.status(500).json({ error: 'Failed to generate share link: ' + error.message });
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
  const bucketResult = await db.query('SELECT owner_email FROM buckets WHERE name = $1', [bucketName]);
  const bucket = bucketResult.rows[0];

  if (bucket && bucket.owner_email !== userEmail) {
    const memberResult = await db.query('SELECT permissions FROM members WHERE email = $1 AND bucket_name = $2', [userEmail, bucketName]);
    const member = memberResult.rows[0];

    if (member) {
      const permissions = JSON.parse(member.permissions);
      console.log('Delete permissions check:', permissions);

      // If user can only delete own files, check ownership
      if (!permissions.deleteFiles && !permissions.uploadViewAll && (permissions.deleteOwnFiles || permissions.uploadViewOwn)) {
        console.log('Checking ownership for delete operation...');
        for (const item of items) {
          const ownershipResult = await db.query('SELECT owner_email FROM file_ownership WHERE bucket_name = $1 AND file_path = $2', [bucketName, item]);
          const ownership = ownershipResult.rows[0];

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
    const bucketResult = await db.query('SELECT access_key, secret_key, region, owner_email FROM buckets WHERE name = $1', [bucketName]);
    const row = bucketResult.rows[0];
    if (!row) {
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
          try {
            await db.query('DELETE FROM file_ownership WHERE bucket_name = $1 AND file_path = $2', [bucketName, key]);
            console.log('Cleaned up ownership record for:', key);
          } catch (err) {
            console.error('Error cleaning up ownership record:', err);
          }
          
          // Log delete activity
          const action = key.endsWith('/') ? 'delete_folder' : 'delete';
          await logActivity(bucketName, userEmail, action, key);
        }
      }
      
      console.log('Delete operation completed successfully');
      res.json({ success: true, deleted: objectsToDelete.length });

  } catch (error) {
    console.error('Delete operation error:', error);
    res.status(500).json({ error: 'Delete failed: ' + error.message });
  }
});

// Create organization
app.post('/api/organizations', async (req, res) => {
  const { bucketName, organizationName } = req.body;
  
  try {
    const result = await db.query(
      'INSERT INTO organizations (bucket_name, name) VALUES ($1, $2) RETURNING id',
      [bucketName, organizationName]
    );
    res.json({ id: result.rows[0].id, name: organizationName });
  } catch (error) {
    console.error('Create organization error:', error);
    res.status(500).json({ error: 'Failed to create organization: ' + error.message });
  }
});

// Get folders in bucket for permission selection
app.get('/api/buckets/:bucketName/folders', async (req, res) => {
  const { bucketName } = req.params;
  const { ownerEmail } = req.query;
  
  try {
    const bucketResult = await db.query('SELECT access_key, secret_key, region, owner_email FROM buckets WHERE name = $1 AND owner_email = $2', [bucketName, ownerEmail]);
    const row = bucketResult.rows[0];
    if (!row) {
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
  } catch (error) {
    console.error('Fetch folders error:', error);
    res.status(500).json({ error: 'Failed to fetch folders: ' + error.message });
  }
});

// Get organization for bucket
app.get('/api/organizations/:bucketName', async (req, res) => {
  const { bucketName } = req.params;
  
  try {
    const result = await db.query('SELECT * FROM organizations WHERE bucket_name = $1', [bucketName]);
    res.json(result.rows[0] || null);
  } catch (error) {
    console.error('Get organization error:', error);
    res.status(500).json({ error: 'Failed to get organization: ' + error.message });
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
    const orgResult = await db.query('SELECT * FROM organizations WHERE bucket_name = $1', [bucketName]);
    const org = orgResult.rows[0];
    if (!org) {
      console.log('No organization found for bucket:', bucketName);
      return res.status(404).json({ error: 'Organization not found for this bucket' });
    }
    
    console.log('Organization found:', org.name);
    
    const inviteToken = uuidv4();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    
    console.log('Creating invitation in database...');
    try {
      await db.query(
        'INSERT INTO invitations (id, bucket_name, email, permissions, scope_type, scope_folders, expires_at, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        [inviteToken, bucketName, email, JSON.stringify(permissions), scopeType, JSON.stringify(scopeFolders || []), expiresAt, userEmail]
      );
      
      console.log('Invitation created successfully');
          
          const inviteLink = `${process.env.FRONTEND_URL}/accept-invite/${inviteToken}`;
          
          // Always succeed invitation creation, email is optional
          let emailSent = false;
          try {
            console.log('Attempting to send email...');
            console.log('Transporter configured:', !!transporter);
            console.log('SMTP_HOST:', process.env.SMTP_HOST);
            
            if (transporter && process.env.SMTP_HOST) {
              console.log('Sending email via transporter...');
              const mailOptions = {
                from: '"ShipFile" <noreply@example.com>',
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
              console.log('Mail options:', mailOptions);
              
              const result = await transporter.sendMail(mailOptions);
              console.log('Email send result:', result);
              emailSent = true;
              console.log('Email sent successfully to:', email);
            } else {
              console.log('Email not configured, providing invite link instead');
              console.log('Transporter exists:', !!transporter);
              console.log('SMTP_HOST exists:', !!process.env.SMTP_HOST);
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
    } catch (err) {
      console.error('Database error creating invitation:', err);
      return res.status(500).json({ error: 'Failed to create invitation: ' + err.message });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to send invitation' });
  }
});

// Get invitation details
app.get('/api/invite/:token', async (req, res) => {
  const { token } = req.params;
  
  try {
    const result = await db.query('SELECT i.*, o.name as org_name FROM invitations i JOIN organizations o ON i.bucket_name = o.bucket_name WHERE i.id = $1 AND i.accepted = false', [token]);
    const invite = result.rows[0];
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
  } catch (error) {
    console.error('Get invitation error:', error);
    res.status(500).json({ error: 'Failed to get invitation: ' + error.message });
  }
});

// Accept invitation
app.post('/api/invite/:token/accept', async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;
  
  try {
    const inviteResult = await db.query('SELECT * FROM invitations WHERE id = $1 AND accepted = false', [token]);
    const invite = inviteResult.rows[0];
    if (!invite) {
      return res.status(404).json({ error: 'Invitation not found' });
    }
    
    if (new Date(invite.expires_at) < new Date()) {
      return res.status(410).json({ error: 'Invitation has expired' });
    }
    
    const invitedBy = invite.created_by || 'owner';
    
    // Check if member already exists for this bucket
    const existingResult = await db.query('SELECT * FROM members WHERE email = $1 AND bucket_name = $2', [invite.email, invite.bucket_name]);
    const existingMember = existingResult.rows[0];
    
    if (existingMember) {
      // Update existing member's permissions
      await db.query(
        'UPDATE members SET password = $1, permissions = $2, scope_type = $3, scope_folders = $4, invited_by = $5 WHERE email = $6 AND bucket_name = $7',
        [password, invite.permissions, invite.scope_type, invite.scope_folders, invitedBy, invite.email, invite.bucket_name]
      );
      
      await db.query('UPDATE invitations SET accepted = true WHERE id = $1', [token]);
      
      res.json({ 
        message: 'Account updated successfully',
        bucketName: invite.bucket_name,
        email: invite.email,
        scopeType: invite.scope_type,
        scopeFolders: invite.scope_folders
      });
    } else {
      // Insert new member for this bucket
      await db.query(
        'INSERT INTO members (email, password, bucket_name, permissions, scope_type, scope_folders, invited_by) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [invite.email, password, invite.bucket_name, invite.permissions, invite.scope_type, invite.scope_folders, invitedBy]
      );
      
      await db.query('UPDATE invitations SET accepted = true WHERE id = $1', [token]);
      
      res.json({ 
        message: 'Account created successfully',
        bucketName: invite.bucket_name,
        email: invite.email,
        scopeType: invite.scope_type,
        scopeFolders: invite.scope_folders
      });
    }
  } catch (error) {
    console.error('Accept invitation error:', error);
    res.status(500).json({ error: 'Failed to accept invitation: ' + error.message });
  }
});

// Member login
app.post('/api/member/login', async (req, res) => {
  const { email, password } = req.body;
  
  try {
    // Get all buckets this member belongs to
    const result = await db.query('SELECT * FROM members WHERE email = $1 AND password = $2', [email, password]);
    const members = result.rows;
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
  } catch (error) {
    console.error('Member login error:', error);
    res.status(500).json({ error: 'Login failed: ' + error.message });
  }
});

// Get shared content (files and folders)
app.get('/api/shared/:shareId', async (req, res) => {
  const { shareId } = req.params;
  const { path = '' } = req.query;
  
  console.log('Shared folder request:', shareId, 'path:', path);
  
  try {
    const shareResult = await db.query('SELECT * FROM shares WHERE id = $1 AND revoked = false', [shareId]);
    const share = shareResult.rows[0];
    
    if (!share) {
      return res.status(404).json({ error: 'Share not found or expired' });
    }
    
    if (new Date(share.expires_at) < new Date()) {
      return res.status(410).json({ error: 'Share has expired' });
    }
    
    // Get bucket info
    const bucketResult = await db.query('SELECT access_key, secret_key, region FROM buckets WHERE name = $1', [share.bucket_name]);
    const bucket = bucketResult.rows[0];
    
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
    const shareResult = await db.query('SELECT * FROM shares WHERE id = $1 AND revoked = false', [shareId]);
    const share = shareResult.rows[0];
    
    if (!share || new Date(share.expires_at) < new Date()) {
      return res.status(404).send('Share not found or expired');
    }
    
    const bucketResult = await db.query('SELECT access_key, secret_key, region FROM buckets WHERE name = $1', [share.bucket_name]);
    const bucket = bucketResult.rows[0];
    
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
    const shareResult = await db.query('SELECT * FROM shares WHERE id = $1 AND revoked = false', [shareId]);
    const share = shareResult.rows[0];
    
    if (!share || new Date(share.expires_at) < new Date()) {
      return res.status(404).send('Share not found or expired');
    }
    
    const bucketResult = await db.query('SELECT access_key, secret_key, region FROM buckets WHERE name = $1', [share.bucket_name]);
    const bucket = bucketResult.rows[0];
    
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
    const bucketResult = await db.query('SELECT access_key, secret_key, region, owner_email FROM buckets WHERE name = $1', [bucketName]);
    const bucket = bucketResult.rows[0];

    if (!bucket) {
      return res.status(404).json({ error: 'Bucket not found' });
    }

    // Check permissions if not owner
    if (bucket.owner_email !== userEmail) {
      const memberResult = await db.query('SELECT permissions FROM members WHERE email = $1 AND bucket_name = $2', [userEmail, bucketName]);
      const member = memberResult.rows[0];

      if (!member) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const permissions = JSON.parse(member.permissions);
      console.log('Member permissions:', permissions);

      // Check if user has rename permissions
      if (!permissions.uploadViewAll && !permissions.deleteFiles) {
        // User can only rename own files - check ownership
        if (permissions.uploadViewOwn || permissions.deleteOwnFiles) {
          const ownershipResult = await db.query('SELECT owner_email FROM file_ownership WHERE bucket_name = $1 AND file_path = $2', [bucketName, oldKey]);
          const ownership = ownershipResult.rows[0];

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
      
      try {
        const membersResult = await db.query('SELECT email, scope_folders FROM members WHERE bucket_name = $1 AND scope_type = $2', [bucketName, 'specific']);
        const members = membersResult.rows;
        
        for (const member of members) {
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
              
              try {
                await db.query('UPDATE members SET scope_folders = $1 WHERE email = $2 AND bucket_name = $3', 
                  [JSON.stringify(updatedFolders), member.email, bucketName]);
                console.log(`✅ Updated permissions for ${member.email}`);
              } catch (updateErr) {
                console.error('Error updating member permissions after folder rename:', updateErr);
              }
            }
          } catch (parseErr) {
            console.error('Error parsing scope_folders for member:', member.email, parseErr);
          }
        }
      } catch (err) {
        console.error('Error fetching members for folder rename update:', err);
      }
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
      
      try {
        await db.query('UPDATE file_ownership SET file_path = $1 WHERE bucket_name = $2 AND file_path = $3', 
          [finalNewKey, bucketName, oldKey]);
        console.log('Updated ownership record:', oldKey, '->', finalNewKey);
      } catch (err) {
        console.error('Error updating ownership record:', err);
      };
    } else if (type === 'folder') {
      // Update ownership records for all files in the renamed folder
      const oldPrefix = oldKey.endsWith('/') ? oldKey : oldKey + '/';
      const newPrefix = currentPath ? `${currentPath}/${newName}/` : `${newName}/`;
      
      try {
        const filesResult = await db.query('SELECT file_path FROM file_ownership WHERE bucket_name = $1 AND file_path LIKE $2', 
          [bucketName, oldPrefix + '%']);
        const files = filesResult.rows;
        
        for (const file of files) {
          const newFilePath = file.file_path.replace(oldPrefix, newPrefix);
          try {
            await db.query('UPDATE file_ownership SET file_path = $1 WHERE bucket_name = $2 AND file_path = $3', 
              [newFilePath, bucketName, file.file_path]);
            console.log('Updated ownership record:', file.file_path, '->', newFilePath);
          } catch (updateErr) {
            console.error('Error updating ownership record for file in renamed folder:', updateErr);
          }
        }
      } catch (err) {
        console.error('Error fetching ownership records for folder rename:', err);
      };
    }
    
    // Log rename activity
    const finalNewKey = type === 'folder' ? 
      (currentPath ? `${currentPath}/${newName}/` : `${newName}/`) :
      (currentPath ? `${currentPath}/${newName}` : newName);
    
    const oldFileName = oldKey.split('/').pop();
    const newFileName = type === 'folder' ? newName : (newName.includes('.') ? newName : `${newName}.${oldFileName.split('.').pop()}`);
    
    await logActivity(bucketName, userEmail, 'rename', finalNewKey, oldFileName, newFileName);
    
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
    const bucketResult = await db.query('SELECT access_key, secret_key, region, owner_email FROM buckets WHERE name = $1', [bucketName]);
    const bucket = bucketResult.rows[0];

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
      const memberResult = await db.query('SELECT scope_type, scope_folders FROM members WHERE email = $1 AND bucket_name = $2', [userEmail, bucketName]);
      const member = memberResult.rows[0];

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
    const bucketResult = await db.query('SELECT access_key, secret_key, region, owner_email FROM buckets WHERE name = $1', [bucketName]);
    const bucket = bucketResult.rows[0];

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
      const memberResult = await db.query('SELECT scope_type, scope_folders FROM members WHERE email = $1 AND bucket_name = $2', [memberEmail, bucketName]);
      const member = memberResult.rows[0];

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
    const bucketResult = await db.query('SELECT owner_email FROM buckets WHERE name = $1', [bucketName]);
    const bucket = bucketResult.rows[0];
    if (!bucket) {
      console.log('Bucket not found');
      return res.status(404).json({ error: 'Bucket not found' });
    }
    
    console.log('Bucket owner email:', bucket.owner_email);
    console.log('Requested by email:', ownerEmail);
    
    if (bucket.owner_email !== ownerEmail) {
      console.log('Owner email mismatch!');
      return res.status(403).json({ error: 'Only bucket owner can view all members' });
    }
    
    // Get all members for this bucket
    const membersResult = await db.query('SELECT email, permissions, scope_type, scope_folders, invited_by FROM members WHERE bucket_name = $1', [bucketName]);
    console.log('Members found:', membersResult.rows);
    res.json(membersResult.rows || []);
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
      const result = await db.query('SELECT email, scope_type, scope_folders FROM members WHERE bucket_name = $1', [bucketName]);
      res.json(result.rows || []);
    } else {
      // Member can only see members they invited
      const result = await db.query('SELECT email, scope_type, scope_folders FROM members WHERE bucket_name = $1 AND invited_by = $2', [bucketName, userEmail]);
      res.json(result.rows || []);
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
    const result = await db.query('SELECT permissions, scope_type, scope_folders FROM members WHERE email = $1 AND bucket_name = $2', 
      [email, bucketName]);
    const member = result.rows[0];
    if (!member) {
      return res.status(404).json({ error: 'Member not found in this bucket' });
    }
    res.json(member);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get member permissions' });
  }
});

// Get member's bucket-specific permissions
app.get('/api/member/:email/bucket/:bucketName', async (req, res) => {
  const { email, bucketName } = req.params;

  try {
    const result = await db.query('SELECT permissions, scope_type, scope_folders FROM members WHERE email = $1 AND bucket_name = $2', 
      [email, bucketName]);
    const member = result.rows[0];
    if (!member) {
      return res.status(404).json({ error: 'Member not found in this bucket' });
    }
    res.json({
      bucketName: bucketName,
      permissions: member.permissions,
      scopeType: member.scope_type,
      scopeFolders: member.scope_folders
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
    await db.query(
      'INSERT INTO file_ownership (bucket_name, file_path, owner_email, uploaded_at) VALUES ($1, $2, $3, $4) ON CONFLICT (bucket_name, file_path) DO UPDATE SET owner_email = $3, uploaded_at = $4',
      [bucketName, filePath, ownerEmail, new Date().toISOString()]
    );
    console.log('✅ File ownership tracked successfully');
    
    // Log the upload activity
    await logActivity(bucketName, ownerEmail, 'upload', filePath);
    
    res.json({ success: true });
  } catch (error) {
    console.error('File ownership tracking error:', error);
    res.status(500).json({ error: 'Failed to track ownership: ' + error.message });
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
    const result = await db.query(
      'SELECT file_path FROM file_ownership WHERE bucket_name = $1 AND owner_email = $2',
      [bucketName, userEmail]
    );
    console.log('Owned files found:', result.rows);
    res.json(result.rows || []);
  } catch (error) {
    console.error('Get owned files error:', error);
    res.status(500).json({ error: 'Failed to get owned files: ' + error.message });
  }
});

// Member Google login
app.post('/api/member/google-login', async (req, res) => {
  const { email } = req.body;
  
  try {
    // Get all buckets this member belongs to
    const result = await db.query('SELECT * FROM members WHERE email = $1', [email]);
    const members = result.rows;
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
  } catch (error) {
    console.error('Google login error:', error);
    res.status(500).json({ error: 'Google login failed: ' + error.message });
  }
});

// Change member password
app.post('/api/member/change-password', async (req, res) => {
  const { email, currentPassword, newPassword } = req.body;
  
  try {
    const memberResult = await db.query('SELECT * FROM members WHERE email = $1 AND password = $2', [email, currentPassword]);
    const member = memberResult.rows[0];
    if (!member) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    
    await db.query('UPDATE members SET password = $1 WHERE email = $2', [newPassword, email]);
    
    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({ error: 'Password change failed: ' + error.message });
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
    const result = await db.query(
      'UPDATE members SET permissions = $1, scope_type = $2, scope_folders = $3 WHERE email = $4 AND bucket_name = $5',
      [JSON.stringify(permissions), scopeType, JSON.stringify(scopeFolders), email, bucketName]
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Member not found' });
    }
    
    console.log('Member permissions updated successfully');
    
    // Log permission change activity
    await logActivity(bucketName, 'owner', 'permission_change', email, null, 'Permissions updated');
    
    res.json({ success: true, message: 'Permissions updated successfully' });
  } catch (error) {
    console.error('Error updating member permissions:', error);
    res.status(500).json({ error: 'Failed to update permissions: ' + error.message });
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
    const bucketResult = await db.query('SELECT owner_email FROM buckets WHERE name = $1', [bucketName]);
    const bucket = bucketResult.rows[0];
    if (!bucket) {
      console.log('Bucket not found');
      return res.status(404).json({ error: 'Bucket not found' });
    }
    
    if (bucket.owner_email !== ownerEmail) {
      console.log('Owner email mismatch!');
      return res.status(403).json({ error: 'Only bucket owner can view activity logs' });
    }
    
    // Get activity logs for this bucket (most recent first)
    const logsResult = await db.query(
      'SELECT user_email, action, resource_path, old_name, details, timestamp FROM activity_logs WHERE bucket_name = $1 ORDER BY timestamp DESC LIMIT 100',
      [bucketName]
    );
    console.log('Activity logs found:', logsResult.rows.length);
    res.json(logsResult.rows || []);
  } catch (error) {
    console.error('Failed to load activity logs:', error);
    res.status(500).json({ error: 'Failed to load logs: ' + error.message });
  }
});

// Remove member from organization
app.delete('/api/members/:email', async (req, res) => {
  const { email } = req.params;
  const { bucketName } = req.body;
  
  try {
    const result = await db.query(
      'DELETE FROM members WHERE email = $1 AND bucket_name = $2',
      [email, bucketName]
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Member not found' });
    }
    
    console.log('Member removed successfully:', email);
    
    // Log member removal activity
    await logActivity(bucketName, 'owner', 'member_removed', email, null, 'Member removed from organization');
    
    res.json({ success: true, message: 'Member removed successfully' });
  } catch (error) {
    console.error('Error removing member:', error);
    res.status(500).json({ error: 'Failed to remove member: ' + error.message });
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
    const response = await fetch('http://localhost:3001/api/invite', {
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
    const result = await db.query('SELECT email, scope_folders, scope_type FROM members WHERE email = $1 AND bucket_name = $2', 
      [email, bucketName]);
    const member = result.rows[0];
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
  } catch (error) {
    console.error('Debug member error:', error);
    res.status(500).json({ error: 'Failed to get member info: ' + error.message });
  }
});

// Access shared content
app.get('/api/share/:shareId', async (req, res) => {
  const { shareId } = req.params;
  
  try {
    const shareResult = await db.query('SELECT * FROM shares WHERE id = $1 AND revoked = false', [shareId]);
    const share = shareResult.rows[0];
    
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
    
    const bucketResult = await db.query('SELECT access_key, secret_key, region FROM buckets WHERE name = $1', [share.bucket_name]);
    const bucket = bucketResult.rows[0];
    
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
    const shareResult = await db.query('SELECT * FROM shares WHERE id = $1 AND revoked = false', [shareId]);
    const share = shareResult.rows[0];
    
    if (!share || new Date(share.expires_at) < new Date()) {
      return res.status(404).send('Share not found or expired');
    }
    
    const bucketResult = await db.query('SELECT access_key, secret_key, region FROM buckets WHERE name = $1', [share.bucket_name]);
    const bucket = bucketResult.rows[0];
    
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
    const bucketsResult = await db.query('SELECT name, access_key, secret_key, region FROM buckets WHERE owner_email = $1', [ownerEmail]);
    const buckets = bucketsResult.rows;

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
        const memberCountResult = await db.query('SELECT COUNT(*) as count FROM members WHERE bucket_name = $1', [bucket.name]);
        const memberCount = parseInt(memberCountResult.rows[0].count);
        memberStats[bucket.name] = memberCount;

        // Get share count for this bucket
        const shareCountResult = await db.query('SELECT COUNT(*) as count FROM shares WHERE bucket_name = $1 AND revoked = false AND expires_at > NOW()', [bucket.name]);
        const shareCount = parseInt(shareCountResult.rows[0].count);
        shareStats[bucket.name] = shareCount;

      } catch (error) {
        console.error(`Error analyzing bucket ${bucket.name}:`, error);
      }
    }

    // Get overall activity stats
    const activeUsersResult = await db.query('SELECT COUNT(DISTINCT user_email) as count FROM activity_logs WHERE timestamp > NOW() - INTERVAL \'30 days\'');
    const activeUsers = parseInt(activeUsersResult.rows[0].count);

    const recentUploadsResult = await db.query('SELECT COUNT(*) as count FROM activity_logs WHERE action = $1 AND timestamp > NOW() - INTERVAL \'7 days\'', ['upload']);
    const recentUploads = parseInt(recentUploadsResult.rows[0].count);

    const totalMembersResult = await db.query('SELECT COUNT(*) as count FROM members');
    const totalMembers = parseInt(totalMembersResult.rows[0].count);

    const totalSharesResult = await db.query('SELECT COUNT(*) as count FROM shares WHERE revoked = false AND expires_at > NOW()');
    const totalShares = parseInt(totalSharesResult.rows[0].count);

    const recentActivityResult = await db.query('SELECT user_email, action, resource_path, timestamp, bucket_name FROM activity_logs ORDER BY timestamp DESC LIMIT 20');
    const recentActivity = recentActivityResult.rows;

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
    const bucketResult = await db.query('SELECT access_key, secret_key, region, owner_email FROM buckets WHERE name = $1 AND owner_email = $2', [bucketName, ownerEmail]);
    const bucket = bucketResult.rows[0];

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
    const fileOwnershipResult = await db.query('SELECT owner_email, COUNT(*) as files FROM file_ownership WHERE bucket_name = $1 GROUP BY owner_email', [bucketName]);
    const fileOwnership = fileOwnershipResult.rows;

    fileOwnership.forEach(row => {
      uploadsByUser[row.owner_email] = row.files;
    });

    // Get user activity stats
    const activeUsersResult = await db.query('SELECT COUNT(DISTINCT user_email) as count FROM activity_logs WHERE bucket_name = $1 AND timestamp > NOW() - INTERVAL \'30 days\'', [bucketName]);
    const activeUsers = parseInt(activeUsersResult.rows[0].count);

    const recentUploadsResult = await db.query('SELECT COUNT(*) as count FROM activity_logs WHERE bucket_name = $1 AND action = $2 AND timestamp > NOW() - INTERVAL \'7 days\'', [bucketName, 'upload']);
    const recentUploads = parseInt(recentUploadsResult.rows[0].count);

    const totalMembersResult = await db.query('SELECT COUNT(*) as count FROM members WHERE bucket_name = $1', [bucketName]);
    const totalMembers = parseInt(totalMembersResult.rows[0].count);

    const totalSharesResult = await db.query('SELECT COUNT(*) as count FROM shares WHERE bucket_name = $1 AND revoked = false AND expires_at > NOW()', [bucketName]);
    const totalShares = parseInt(totalSharesResult.rows[0].count);

    const recentActivityResult = await db.query('SELECT user_email, action, resource_path, timestamp FROM activity_logs WHERE bucket_name = $1 ORDER BY timestamp DESC LIMIT 15', [bucketName]);
    const recentActivity = recentActivityResult.rows;

    const memberListResult = await db.query('SELECT email, permissions, scope_type FROM members WHERE bucket_name = $1', [bucketName]);
    const memberList = memberListResult.rows;

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

// Test database connection
app.get('/api/test-db', async (req, res) => {
  try {
    const result = await db.query('SELECT NOW() as current_time, version() as db_version');
    res.json({
      success: true,
      message: 'Database connection successful',
      data: result.rows[0],
      config: {
        hasConnectionString: !!process.env.DATABASE_URL,
        nodeEnv: process.env.NODE_ENV,
        sslEnabled: !!dbConfig.ssl
      }
    });
  } catch (error) {
    console.error('Database test failed:', error);
    res.status(500).json({
      error: 'Database connection failed: ' + error.message,
      details: error.stack
    });
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

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'ShipFile API Server',
    status: 'Running',
    endpoints: {
      health: '/api/health',
      testDb: '/api/test-db',
      buckets: '/api/buckets'
    }
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Environment check:');
  console.log('- NODE_ENV:', process.env.NODE_ENV);
  console.log('- DATABASE_URL:', process.env.DATABASE_URL ? 'SET' : 'NOT SET');
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