import { API_BASE_URL } from '@/config/api';
import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Folder } from 'lucide-react';

interface InviteMemberModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bucketName: string;
  currentUser: any;
  userPermissions: any;
}

interface Permission {
  view: 'none' | 'view_own' | 'view_all';
  upload: 'none' | 'upload_manage_own' | 'upload_manage_all';
  extras: string[];
}

const FolderTreeNode = ({ tree, level, expandedFolders, selectedFolderPaths, onToggleExpansion, onFolderSelect, isChildOfSelected }) => {
  return (
    <div>
      {Object.entries(tree).map(([folderName, folderData]: [string, any]) => {
        const hasChildren = Object.keys(folderData.children).length > 0;
        const isExpanded = expandedFolders.has(folderData.fullPath);
        const isSelected = selectedFolderPaths.has(folderData.fullPath);
        const isChildSelected = isChildOfSelected(folderData.fullPath, selectedFolderPaths);
        
        return (
          <div key={folderData.fullPath}>
            <div 
              className="flex items-center space-x-2 py-1 hover:bg-gray-50 rounded"
              style={{ paddingLeft: `${level * 20 + 8}px` }}
            >
              {hasChildren && (
                <button
                  onClick={() => onToggleExpansion(folderData.fullPath)}
                  className="w-4 h-4 flex items-center justify-center text-gray-500 hover:text-gray-700"
                >
                  {isExpanded ? '▼' : '▶'}
                </button>
              )}
              {!hasChildren && <div className="w-4" />}
              
              <input
                type="checkbox"
                checked={isSelected || isChildSelected}
                onChange={(e) => onFolderSelect(folderData.fullPath, e.target.checked)}
                className="w-4 h-4"
              />
              
              <Folder className="h-4 w-4 text-blue-500" />
              <span className="text-sm">{folderName}</span>
            </div>
            
            {hasChildren && isExpanded && (
              <FolderTreeNode
                tree={folderData.children}
                level={level + 1}
                expandedFolders={expandedFolders}
                selectedFolderPaths={selectedFolderPaths}
                onToggleExpansion={onToggleExpansion}
                onFolderSelect={onFolderSelect}
                isChildOfSelected={isChildOfSelected}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};

const InviteMemberModal: React.FC<InviteMemberModalProps> = ({
  open,
  onOpenChange,
  bucketName,
  currentUser,
  userPermissions
}) => {
  const { toast } = useToast();
  const [inviteEmail, setInviteEmail] = useState('');
  const [permissions, setPermissions] = useState<Permission>({
    view: 'none',
    upload: 'none',
    extras: []
  });
  const [scopeType, setScopeType] = useState('entire');
  const [selectedFolders, setSelectedFolders] = useState<string[]>([]);
  const [folderTree, setFolderTree] = useState({});
  const [expandedFolders, setExpandedFolders] = useState(new Set());
  const [selectedFolderPaths, setSelectedFolderPaths] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Reset form when modal opens/closes
  useEffect(() => {
    if (open) {
      setInviteEmail('');
      setPermissions({ view: 'none', upload: 'none', extras: [] });
      setScopeType('entire');
      setSelectedFolders([]);
      setExpandedFolders(new Set());
      setSelectedFolderPaths(new Set());
      setError('');
    }
  }, [open]);

  // Load folder tree when specific scope is selected
  useEffect(() => {
    if (open && scopeType === 'specific') {
      loadFolders();
    }
  }, [open, scopeType]);

  const loadFolders = async () => {
    try {
      const ownerData = localStorage.getItem('currentOwner');
      const memberData = localStorage.getItem('currentMember');
      
      if (ownerData) {
        const owner = JSON.parse(ownerData);
        const response = await fetch(`${API_BASE_URL}/api/buckets/${bucketName}/folders/tree?ownerEmail=${encodeURIComponent(owner.email)}`);
        const folders = await response.json();
        const tree = buildFolderTree(folders);
        setFolderTree(tree);
      } else if (memberData) {
        const member = JSON.parse(memberData);
        const response = await fetch(`${API_BASE_URL}/api/buckets/${bucketName}/folders/tree?memberEmail=${encodeURIComponent(member.email)}`);
        const folders = await response.json();
        const tree = buildFolderTree(folders);
        setFolderTree(tree);
      }
    } catch (error) {
      console.error('Failed to load folders:', error);
    }
  };

  const buildFolderTree = (folderPaths: string[]) => {
    const tree = {};
    
    folderPaths.forEach(path => {
      const parts = path.split('/');\n      let current = tree;
      
      parts.forEach((part, index) => {
        if (!current[part]) {
          current[part] = {
            children: {},
            fullPath: parts.slice(0, index + 1).join('/'),
            isFolder: true
          };
        }
        current = current[part].children;
      });
    });
    
    return tree;
  };

  const toggleFolderExpansion = (folderPath: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folderPath)) {
      newExpanded.delete(folderPath);
    } else {
      newExpanded.add(folderPath);
    }
    setExpandedFolders(newExpanded);
  };

  const isChildOfSelected = (folderPath: string, selectedPaths: Set<string>) => {
    return Array.from(selectedPaths).some(selectedPath => 
      folderPath.startsWith(selectedPath + '/') || folderPath === selectedPath
    );
  };

  const handleFolderSelect = (folderPath: string, isSelected: boolean) => {
    const newSelected = new Set(selectedFolderPaths);
    
    if (isSelected) {
      newSelected.add(folderPath);
      // Remove any child paths as they're now covered by parent
      Array.from(newSelected).forEach(selectedPath => {
        if (selectedPath.startsWith(folderPath + '/')) {
          newSelected.delete(selectedPath);
        }
      });
      // Remove any parent paths that are now redundant
      Array.from(newSelected).forEach(selectedPath => {
        if (folderPath.startsWith(selectedPath + '/')) {
          newSelected.delete(selectedPath);
        }
      });
    } else {
      newSelected.delete(folderPath);
    }
    
    setSelectedFolderPaths(newSelected);
    setSelectedFolders(Array.from(newSelected));
  };

  const handleExtraPermissionChange = (permission: string, checked: boolean) => {
    setPermissions(prev => ({
      ...prev,
      extras: checked 
        ? [...prev.extras, permission]
        : prev.extras.filter(p => p !== permission)
    }));
  };



  const validatePermissions = (): boolean => {
    if (permissions.upload === 'upload_manage_all' && permissions.view !== 'view_all') {
      setError('Upload + Manage All requires View All access');
      return false;
    }

    return true;
  };

  const canGrantPermission = (permissionType: string, permissionValue?: string): boolean => {
    if (currentUser?.role === 'owner') return true;
    if (!userPermissions) return false;

    // Convert old format permissions to check against
    const userCanViewAll = userPermissions.uploadViewAll || userPermissions.viewDownload || userPermissions.viewOnly;
    const userCanViewOwn = userPermissions.uploadViewOwn || userCanViewAll;
    const userCanUploadAll = userPermissions.uploadViewAll;
    const userCanUploadOwn = userPermissions.uploadViewOwn || userCanUploadAll;

    switch (permissionType) {
      case 'view':
        if (permissionValue === 'view_all') return userCanViewAll;
        if (permissionValue === 'view_own') return userCanViewOwn;
        return true;
      
      case 'upload':
        if (permissionValue === 'upload_manage_all') return userCanUploadAll;
        if (permissionValue === 'upload_manage_own') return userCanUploadOwn;
        return true;
      
      case 'download':
        return userPermissions.viewDownload || userPermissions.uploadViewAll;
      
      case 'share':
        return userPermissions.generateLinks;
      
      case 'create_folders':
      case 'delete_folders':
        return userPermissions.createFolder || userPermissions.uploadViewAll;
      
      case 'invite_members':
        return userPermissions.inviteMembers;
      
      default:
        return false;
    }
  };

  const convertToOldFormat = (newPermissions: Permission) => {
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
    } else if (newPermissions.view === 'view_own') {
      if (newPermissions.extras.includes('download')) {
        old.viewDownload = true;
      } else {
        old.viewOnly = true;
      }
      old.uploadViewOwn = true;
      old.deleteOwnFiles = true;
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
  };

  const handleSendInvite = async () => {
    if (!inviteEmail.trim()) {
      setError('Email address is required');
      return;
    }

    if (!validatePermissions()) {
      return;
    }

    setLoading(true);
    setError('');

    try {
      const oldFormatPermissions = convertToOldFormat(permissions);
      
      const response = await fetch('${API_BASE_URL}/api/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bucketName,
          email: inviteEmail.trim(),
          permissions: oldFormatPermissions,
          scopeType: scopeType,
          scopeFolders: selectedFolders,
          userEmail: currentUser?.email
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to send invitation');
      }
      
      onOpenChange(false);
      
      if (data.emailSent) {
        toast({
          title: "Invite Sent",
          description: `Invitation email sent to ${inviteEmail}`,
          className: "bg-green-100 border-green-400 text-green-800"
        });
      } else {
        toast({
          title: "Invite Created",
          description: `Invitation link created for ${inviteEmail}`,
          className: "bg-green-100 border-green-400 text-green-800"
        });
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to send invitation');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Invite Team Member</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          <div className="space-y-2">
            <Label>Email Address</Label>
            <Input
              type="email"
              placeholder="member@company.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
            />
          </div>
          
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          
          <div className="space-y-4">
            <Label className="text-base font-medium">Permissions</Label>
            
            {/* View and Upload side by side */}
            <div className="grid grid-cols-2 gap-6">
              <div>
                <Label className="text-sm font-medium text-blue-600">1. View Access (Base Layer)</Label>
                <div className="mt-2 space-y-2">
                  <label className="flex items-center space-x-2">
                    <input
                      type="radio"
                      name="view"
                      value="none"
                      checked={permissions.view === 'none'}
                      onChange={(e) => {
                        setPermissions(prev => ({ ...prev, view: e.target.value as any }));
                        setError('');
                      }}
                    />
                    <span className="text-sm">No View</span>
                  </label>
                  <label className="flex items-center space-x-2">
                    <input
                      type="radio"
                      name="view"
                      value="view_own"
                      checked={permissions.view === 'view_own'}
                      disabled={!canGrantPermission('view', 'view_own')}
                      onChange={(e) => {
                        setPermissions(prev => ({ ...prev, view: e.target.value as any }));
                        setError('');
                      }}
                    />
                    <span className={`text-sm ${!canGrantPermission('view', 'view_own') ? 'text-gray-400' : ''}`}>
                      View Own Files
                    </span>
                  </label>
                  <label className="flex items-center space-x-2">
                    <input
                      type="radio"
                      name="view"
                      value="view_all"
                      checked={permissions.view === 'view_all'}
                      disabled={!canGrantPermission('view', 'view_all')}
                      onChange={(e) => {
                        const newView = e.target.value as any;
                        setPermissions(prev => ({ 
                          ...prev, 
                          view: newView
                        }));
                        setError('');
                      }}
                    />
                    <span className={`text-sm ${!canGrantPermission('view', 'view_all') ? 'text-gray-400' : ''}`}>
                      View All Files
                    </span>
                  </label>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  ⚠️ This platform is for file sharing only
                </p>
              </div>
              
              <div>
                <Label className="text-sm font-medium text-green-600">2. Upload Access</Label>
                <div className="mt-2 space-y-2">
                  <label className="flex items-center space-x-2">
                    <input
                      type="radio"
                      name="upload"
                      value="none"
                      checked={permissions.upload === 'none'}
                      onChange={(e) => {
                        setPermissions(prev => ({ ...prev, upload: e.target.value as any }));
                        setError('');
                      }}
                    />
                    <span className="text-sm">No Upload</span>
                  </label>
                  <label className={`flex items-center space-x-2 ${permissions.view === 'none' ? 'pointer-events-none' : ''}`}>
                    <input
                      type="radio"
                      name="upload"
                      value="upload_manage_own"
                      checked={permissions.upload === 'upload_manage_own'}
                      disabled={permissions.view === 'none' || !canGrantPermission('upload', 'upload_manage_own')}
                      onChange={(e) => {
                        if (permissions.view !== 'none') {
                          setPermissions(prev => ({ ...prev, upload: e.target.value as any }));
                          setError('');
                        }
                      }}
                    />
                    <span className={`text-sm ${permissions.view === 'none' || !canGrantPermission('upload', 'upload_manage_own') ? 'text-gray-400' : ''}`}>
                      Upload + Manage Own
                    </span>
                  </label>
                  <label className={`flex items-center space-x-2 ${permissions.view === 'none' ? 'pointer-events-none' : ''}`}>
                    <input
                      type="radio"
                      name="upload"
                      value="upload_manage_all"
                      checked={permissions.upload === 'upload_manage_all'}
                      disabled={permissions.view === 'none' || permissions.view === 'view_own' || !canGrantPermission('upload', 'upload_manage_all')}
                      onChange={(e) => {
                        if (permissions.view !== 'none') {
                          setPermissions(prev => ({ ...prev, upload: e.target.value as any }));
                          setError('');
                        }
                      }}
                    />
                    <span className={`text-sm ${permissions.view === 'none' || permissions.view === 'view_own' || !canGrantPermission('upload', 'upload_manage_all') ? 'text-gray-400' : ''}`}>
                      Upload + Manage All
                    </span>
                  </label>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Manage = rename + delete files
                </p>
              </div>
            </div>
            
            {/* Dependency Rules Display */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <h4 className="text-sm font-medium text-yellow-800 mb-2">📋 Dependency Rules:</h4>
              <ul className="text-xs text-yellow-700 space-y-1">
                <li>• Upload + Manage Own requires at least View Own</li>
                <li>• Upload + Manage All requires View All</li>
                <li>• Extra permissions require appropriate base permissions</li>
              </ul>
            </div>
            
            {/* Extra Permissions */}
            <div>
              <Label className="text-sm font-medium text-purple-600">3. Extra Permissions</Label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={permissions.extras.includes('download')}
                    disabled={!canGrantPermission('download')}
                    onChange={(e) => handleExtraPermissionChange('download', e.target.checked)}
                  />
                  <span className={`text-sm ${!canGrantPermission('download') ? 'text-gray-400' : ''}`}>
                    Download Files
                  </span>
                </label>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={permissions.extras.includes('share')}
                    disabled={!canGrantPermission('share')}
                    onChange={(e) => handleExtraPermissionChange('share', e.target.checked)}
                  />
                  <span className={`text-sm ${!canGrantPermission('share') ? 'text-gray-400' : ''}`}>
                    Generate Share Links
                  </span>
                </label>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={permissions.extras.includes('create_folders')}
                    disabled={permissions.upload === 'none' || !canGrantPermission('create_folders')}
                    onChange={(e) => handleExtraPermissionChange('create_folders', e.target.checked)}
                  />
                  <span className={`text-sm ${permissions.upload === 'none' || !canGrantPermission('create_folders') ? 'text-gray-400' : ''}`}>
                    Create Folders
                  </span>
                </label>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={permissions.extras.includes('delete_folders')}
                    disabled={permissions.upload === 'none' || !canGrantPermission('delete_folders')}
                    onChange={(e) => handleExtraPermissionChange('delete_folders', e.target.checked)}
                  />
                  <span className={`text-sm ${permissions.upload === 'none' || !canGrantPermission('delete_folders') ? 'text-gray-400' : ''}`}>
                    Delete Folders
                  </span>
                </label>
              </div>
              
              {/* Invite Members in center */}
              <div className="flex justify-center mt-3">
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={permissions.extras.includes('invite_members')}
                    disabled={!canGrantPermission('invite_members')}
                    onChange={(e) => handleExtraPermissionChange('invite_members', e.target.checked)}
                  />
                  <span className={`text-sm font-bold ${!canGrantPermission('invite_members') ? 'text-gray-400' : ''}`}>
                    Invite Members
                  </span>
                </label>
              </div>
            </div>
          </div>
          
          {/* Access Scope */}
          <div className="space-y-3">
            <Label className="text-base font-medium">Access Scope</Label>
            <div className="space-y-2">
              <label className="flex items-center space-x-2">
                <input
                  type="radio"
                  name="scope"
                  value="entire"
                  checked={scopeType === 'entire'}
                  onChange={(e) => setScopeType(e.target.value)}
                />
                <span className="text-sm">Entire Bucket</span>
              </label>
              <label className="flex items-center space-x-2">
                <input
                  type="radio"
                  name="scope"
                  value="specific"
                  checked={scopeType === 'specific'}
                  onChange={(e) => setScopeType(e.target.value)}
                />
                <span className="text-sm">Specific Folders</span>
              </label>
            </div>
          </div>
          
          {/* Folder Selection */}
          {scopeType === 'specific' && (
            <div className="space-y-2">
              <Label>Select Folders</Label>
              <div className="border rounded p-3 max-h-48 overflow-y-auto">
                {Object.keys(folderTree).length > 0 ? (
                  <FolderTreeNode 
                    tree={folderTree}
                    level={0}
                    expandedFolders={expandedFolders}
                    selectedFolderPaths={selectedFolderPaths}
                    onToggleExpansion={toggleFolderExpansion}
                    onFolderSelect={handleFolderSelect}
                    isChildOfSelected={isChildOfSelected}
                  />
                ) : (
                  <p className="text-sm text-gray-500">No folders found</p>
                )}
              </div>
              
              {selectedFolderPaths.size > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded p-2">
                  <span className="text-sm font-medium">Selected: </span>
                  <div className="mt-1">
                    {Array.from(selectedFolderPaths).map(path => (
                      <div key={path} className="text-sm text-blue-600">/{path}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleSendInvite} 
            disabled={loading || !inviteEmail.trim() || permissions.view === 'none'}
          >
            {loading ? 'Sending...' : 'Send Invitation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default InviteMemberModal;