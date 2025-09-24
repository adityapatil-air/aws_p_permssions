// New Simplified Permission System for ShipFile
// Based on the requirements: View Access (Base Layer) + Upload Access + Extra Permissions

/**
 * PERMISSION STRUCTURE:
 * 
 * 1. VIEW ACCESS (Base Layer - decides what files user can see)
 *    - view_own: User sees only files they uploaded
 *    - view_all: User sees everything
 * 
 * 2. UPLOAD ACCESS (depends on View Access)
 *    - no_upload: Can't upload
 *    - upload_manage_own: Can upload, rename, delete only their own files
 *    - upload_manage_all: Can upload, rename, delete any file
 * 
 * 3. EXTRA PERMISSIONS
 *    - download: Download files (needs view_own or view_all)
 *    - share: Generate share links (needs view_own or view_all)
 *    - create_folders: Create folders (needs upload permission)
 *    - delete_folders: Delete folders (needs upload permission)
 *    - invite_members: Invite new members
 * 
 * DEPENDENCY RULES:
 * - If no view access, all other permissions are disabled
 * - Upload + Manage Own requires at least View Own
 * - Upload + Manage All requires View All
 * - Download/Share requires View Own or View All
 * - Create/Delete Folders requires Upload permission
 */

class PermissionSystem {
  constructor() {
    this.validViewLevels = ['none', 'view_own', 'view_all'];
    this.validUploadLevels = ['none', 'upload_manage_own', 'upload_manage_all'];
    this.validExtraPermissions = ['download', 'share', 'create_folders', 'delete_folders', 'invite_members'];
  }

  /**
   * Create a new permission object
   */
  createPermission(viewLevel, uploadLevel, extraPermissions = []) {
    const permission = {
      view: viewLevel,
      upload: uploadLevel,
      extras: extraPermissions
    };

    // Validate and auto-correct dependencies
    return this.validateAndCorrect(permission);
  }

  /**
   * Validate permission dependencies and auto-correct invalid combinations
   */
  validateAndCorrect(permission) {
    const corrected = { ...permission };

    // Rule 1: If no view access, disable all other permissions
    if (corrected.view === 'none') {
      corrected.upload = 'none';
      corrected.extras = [];
      return corrected;
    }

    // Rule 2: Upload + Manage Own requires at least View Own
    if (corrected.upload === 'upload_manage_own' && corrected.view === 'none') {
      corrected.view = 'view_own';
    }

    // Rule 3: Upload + Manage All requires View All
    if (corrected.upload === 'upload_manage_all' && corrected.view !== 'view_all') {
      corrected.view = 'view_all';
    }

    // Rule 4: Download/Share requires view access
    corrected.extras = corrected.extras.filter(extra => {
      if ((extra === 'download' || extra === 'share') && corrected.view === 'none') {
        return false;
      }
      return true;
    });

    // Rule 5: Create/Delete folders requires upload access
    corrected.extras = corrected.extras.filter(extra => {
      if ((extra === 'create_folders' || extra === 'delete_folders') && corrected.upload === 'none') {
        return false;
      }
      return true;
    });

    return corrected;
  }

  /**
   * Check if user has specific permission
   */
  hasPermission(userPermissions, action, fileOwnership = null) {
    if (!userPermissions) return false;

    switch (action) {
      case 'view_files':
        return userPermissions.view !== 'none';

      case 'view_own_files':
        return userPermissions.view === 'view_own' || userPermissions.view === 'view_all';

      case 'view_all_files':
        return userPermissions.view === 'view_all';

      case 'upload':
        return userPermissions.upload !== 'none';

      case 'rename_file':
      case 'delete_file':
        if (userPermissions.upload === 'upload_manage_all') return true;
        if (userPermissions.upload === 'upload_manage_own') {
          return fileOwnership === 'own';
        }
        return false;

      case 'download':
        return userPermissions.extras.includes('download');

      case 'share':
        return userPermissions.extras.includes('share');

      case 'create_folders':
        return userPermissions.extras.includes('create_folders');

      case 'delete_folders':
        return userPermissions.extras.includes('delete_folders');

      case 'invite_members':
        return userPermissions.extras.includes('invite_members');

      default:
        return false;
    }
  }

  /**
   * Convert old permission format to new format
   */
  convertFromOldFormat(oldPermissions) {
    let viewLevel = 'none';
    let uploadLevel = 'none';
    let extras = [];

    // Determine view level
    if (oldPermissions.uploadViewAll || oldPermissions.viewOnly || oldPermissions.viewDownload) {
      viewLevel = 'view_all';
    } else if (oldPermissions.uploadViewOwn) {
      viewLevel = 'view_own';
    }

    // Determine upload level
    if (oldPermissions.uploadViewAll) {
      uploadLevel = 'upload_manage_all';
    } else if (oldPermissions.uploadViewOwn || oldPermissions.uploadOnly) {
      uploadLevel = 'upload_manage_own';
    }

    // Determine extra permissions
    if (oldPermissions.viewDownload) extras.push('download');
    if (oldPermissions.generateLinks) extras.push('share');
    if (oldPermissions.createFolder) extras.push('create_folders');
    if (oldPermissions.deleteFiles || oldPermissions.deleteOwnFiles) {
      // Delete folders permission is implied if user can delete files
      extras.push('delete_folders');
    }
    if (oldPermissions.inviteMembers) extras.push('invite_members');

    return this.createPermission(viewLevel, uploadLevel, extras);
  }

  /**
   * Convert new permission format to old format (for backward compatibility)
   */
  convertToOldFormat(newPermissions) {
    const old = {
      viewOnly: false,
      viewDownload: false,
      uploadOnly: false,
      uploadViewOwn: false,
      uploadViewAll: false,
      deleteFiles: false,
      deleteOwnFiles: false,
      generateLinks: false,
      createFolder: false,
      inviteMembers: false
    };

    // Set view permissions
    if (newPermissions.view === 'view_all') {
      if (newPermissions.extras.includes('download')) {
        old.viewDownload = true;
      } else {
        old.viewOnly = true;
      }
    }

    // Set upload permissions
    if (newPermissions.upload === 'upload_manage_own') {
      old.uploadViewOwn = true;
      old.deleteOwnFiles = true;
    } else if (newPermissions.upload === 'upload_manage_all') {
      old.uploadViewAll = true;
      old.deleteFiles = true;
    }

    // Set extra permissions
    if (newPermissions.extras.includes('share')) old.generateLinks = true;
    if (newPermissions.extras.includes('create_folders')) old.createFolder = true;
    if (newPermissions.extras.includes('invite_members')) old.inviteMembers = true;

    return old;
  }

  /**
   * Get human-readable permission description
   */
  getPermissionDescription(permissions) {
    const descriptions = [];

    // View access
    switch (permissions.view) {
      case 'view_own':
        descriptions.push('View Own Files');
        break;
      case 'view_all':
        descriptions.push('View All Files');
        break;
    }

    // Upload access
    switch (permissions.upload) {
      case 'upload_manage_own':
        descriptions.push('Upload & Manage Own Files');
        break;
      case 'upload_manage_all':
        descriptions.push('Upload & Manage All Files');
        break;
    }

    // Extra permissions
    if (permissions.extras.includes('download')) descriptions.push('Download Files');
    if (permissions.extras.includes('share')) descriptions.push('Generate Share Links');
    if (permissions.extras.includes('create_folders')) descriptions.push('Create Folders');
    if (permissions.extras.includes('delete_folders')) descriptions.push('Delete Folders');
    if (permissions.extras.includes('invite_members')) descriptions.push('Invite Members');

    return descriptions.length > 0 ? descriptions.join(', ') : 'No permissions';
  }

  /**
   * Check if inviter can grant specific permissions to invitee
   */
  canGrantPermissions(inviterPermissions, inviteePermissions) {
    // Owner can grant any permissions
    if (!inviterPermissions) return true;

    // Check view level
    const viewLevels = { 'none': 0, 'view_own': 1, 'view_all': 2 };
    if (viewLevels[inviteePermissions.view] > viewLevels[inviterPermissions.view]) {
      return false;
    }

    // Check upload level
    const uploadLevels = { 'none': 0, 'upload_manage_own': 1, 'upload_manage_all': 2 };
    if (uploadLevels[inviteePermissions.upload] > uploadLevels[inviterPermissions.upload]) {
      return false;
    }

    // Check extra permissions
    for (const extra of inviteePermissions.extras) {
      if (!inviterPermissions.extras.includes(extra)) {
        return false;
      }
    }

    return true;
  }
}

module.exports = PermissionSystem;