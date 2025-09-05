import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { S3Client, CreateBucketCommand, ListObjectsV2Command, PutBucketCorsCommand, GetObjectCommand, DeleteObjectCommand, DeleteObjectsCommand, PutObjectAclCommand } from '@aws-sdk/client-s3';
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
    name TEXT UNIQUE,
    region TEXT,
    access_key TEXT,
    secret_key TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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

// Validate AWS credentials and create bucket
app.post('/api/buckets', async (req, res) => {
  const { accessKey, secretKey, region, bucketName } = req.body;

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
      'INSERT INTO buckets (name, region, access_key, secret_key) VALUES (?, ?, ?, ?)',
      [bucketName, region, accessKey, secretKey],
      function(err) {
        if (err) {
          return res.status(500).json({ error: 'Database error' });
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

// Get all buckets
app.get('/api/buckets', (req, res) => {
  db.all('SELECT id, name, region, created_at FROM buckets', (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(rows.map(row => ({
      id: row.id,
      name: row.name,
      region: row.region,
      created: row.created_at.split(' ')[0]
    })));
  });
});

// Generate pre-signed upload URL
app.post('/api/upload-url', async (req, res) => {
  const { bucketName, fileName, fileType, folderPath = '' } = req.body;

  try {
    db.get('SELECT access_key, secret_key, region FROM buckets WHERE name = ?', [bucketName], async (err, row) => {
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
    });

  } catch (error) {
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
});

// Create folder
app.post('/api/folders', async (req, res) => {
  const { bucketName, folderName, currentPath = '' } = req.body;

  try {
    db.get('SELECT access_key, secret_key, region FROM buckets WHERE name = ?', [bucketName], async (err, row) => {
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
  const { prefix = '' } = req.query;

  try {
    db.get('SELECT access_key, secret_key, region FROM buckets WHERE name = ?', [bucketName], async (err, row) => {
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

      res.json(items);
    });

  } catch (error) {
    res.status(500).json({ error: 'Failed to list files' });
  }
});

// Download files/folders
app.post('/api/download', async (req, res) => {
  const { bucketName, items } = req.body;

  try {
    db.get('SELECT access_key, secret_key, region FROM buckets WHERE name = ?', [bucketName], async (err, row) => {
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
app.post('/api/share', async (req, res) => {
  const { bucketName, items, shareType, expiryHours } = req.body;

  try {
    db.get('SELECT access_key, secret_key, region FROM buckets WHERE name = ?', [bucketName], async (err, row) => {
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
        
        db.run(
          'INSERT INTO shares (id, bucket_name, items, permissions, expires_at) VALUES (?, ?, ?, ?, ?)',
          [shareId, bucketName, JSON.stringify(items), 'read', expiresAt],
          function(err) {
            if (err) {
              return res.status(500).json({ error: 'Database error' });
            }
            const shareUrl = `http://localhost:3001/api/share/${shareId}/download`;
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
app.delete('/api/delete', async (req, res) => {
  const { bucketName, items } = req.body;

  try {
    db.get('SELECT access_key, secret_key, region FROM buckets WHERE name = ?', [bucketName], async (err, row) => {
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
app.post('/api/invite', async (req, res) => {
  const { bucketName, email, permissions } = req.body;
  
  try {
    db.get('SELECT * FROM organizations WHERE bucket_name = ?', [bucketName], async (err, org) => {
      if (err || !org) {
        return res.status(404).json({ error: 'Organization not found for this bucket' });
      }
      
      const inviteToken = uuidv4();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      
      db.run(
        'INSERT INTO invitations (id, bucket_name, email, permissions, expires_at) VALUES (?, ?, ?, ?, ?)',
        [inviteToken, bucketName, email, permissions, expiresAt],
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
        'INSERT OR REPLACE INTO members (email, password, bucket_name, permissions) VALUES (?, ?, ?, ?)',
        [invite.email, password, invite.bucket_name, invite.permissions],
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
              email: invite.email
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
          permissions: member.permissions
        }
      });
    });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
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
          permissions: member.permissions
        }
      });
    });
  } catch (error) {
    res.status(500).json({ error: 'Google login failed' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});