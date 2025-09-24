// Updated Permission Middleware using the new simplified permission system
import PermissionSystem from './permission-system.js';

const permissionSystem = new PermissionSystem();

/**
 * Enhanced permission checking middleware
 */
export const checkPermission = (action) => {
  return (req, res, next) => {
    const { bucketName, userEmail, items } = req.body;
    
    if (!userEmail) {
      return res.status(401).json({ error: 'User email required' });
    }
    
    // Get bucket info
    req.db.get('SELECT owner_email FROM buckets WHERE name = ?', [bucketName], (err, bucket) => {
      if (err || !bucket) {
        return res.status(404).json({ error: 'Bucket not found' });
      }
      
      // Owner has all permissions
      if (bucket.owner_email === userEmail) {
        return next();
      }
      
      // Check member permissions
      req.db.get('SELECT permissions, scope_type, scope_folders FROM members WHERE email = ? AND bucket_name = ?', 
        [userEmail, bucketName], (err, member) => {
        if (err || !member) {
          return res.status(403).json({ 
            error: `You do not have permission to perform ${action.toUpperCase()} on this bucket. Please contact the owner for access.` 
          });
        }
        
        try {
          const oldPermissions = JSON.parse(member.permissions);
          const newPermissions = permissionSystem.convertFromOldFormat(oldPermissions);
          
          // Check if user has the required permission
          if (!permissionSystem.hasPermission(newPermissions, action)) {
            return res.status(403).json({ 
              error: getPermissionErrorMessage(action)
            });
          }
          
          // For file-specific operations, check ownership if needed
          if (items && items.length > 0 && (action === 'delete_file' || action === 'rename_file')) {
            checkFileOwnership(req.db, bucketName, userEmail, items, newPermissions, action)
              .then(() => next())
              .catch(error => res.status(403).json({ error: error.message }));
          } else {
            // For folder access operations, check scope
            if (items && items.length > 0) {
              checkFolderAccess(req.db, userEmail, bucketName, items, member.scope_type, member.scope_folders)
                .then(() => next())
                .catch(error => res.status(403).json({ error: error.message }));
            } else {
              next();
            }
          }
          
          // Store member permissions for further use
          req.memberPermissions = { 
            permissions: newPermissions, 
            scopeType: member.scope_type, 
            scopeFolders: JSON.parse(member.scope_folders || '[]') 
          };
          
        } catch (error) {
          console.error('Error parsing member permissions:', error);
          return res.status(500).json({ error: 'Invalid permission format' });
        }
      });
    });
  };
};

/**
 * Check file ownership for operations that require it
 */
const checkFileOwnership = async (db, bucketName, userEmail, items, permissions, action) => {
  // If user can manage all files, no ownership check needed
  if (permissions.upload === 'upload_manage_all') {
    return Promise.resolve();
  }
  
  // If user can only manage own files, check ownership
  if (permissions.upload === 'upload_manage_own') {
    return new Promise((resolve, reject) => {
      const itemKeys = Array.isArray(items) ? items : [items];
      
      // Check ownership for each item
      const ownershipChecks = itemKeys.map(item => {
        const itemKey = typeof item === 'string' ? item : item.key;
        
        return new Promise((resolveItem, rejectItem) => {
          db.get('SELECT owner_email FROM file_ownership WHERE bucket_name = ? AND file_path = ?', 
            [bucketName, itemKey], (err, ownership) => {
            if (err) {
              rejectItem(err);
            } else if (!ownership) {
              rejectItem(new Error(`No ownership record found for: ${itemKey}`));
            } else if (ownership.owner_email !== userEmail) {
              rejectItem(new Error(`You can only ${action.replace('_', ' ')} files you uploaded: ${itemKey}`));
            } else {
              resolveItem();
            }
          });
        });
      });
      
      Promise.all(ownershipChecks)
        .then(() => resolve())
        .catch(error => reject(error));
    });
  }
  
  return Promise.reject(new Error(`You do not have permission to ${action.replace('_', ' ')} files`));
};

/**
 * Check folder access based on member scope
 */
const checkFolderAccess = (db, userEmail, bucketName, items, scopeType, scopeFolders) => {
  return new Promise((resolve, reject) => {
    // If scope is 'entire' or undefined, allow access
    if (!scopeType || scopeType === 'entire') {
      return resolve();
    }
    
    const allowedFolders = JSON.parse(scopeFolders || '[]');
    const itemKeys = Array.isArray(items) ? items : [items];
    
    // Check each item
    for (const item of itemKeys) {
      const itemKey = typeof item === 'string' ? item : (item.key || item);
      
      if (scopeType === 'specific') {
        const isAllowed = allowedFolders.some(allowedFolder => {
          return itemKey === allowedFolder || 
                 itemKey.startsWith(allowedFolder + '/') || 
                 allowedFolder.startsWith(itemKey + '/');
        });
        
        if (!isAllowed) {
          return reject(new Error(`You do not have permission to access: ${itemKey}. Allowed folders: ${allowedFolders.join(', ')}`));
        }
      }
    }
    
    resolve();
  });
};

/**
 * Get user-friendly error messages for different permission types
 */
const getPermissionErrorMessage = (action) => {
  const messages = {
    'view_files': 'You do not have permission to view files in this bucket.',
    'upload': 'You do not have permission to upload files. Please contact the owner for access.',
    'download': 'You do not have permission to download files. Please contact the owner for access.',
    'delete_file': 'You do not have permission to delete files. You can only delete files you uploaded.',
    'rename_file': 'You do not have permission to rename files. You can only rename files you uploaded.',
    'share': 'You do not have permission to share files. Please contact the owner for access.',
    'create_folders': 'You do not have permission to create folders. Please contact the owner for access.',
    'delete_folders': 'You do not have permission to delete folders. Please contact the owner for access.',
    'invite_members': 'You do not have permission to invite members. Please contact the owner for access.'
  };
  
  return messages[action] || `You do not have permission to perform ${action}. Please contact the owner for access.`;
};

/**
 * Validate permission escalation for invitations
 */
export const validatePermissionEscalation = (inviterPermissions, inviteePermissions) => {
  const permissionSystem = new PermissionSystem();
  
  // Convert old format to new format for comparison
  const inviterNew = permissionSystem.convertFromOldFormat(inviterPermissions);
  const inviteeNew = permissionSystem.convertFromOldFormat(inviteePermissions);
  
  return permissionSystem.canGrantPermissions(inviterNew, inviteeNew);
};

/**
 * Auto-correct permission dependencies
 */
export const correctPermissionDependencies = (permissions) => {
  const permissionSystem = new PermissionSystem();
  const newFormat = permissionSystem.convertFromOldFormat(permissions);
  const corrected = permissionSystem.validateAndCorrect(newFormat);
  return permissionSystem.convertToOldFormat(corrected);
};

export default {
  checkPermission,
  validatePermissionEscalation,
  correctPermissionDependencies,
  PermissionSystem
};