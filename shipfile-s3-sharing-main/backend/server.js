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
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Database setup
const db = new sqlite3.Database(join(__dirname, 'shipfile.db'));
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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
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
          const folderName = itemKey.split('/')[0];
          
          if (member.scope_type === 'specific') {
            if (!allowedFolders.includes(folderName)) {
              return reject(new Error(`You do not have permission to access the folder: ${folderName}`));
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

        const s3Key = folderPath ? `${folderPath}/${fileName}` : fileName;

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
      res.json({ success: true, folderPath: folderKey });
    });

  } catch (error) {
    res.status(500).json({ error: 'Failed to create folder' });
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

    // Check member permissions
    const member = await new Promise((resolve, reject) => {
      db.get('SELECT scope_type, scope_folders FROM members WHERE email = ? AND bucket_name = ?', [userEmail, bucketName], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!member) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Apply folder scoping
    if (member.scope_type === 'specific') {
      const allowedFolders = JSON.parse(member.scope_folders || '[]');
      
      if (!prefix) {
        // Root directory - only show allowed folders
        const filteredItems = items.filter(item => 
          item.type === 'folder' && allowedFolders.includes(item.name)
        );
        return res.json(filteredItems);
      } else {
        // Inside folder - check if allowed
        const currentFolder = prefix.split('/')[0];
        if (!allowedFolders.includes(currentFolder)) {
          return res.status(403).json({ error: 'You do not have permission to view this folder.' });
        }
        // If allowed, show all items in this folder
        return res.json(items);
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
            
            const shareUrl = isSingleFolder 
              ? `http://localhost:8080/shared-folder/${shareId}`
              : `http://localhost:3001/api/share/${shareId}/download`;
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
      
      for (const item of items) {
        if (item.endsWith('/') || item.includes('/')) {
          const prefix = item.endsWith('/') ? item : item + '/';
          const listCommand = new ListObjectsV2Command({ Bucket: bucketName, Prefix: prefix });
          const listResponse = await s3Client.send(listCommand);
          
          if (listResponse.Contents) {
            listResponse.Contents.forEach(obj => {
              objectsToDelete.push({ Key: obj.Key });
            });
          }
        } else {
          objectsToDelete.push({ Key: item });
        }
      }

      if (objectsToDelete.length > 0) {
        const deleteCommand = new DeleteObjectsCommand({
          Bucket: bucketName,
          Delete: { Objects: objectsToDelete }
        });
        
        await s3Client.send(deleteCommand);
      }
      
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
  
  try {
    // Check if member is trying to grant permissions they don't have
    if (req.memberPermissions) {
      const memberPerms = req.memberPermissions.permissions;
      const memberScopeType = req.memberPermissions.scopeType;
      const memberScopeFolders = req.memberPermissions.scopeFolders;
      
      // Check each permission being granted
      for (const [perm, value] of Object.entries(permissions)) {
        if (value && !memberPerms[perm]) {
          return res.status(403).json({ error: `You can't grant permissions higher than your own. You don't have '${perm}' permission.` });
        }
      }
      
      // Check scope restrictions
      if (scopeType === 'specific' && memberScopeType === 'specific') {
        const requestedFolders = scopeFolders || [];
        const invalidFolders = requestedFolders.filter(folder => !memberScopeFolders.includes(folder));
        if (invalidFolders.length > 0) {
          return res.status(403).json({ error: `You can't grant access to folders you don't have access to: ${invalidFolders.join(', ')}` });
        }
      } else if (scopeType === 'entire' && memberScopeType !== 'entire') {
        return res.status(403).json({ error: 'You can\'t grant entire bucket access when you have limited access.' });
      }
    }
    
    db.get('SELECT * FROM organizations WHERE bucket_name = ?', [bucketName], async (err, org) => {
      if (err || !org) {
        return res.status(404).json({ error: 'Organization not found for this bucket' });
      }
      
      const inviteToken = uuidv4();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      
      db.run(
        'INSERT INTO invitations (id, bucket_name, email, permissions, scope_type, scope_folders, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [inviteToken, bucketName, email, JSON.stringify(permissions), scopeType, JSON.stringify(scopeFolders || []), expiresAt],
        async function(err) {
          if (err) {
            return res.status(500).json({ error: 'Failed to create invitation' });
          }
          
          const inviteLink = `${process.env.FRONTEND_URL}/accept-invite/${inviteToken}`;
          
          try {
            await transporter.sendMail({
              from: '"ShipFile" <noreply@example.com>',
              to: email,
              subject: "You've been invited to join ShipFile",
              html: `
                <h2>You've been invited to join ShipFile</h2>
                <p>You have been invited to join the organization <strong>${org.name}</strong> with <strong>${permissions}</strong> permissions.</p>
                <p>Click the link below to accept the invitation:</p>
                <a href="${inviteLink}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Accept Invitation</a>
                <p>This invitation will expire in 7 days.</p>
                <p>If you didn't expect this invitation, you can safely ignore this email.</p>
              `
            });
            
            res.json({ 
              message: 'Invitation sent successfully',
              email: email
            });
          } catch (emailError) {
            console.error('Failed to send email:', emailError);
            res.status(500).json({ error: 'Failed to send invitation email' });
          }
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
      
      db.run(
        'INSERT OR REPLACE INTO members (email, password, bucket_name, permissions, scope_type, scope_folders) VALUES (?, ?, ?, ?, ?, ?)',
        [invite.email, password, invite.bucket_name, invite.permissions, invite.scope_type, invite.scope_folders],
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
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to accept invitation' });
  }
});

// Member login
app.post('/api/member/login', async (req, res) => {
  const { email, password } = req.body;
  
  try {
    db.get('SELECT * FROM members WHERE email = ? AND password = ?', [email, password], (err, member) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      if (!member) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }
      
      res.json({
        message: 'Login successful',
        member: {
          email: member.email,
          bucketName: member.bucket_name,
          permissions: member.permissions,
          scopeType: member.scope_type,
          scopeFolders: member.scope_folders
        }
      });
    });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get shared folder contents
app.get('/api/shared-folder/:shareId', async (req, res) => {
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
    
    const items = JSON.parse(share.items);
    const folder = items[0];
    
    if (!folder || folder.type !== 'folder') {
      return res.status(400).json({ error: 'Invalid folder share' });
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
    
    // List folder contents
    const s3Client = new S3Client({
      region: bucket.region,
      credentials: {
        accessKeyId: bucket.access_key,
        secretAccessKey: bucket.secret_key,
      },
    });
    
    const folderPath = path ? `${folder.key}${path}/` : folder.key;
    const command = new ListObjectsV2Command({
      Bucket: share.bucket_name,
      Prefix: folderPath,
      Delimiter: '/'
    });
    
    const response = await s3Client.send(command);
    const contents = [];
    
    // Add folders
    if (response.CommonPrefixes) {
      response.CommonPrefixes.forEach(prefixObj => {
        const name = prefixObj.Prefix.replace(folderPath, '').replace('/', '');
        if (name) {
          contents.push({
            name,
            type: 'folder',
            key: prefixObj.Prefix,
            modified: new Date().toISOString().split('T')[0]
          });
        }
      });
    }
    
    // Add files
    if (response.Contents) {
      response.Contents.forEach(obj => {
        if (!obj.Key.endsWith('/')) {
          const name = obj.Key.replace(folderPath, '');
          if (name && !name.includes('/')) {
            contents.push({
              name,
              type: 'file',
              key: obj.Key,
              size: `${(obj.Size / 1024 / 1024).toFixed(2)} MB`,
              modified: obj.LastModified.toISOString().split('T')[0],
              fileType: name.split('.').pop()
            });
          }
        }
      });
    }
    
    res.json({
      folderName: folder.name,
      currentPath: path,
      contents,
      expiresAt: share.expires_at
    });
    
  } catch (error) {
    console.error('Shared folder error:', error);
    res.status(500).json({ error: 'Failed to load shared folder' });
  }
});

// Download file from shared folder
app.get('/api/shared-folder/:shareId/download/*', async (req, res) => {
  const { shareId } = req.params;
  const fileKey = req.params[0];
  
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

    res.json({ success: true, message: 'Renamed successfully' });

  } catch (error) {
    console.error('Rename error:', error);
    res.status(500).json({ error: 'Failed to rename' });
  }
});

// Member Google login
app.post('/api/member/google-login', async (req, res) => {
  const { email } = req.body;
  
  try {
    db.get('SELECT * FROM members WHERE email = ?', [email], (err, member) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      if (!member) {
        return res.status(401).json({ error: 'You are not a member of any organization. Please contact your administrator for an invitation.' });
      }
      
      res.json({
        message: 'Google login successful',
        member: {
          email: member.email,
          bucketName: member.bucket_name,
          permissions: member.permissions,
          scopeType: member.scope_type,
          scopeFolders: member.scope_folders
        }
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

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});