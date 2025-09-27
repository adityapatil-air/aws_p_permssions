// Fix for real-time permission synchronization
// This script addresses the issue where members don't see updated permissions immediately

import express from 'express';
import database from './database.js';

// Add a new endpoint to force refresh member permissions
const addPermissionRefreshEndpoint = (app) => {
  // Endpoint for members to get their latest permissions
  app.get('/api/member/:email/permissions/refresh', async (req, res) => {
    const { email } = req.params;
    const { bucketName } = req.query;
    
    console.log(`🔄 Refreshing permissions for ${email} in ${bucketName}`);
    
    try {
      // Get fresh permissions from database
      const member = await new Promise((resolve, reject) => {
        database.get(
          'SELECT permissions, scope_type, scope_folders FROM members WHERE email = ? AND bucket_name = ?',
          [email, bucketName],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });
      
      if (!member) {
        return res.status(404).json({ error: 'Member not found' });
      }
      
      console.log(`✅ Fresh permissions for ${email}:`, member.permissions);
      
      // Set cache control headers to prevent caching
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      
      res.json({
        bucketName: bucketName,
        permissions: member.permissions,
        scopeType: member.scope_type,
        scopeFolders: member.scope_folders,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('Error refreshing member permissions:', error);
      res.status(500).json({ error: 'Failed to refresh permissions' });
    }
  });
  
  // Enhanced member bucket permissions endpoint with real-time refresh
  app.get('/api/member/buckets/refresh', (req, res) => {
    const { memberEmail } = req.query;
    
    if (!memberEmail) {
      return res.status(400).json({ error: 'Member email is required' });
    }
    
    console.log(`🔄 Refreshing all bucket permissions for ${memberEmail}`);
    
    database.all(
      'SELECT bucket_name, permissions, scope_type, scope_folders FROM members WHERE email = ?',
      [memberEmail],
      (err, rows) => {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ error: 'Database error' });
        }
        
        console.log(`Found ${rows.length} buckets for member with fresh permissions`);
        
        const buckets = rows.map(row => {
          console.log(`Bucket ${row.bucket_name} fresh permissions:`, row.permissions);
          return {
            bucketName: row.bucket_name,
            permissions: row.permissions,
            scopeType: row.scope_type,
            scopeFolders: row.scope_folders
          };
        });
        
        // Prevent caching
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        
        res.json({
          buckets: buckets,
          timestamp: new Date().toISOString()
        });
      }
    );
  });
};

export { addPermissionRefreshEndpoint };