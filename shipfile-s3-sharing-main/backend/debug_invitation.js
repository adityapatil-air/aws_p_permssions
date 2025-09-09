// Debug script to test invitation functionality
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const db = new sqlite3.Database(join(__dirname, 'shipfile.db'));

console.log('=== INVITATION DEBUG SIMULATION ===');

// Simulate the invitation request that's failing
const testInvitation = {
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

console.log('Test invitation data:', testInvitation);

// Check if organization exists
db.get('SELECT * FROM organizations WHERE bucket_name = ?', [testInvitation.bucketName], (err, org) => {
  if (err) {
    console.error('Database error:', err);
    return;
  }
  
  if (!org) {
    console.log('❌ No organization found for bucket:', testInvitation.bucketName);
    return;
  }
  
  console.log('✅ Organization found:', org.name);
  
  // Check member permissions for rr@gmail.com
  db.get('SELECT permissions, scope_type, scope_folders FROM members WHERE email = ? AND bucket_name = ?', 
    [testInvitation.userEmail, testInvitation.bucketName], (err, member) => {
    
    if (err) {
      console.error('Database error checking member:', err);
      return;
    }
    
    if (!member) {
      console.log('❌ Member not found:', testInvitation.userEmail);
      return;
    }
    
    console.log('✅ Member found:', testInvitation.userEmail);
    console.log('Member permissions:', member.permissions);
    console.log('Member scope_type:', member.scope_type);
    console.log('Member scope_folders:', member.scope_folders);
    
    const memberPerms = JSON.parse(member.permissions);
    console.log('Parsed member permissions:', memberPerms);
    
    // Check if member has invite permission
    if (!memberPerms.inviteMembers) {
      console.log('❌ Member does not have inviteMembers permission');
      return;
    }
    
    console.log('✅ Member has inviteMembers permission');
    
    // Check scope validation
    if (testInvitation.scopeType === 'specific' && member.scope_type === 'specific') {
      const requestedFolders = testInvitation.scopeFolders || [];
      const memberAllowedFolders = JSON.parse(member.scope_folders || '[]');
      
      console.log('Checking scope restrictions...');
      console.log('Member allowed folders:', memberAllowedFolders);
      console.log('Requested folders:', requestedFolders);
      
      const invalidFolders = requestedFolders.filter(folder => {
        return !memberAllowedFolders.some(allowedFolder => {
          const isValid = folder === allowedFolder || 
                         folder.startsWith(allowedFolder + '/') || 
                         allowedFolder.startsWith(folder + '/');
          console.log(`Checking ${folder} against ${allowedFolder}: ${isValid}`);
          return isValid;
        });
      });
      
      if (invalidFolders.length > 0) {
        console.log('❌ Invalid folders detected:', invalidFolders);
        console.log('ERROR: You can\'t grant access to folders outside your scope');
        return;
      }
      
      console.log('✅ Scope validation passed');
    }
    
    console.log('✅ All validations passed - invitation should work!');
    
    db.close();
  });
});