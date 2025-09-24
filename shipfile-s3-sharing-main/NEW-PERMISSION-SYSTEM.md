# ShipFile - New Simplified Permission System

## Overview

The new permission system simplifies the complex boolean-based permissions into a clear, hierarchical structure with automatic dependency validation.

## Permission Structure

### 1. View Access (Base Layer)
Determines what files a user can see:
- **`view_own`**: User sees only files they uploaded
- **`view_all`**: User sees everything

> ⚠️ **Note**: Removed "No View" option since this platform is for file sharing only

### 2. Upload Access
Determines what users can do with files:
- **`none`**: Can't upload
- **`upload_manage_own`**: Can upload, rename, delete only their own files
- **`upload_manage_all`**: Can upload, rename, delete any file

### 3. Extra Permissions
Additional capabilities:
- **`download`**: Download files (requires view access)
- **`share`**: Generate share links (requires view access)
- **`create_folders`**: Create folders (requires upload access)
- **`delete_folders`**: Delete folders (requires upload access) - **NEW!**
- **`invite_members`**: Invite new members (independent)

## Dependency Rules

The system automatically enforces these rules:

1. **No View → All Disabled**: If no view access, all other permissions are disabled
2. **Upload + Manage Own → View Own**: Requires at least View Own access
3. **Upload + Manage All → View All**: Requires View All access
4. **Download/Share → View**: Requires view access
5. **Create/Delete Folders → Upload**: Requires upload access

## Common Permission Combinations

### Viewer Only
```javascript
{
  view: 'view_all',
  upload: 'none',
  extras: ['download']
}
```
- Can see all files
- Can download files
- Cannot upload or modify anything

### Own Files Manager
```javascript
{
  view: 'view_own',
  upload: 'upload_manage_own',
  extras: ['download', 'share']
}
```
- Can only see files they uploaded
- Can upload and manage their own files
- Can download and share files

### Full Manager
```javascript
{
  view: 'view_all',
  upload: 'upload_manage_all',
  extras: ['download', 'share', 'create_folders', 'delete_folders']
}
```
- Can see all files
- Can upload and manage any file
- Can create and delete folders
- Full file management capabilities

### Team Lead
```javascript
{
  view: 'view_all',
  upload: 'upload_manage_all',
  extras: ['download', 'share', 'create_folders', 'delete_folders', 'invite_members']
}
```
- All Full Manager permissions
- Can invite new team members

## Implementation Files

### Backend
- **`permission-system.js`**: Core permission system class
- **`permission-middleware.js`**: Express middleware for permission checking
- **`migrate-permissions.js`**: Migration script for existing data

### Frontend
- **`InviteMemberModal.tsx`**: New invite modal with simplified UI
- **`PermissionDemo.tsx`**: Interactive demo of the permission system

## Migration Guide

### 1. Run Migration Script
```bash
cd backend
node migrate-permissions.js
```

### 2. Update Frontend Components
Replace the old invite member modal with the new `InviteMemberModal.tsx`:

```tsx
import InviteMemberModal from './components/InviteMemberModal';

// Usage
<InviteMemberModal
  open={showInvite}
  onOpenChange={setShowInvite}
  bucketName={currentBucket}
  currentUser={currentUser}
  userPermissions={userPermissions}
/>
```

### 3. Update Backend Routes
Replace old permission checking with new middleware:

```javascript
import { checkPermission } from './permission-middleware.js';

// Usage
app.post('/api/upload', checkPermission('upload'), (req, res) => {
  // Your upload logic
});

app.delete('/api/delete', checkPermission('delete_file'), (req, res) => {
  // Your delete logic
});
```

### 4. Add Delete Folders Feature
The new system includes delete folders permission. Add this to your frontend:

```tsx
// In your file manager component
const handleDeleteFolder = async (folder) => {
  if (!hasPermission('delete_folders')) {
    showError('You do not have permission to delete folders');
    return;
  }
  
  // Your delete folder logic
};
```

## Benefits of New System

### 1. **Clearer Logic**
- Hierarchical structure is easier to understand
- Dependency rules are explicit and automatic

### 2. **Better UX**
- Auto-correction prevents invalid permission combinations
- Clear error messages explain what's needed

### 3. **Easier Development**
- Single class handles all permission logic
- Consistent API across frontend and backend

### 4. **Future-Proof**
- Easy to add new permission types
- Maintains backward compatibility

## API Reference

### PermissionSystem Class

```javascript
const permissionSystem = new PermissionSystem();

// Create new permission
const permission = permissionSystem.createPermission(
  'view_all',                    // view level
  'upload_manage_own',           // upload level
  ['download', 'share']          // extra permissions
);

// Check permission
const canDownload = permissionSystem.hasPermission(
  userPermissions, 
  'download'
);

// Validate permission escalation
const canGrant = permissionSystem.canGrantPermissions(
  inviterPermissions,
  inviteePermissions
);

// Convert between formats
const newFormat = permissionSystem.convertFromOldFormat(oldPermissions);
const oldFormat = permissionSystem.convertToOldFormat(newPermissions);
```

### Permission Checking

```javascript
// Check specific actions
hasPermission(permissions, 'view_files')
hasPermission(permissions, 'upload')
hasPermission(permissions, 'delete_file', fileOwnership)
hasPermission(permissions, 'create_folders')
hasPermission(permissions, 'invite_members')
```

## Testing

Use the `PermissionDemo.tsx` component to test different permission combinations:

```tsx
import PermissionDemo from './components/PermissionDemo';

// Add to your app for testing
<PermissionDemo />
```

## Troubleshooting

### Common Issues

1. **"Permission dependencies were auto-corrected"**
   - This is normal - the system automatically fixes invalid combinations
   - Check the migration report for details

2. **"You can't grant permissions higher than your own"**
   - Members can only invite others with equal or lesser permissions
   - Contact the bucket owner for higher permissions

3. **"Invalid permission format"**
   - Run the migration script to fix old permission formats
   - Check that all permissions are properly JSON formatted

### Debug Mode

Enable debug logging in the permission system:

```javascript
// In permission-system.js
const DEBUG = true;

if (DEBUG) {
  console.log('Permission check:', action, permissions);
}
```

## Support

For questions or issues with the new permission system:

1. Check the migration report for any issues
2. Test with the PermissionDemo component
3. Review the dependency rules above
4. Check browser console for detailed error messages

---

**Note**: The old permission system is still supported for backward compatibility, but new features will only be available in the new system.