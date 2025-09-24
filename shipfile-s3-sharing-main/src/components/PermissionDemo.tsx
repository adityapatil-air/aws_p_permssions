import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface Permission {
  view: 'none' | 'view_own' | 'view_all';
  upload: 'none' | 'upload_manage_own' | 'upload_manage_all';
  extras: string[];
}

const PermissionDemo: React.FC = () => {
  const [selectedPermission, setSelectedPermission] = useState<Permission>({
    view: 'none',
    upload: 'none',
    extras: []
  });

  const [validationResult, setValidationResult] = useState<string>('');

  const validatePermissions = (permissions: Permission): Permission => {
    return permissions;
  };

  const handlePermissionChange = (newPermissions: Permission) => {
    const validated = validatePermissions(newPermissions);
    setSelectedPermission(validated);
  };

  const handleExtraPermissionChange = (permission: string, checked: boolean) => {
    const newExtras = checked 
      ? [...selectedPermission.extras, permission]
      : selectedPermission.extras.filter(p => p !== permission);
    
    handlePermissionChange({
      ...selectedPermission,
      extras: newExtras
    });
  };

  const getPermissionDescription = (permissions: Permission): string[] => {
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

    return descriptions;
  };

  const presetPermissions = [
    {
      name: 'Viewer Only',
      permissions: { view: 'view_all', upload: 'none', extras: ['download'] }
    },
    {
      name: 'Own Files Manager',
      permissions: { view: 'view_own', upload: 'upload_manage_own', extras: ['download', 'share'] }
    },
    {
      name: 'Full Manager',
      permissions: { view: 'view_all', upload: 'upload_manage_all', extras: ['download', 'share', 'create_folders', 'delete_folders'] }
    },
    {
      name: 'Team Lead',
      permissions: { view: 'view_all', upload: 'upload_manage_all', extras: ['download', 'share', 'create_folders', 'delete_folders', 'invite_members'] }
    }
  ];

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>ShipFile Permission System Demo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          
          {/* Quick Presets */}
          <div>
            <h3 className="text-lg font-medium mb-3">Quick Presets</h3>
            <div className="flex flex-wrap gap-2">
              {presetPermissions.map((preset) => (
                <Button
                  key={preset.name}
                  variant="outline"
                  size="sm"
                  onClick={() => handlePermissionChange(preset.permissions as Permission)}
                >
                  {preset.name}
                </Button>
              ))}
            </div>
          </div>

          {/* Permission Builder */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* View Access */}
            <div>
              <h4 className="text-sm font-medium text-blue-600 mb-2">1. View Access (Base Layer)</h4>
              <div className="space-y-2">
                <label className="flex items-center space-x-2">
                  <input
                    type="radio"
                    name="view"
                    value="view_own"
                    checked={selectedPermission.view === 'view_own'}
                    onChange={(e) => handlePermissionChange({
                      ...selectedPermission,
                      view: e.target.value as any
                    })}
                  />
                  <span className="text-sm">View Own Files</span>
                </label>
                <label className="flex items-center space-x-2">
                  <input
                    type="radio"
                    name="view"
                    value="view_all"
                    checked={selectedPermission.view === 'view_all'}
                    onChange={(e) => handlePermissionChange({
                      ...selectedPermission,
                      view: e.target.value as any
                    })}
                  />
                  <span className="text-sm">View All Files</span>
                </label>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                ⚠️ This platform is for file sharing only - no "No View" option
              </p>
            </div>

            {/* Upload Access */}
            <div>
              <h4 className="text-sm font-medium text-green-600 mb-2">2. Upload Access</h4>
              <div className="space-y-2">
                <label className="flex items-center space-x-2">
                  <input
                    type="radio"
                    name="upload"
                    value="none"
                    checked={selectedPermission.upload === 'none'}
                    onChange={(e) => handlePermissionChange({
                      ...selectedPermission,
                      upload: e.target.value as any
                    })}
                  />
                  <span className="text-sm">No Upload</span>
                </label>
                <label className="flex items-center space-x-2">
                  <input
                    type="radio"
                    name="upload"
                    value="upload_manage_own"
                    checked={selectedPermission.upload === 'upload_manage_own'}
                    disabled={selectedPermission.view === 'none'}
                    onChange={(e) => handlePermissionChange({
                      ...selectedPermission,
                      upload: e.target.value as any
                    })}
                  />
                  <span className={`text-sm ${selectedPermission.view === 'none' ? 'text-gray-400' : ''}`}>Upload + Manage Own</span>
                </label>
                <label className="flex items-center space-x-2">
                  <input
                    type="radio"
                    name="upload"
                    value="upload_manage_all"
                    checked={selectedPermission.upload === 'upload_manage_all'}
                    disabled={selectedPermission.view === 'none' || selectedPermission.view === 'view_own'}
                    onChange={(e) => handlePermissionChange({
                      ...selectedPermission,
                      upload: e.target.value as any
                    })}
                  />
                  <span className={`text-sm ${selectedPermission.view === 'none' || selectedPermission.view === 'view_own' ? 'text-gray-400' : ''}`}>Upload + Manage All</span>
                </label>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Manage = rename + delete files/folders
              </p>
            </div>
          </div>

          {/* Extra Permissions */}
          <div>
            <h4 className="text-sm font-medium text-purple-600 mb-2">3. Extra Permissions</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {[
                { key: 'download', label: 'Download Files', requires: 'view' },
                { key: 'share', label: 'Generate Share Links', requires: 'view' },
                { key: 'create_folders', label: 'Create Folders', requires: 'upload' },
                { key: 'delete_folders', label: 'Delete Folders', requires: 'upload' },
                { key: 'invite_members', label: 'Invite Members', requires: 'none' }
              ].map((extra) => {
                const isDisabled = 
                  (extra.requires === 'view' && selectedPermission.view === 'none') ||
                  (extra.requires === 'upload' && selectedPermission.upload === 'none');

                return (
                  <label key={extra.key} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={selectedPermission.extras.includes(extra.key)}
                      disabled={isDisabled}
                      onChange={(e) => handleExtraPermissionChange(extra.key, e.target.checked)}
                    />
                    <span className={`text-sm ${isDisabled ? 'text-gray-400' : ''}`}>
                      {extra.label}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>



          {/* Current Permission Summary */}
          <div>
            <h4 className="text-sm font-medium mb-2">Current Permissions</h4>
            <div className="flex flex-wrap gap-2">
              {getPermissionDescription(selectedPermission).map((desc, index) => (
                <Badge key={index} variant="secondary">{desc}</Badge>
              ))}
              {getPermissionDescription(selectedPermission).length === 0 && (
                <Badge variant="outline">No permissions assigned</Badge>
              )}
            </div>
          </div>

          {/* Dependency Rules */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <h4 className="text-sm font-medium text-yellow-800 mb-2">📋 Dependency Rules</h4>
            <ul className="text-xs text-yellow-700 space-y-1">
              <li>• Upload + Manage Own requires at least View Own</li>
              <li>• Upload + Manage All requires View All</li>
              <li>• Download/Share requires View access</li>
              <li>• Create/Delete Folders requires Upload access</li>
              <li>• Invite Members can be granted independently</li>
            </ul>
          </div>

        </CardContent>
      </Card>
    </div>
  );
};

export default PermissionDemo;