import { API_BASE_URL } from '@/config/api';
import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Users } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';

interface Member {
  email: string;
  permissions: string;
  scope_type: string;
  scope_folders: string;
  invited_by: string;
}

interface MemberManagementProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bucketName: string;
  ownerEmail: string;
}

const MemberManagement: React.FC<MemberManagementProps> = ({
  open,
  onOpenChange,
  bucketName,
  ownerEmail
}) => {
  const { toast } = useToast();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [showEditPermissions, setShowEditPermissions] = useState(false);
  const [editPermissions, setEditPermissions] = useState({
    view: 'none',
    upload: 'none',
    download: false,
    share: false,
    create_folder: false,
    invite_members: false
  });
  const [editScopeType, setEditScopeType] = useState('entire');
  const [editSelectedFolders, setEditSelectedFolders] = useState<string[]>([]);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState({
    title: '',
    message: '',
    onConfirm: () => {},
    memberToRemove: null as Member | null
  });
  const [confirmText, setConfirmText] = useState('');

  const loadMembers = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/buckets/${bucketName}/all-members?ownerEmail=${encodeURIComponent(ownerEmail)}`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to load members');
      }
      
      setMembers(data);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to load members');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && bucketName && ownerEmail) {
      loadMembers();
    }
  }, [open, bucketName, ownerEmail]);

  const formatPermissions = (permissionsStr: string) => {
    try {
      const perms = JSON.parse(permissionsStr);
      const permissions = [];
      
      if (perms.uploadViewOwn) {
        permissions.push('View Own Files');
      } else if (perms.uploadViewAll || perms.viewOnly || perms.viewDownload) {
        permissions.push('View All Files');
      }
      
      if (perms.viewDownload) {
        permissions.push('Download');
      }
      
      if (perms.uploadViewOwn) {
        permissions.push('Upload + Manage Own');
      } else if (perms.uploadViewAll) {
        permissions.push('Upload + Manage All');
      }
      
      if (perms.generateLinks) permissions.push('Generate Share Links');
      if (perms.createFolder) permissions.push('Create Folders');
      if (perms.inviteMembers) permissions.push('Invite Members');
      
      return permissions.length > 0 ? permissions.join(', ') : 'No permissions';
    } catch {
      return 'Invalid permissions';
    }
  };

  const formatScope = (scopeType: string, scopeFolders: string) => {
    if (scopeType === 'entire') return 'Entire Bucket';
    if (scopeType === 'specific') {
      try {
        const folders = JSON.parse(scopeFolders || '[]');
        return folders.length > 0 ? `Specific: ${folders.join(', ')}` : 'Specific (no folders)';
      } catch {
        return 'Specific (invalid)';
      }
    }
    return 'Unknown';
  };

  const convertToOldFormat = (simplified: any) => {
    const old = {
      viewOnly: false,
      viewDownload: false,
      uploadOnly: false,
      uploadViewOwn: false,
      uploadViewAll: false,
      deleteFiles: false,
      generateLinks: false,
      createFolder: false,
      deleteOwnFiles: false,
      inviteMembers: false
    };

    // Handle view permissions
    if (simplified.view === 'all') {
      if (simplified.download) {
        old.viewDownload = true;
      } else {
        old.viewOnly = true;
      }
    }
    
    // Handle upload permissions - these override view permissions
    if (simplified.upload === 'own') {
      old.uploadViewOwn = true;
      old.deleteOwnFiles = true;
      // Reset view-only flags since upload includes view
      old.viewOnly = false;
      old.viewDownload = false;
    }
    if (simplified.upload === 'all') {
      old.uploadViewAll = true;
      old.deleteFiles = true;
      // Reset view-only flags since upload includes view
      old.viewOnly = false;
      old.viewDownload = false;
    }
    
    // Handle extra permissions
    if (simplified.share) old.generateLinks = true;
    if (simplified.create_folder) old.createFolder = true;
    if (simplified.invite_members) old.inviteMembers = true;

    return old;
  };

  const handleEditMember = (member: Member) => {
    setEditingMember(member);
    
    try {
      const perms = JSON.parse(member.permissions);
      const simplified = {
        view: 'none',
        upload: 'none',
        download: false,
        share: false,
        create_folder: false,
        invite_members: false
      };
      
      // Handle view permissions first
      if (perms.viewOnly) {
        simplified.view = 'all';
        simplified.download = false;
      }
      if (perms.viewDownload) {
        simplified.view = 'all';
        simplified.download = true;
      }
      
      // Handle upload permissions (these override view)
      if (perms.uploadViewOwn) {
        simplified.view = 'own';
        simplified.upload = 'own';
        simplified.download = true; // Upload permissions include download
      }
      if (perms.uploadViewAll) {
        simplified.view = 'all';
        simplified.upload = 'all';
        simplified.download = true; // Upload permissions include download
      }
      // Handle extra permissions
      if (perms.generateLinks) simplified.share = true;
      if (perms.createFolder) simplified.create_folder = true;
      if (perms.inviteMembers) simplified.invite_members = true;
      
      setEditPermissions(simplified);
      setEditScopeType(member.scope_type || 'entire');
      
      if (member.scope_folders) {
        const folders = JSON.parse(member.scope_folders);
        setEditSelectedFolders(folders);
      } else {
        setEditSelectedFolders([]);
      }
      
    } catch (error) {
      console.error('Error parsing member permissions:', error);
    }
    
    setShowEditPermissions(true);
  };

  const handleUpdateMemberPermissions = async () => {
    if (!editingMember) return;
    
    try {
      const oldFormatPermissions = convertToOldFormat(editPermissions);
      
      const response = await fetch(`${API_BASE_URL}/api/members/${encodeURIComponent(editingMember.email)}/permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bucketName: bucketName,
          permissions: oldFormatPermissions,
          scopeType: editScopeType,
          scopeFolders: editSelectedFolders
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update permissions');
      }
      
      setShowEditPermissions(false);
      setEditingMember(null);
      loadMembers();
      
      toast({
        title: "Permissions Updated",
        description: `Permissions updated for ${editingMember?.email}`,
        className: "bg-green-100 border-green-400 text-green-800"
      });
      
    } catch (error) {
      console.error('Failed to update member permissions:', error);
      setError(error instanceof Error ? error.message : 'Failed to update permissions');
    }
  };

  const handleRemoveMember = (member: Member) => {
    setConfirmConfig({
      title: 'Remove Member',
      message: `Remove ${member.email} from the organization? They will lose access to this bucket.`,
      onConfirm: () => performRemoveMember(member),
      memberToRemove: member
    });
    setConfirmText('');
    setShowConfirmDialog(true);
  };

  const performRemoveMember = async (member: Member) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/members/${encodeURIComponent(member.email)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bucketName })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to remove member');
      }
      
      loadMembers();
      
      toast({
        title: "Member Removed",
        description: `${member.email} has been removed from the organization`,
        className: "bg-red-100 border-red-400 text-red-800"
      });
      
    } catch (error) {
      console.error('Failed to remove member:', error);
      setError(error instanceof Error ? error.message : 'Failed to remove member');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bucket Members</DialogTitle>
        </DialogHeader>
        
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        
        <div className="space-y-4">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="text-gray-500">Loading members...</div>
            </div>
          ) : members.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Permissions</TableHead>
                  <TableHead>Access Scope</TableHead>
                  <TableHead>Invited By</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{member.email}</TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {formatPermissions(member.permissions)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {formatScope(member.scope_type, member.scope_folders)}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-gray-600">
                      {!member.invited_by || member.invited_by === ownerEmail ? 'Owner' : member.invited_by}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleEditMember(member)}
                        >
                          Edit
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleRemoveMember(member)}
                        >
                          Remove
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8">
              <Users className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p className="text-gray-500">No members found in this bucket.</p>
            </div>
          )}
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
      
      {/* Edit Member Permissions Modal */}
      <Dialog open={showEditPermissions} onOpenChange={setShowEditPermissions}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Member Permissions - {editingMember?.email}</DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <Label className="text-sm font-medium">View Access</Label>
                <div className="mt-1 space-y-1">
                  <label className="flex items-center space-x-2">
                    <input
                      type="radio"
                      name="editView"
                      value="none"
                      checked={editPermissions.view === 'none'}
                      onChange={(e) => setEditPermissions(prev => ({...prev, view: e.target.value, download: false, share: false}))}
                    />
                    <span className="text-sm">No View</span>
                  </label>
                  <label className="flex items-center space-x-2">
                    <input
                      type="radio"
                      name="editView"
                      value="own"
                      checked={editPermissions.view === 'own'}
                      onChange={(e) => setEditPermissions(prev => ({...prev, view: e.target.value}))}
                    />
                    <span className="text-sm">View Own Files</span>
                  </label>
                  <label className="flex items-center space-x-2">
                    <input
                      type="radio"
                      name="editView"
                      value="all"
                      checked={editPermissions.view === 'all'}
                      onChange={(e) => setEditPermissions(prev => ({...prev, view: e.target.value}))}
                    />
                    <span className="text-sm">View All Files</span>
                  </label>
                </div>
              </div>
              
              <div>
                <Label className="text-sm font-medium">Upload Access</Label>
                <div className="mt-1 space-y-1">
                  <label className="flex items-center space-x-2">
                    <input
                      type="radio"
                      name="editUpload"
                      value="none"
                      checked={editPermissions.upload === 'none'}
                      onChange={(e) => setEditPermissions(prev => ({...prev, upload: e.target.value, create_folder: false}))}
                    />
                    <span className="text-sm">No Upload</span>
                  </label>
                  <label className="flex items-center space-x-2">
                    <input
                      type="radio"
                      name="editUpload"
                      value="own"
                      checked={editPermissions.upload === 'own'}
                      onChange={(e) => setEditPermissions(prev => ({...prev, upload: e.target.value}))}
                    />
                    <span className="text-sm">Upload + Manage Own</span>
                  </label>
                  <label className="flex items-center space-x-2">
                    <input
                      type="radio"
                      name="editUpload"
                      value="all"
                      checked={editPermissions.upload === 'all'}
                      onChange={(e) => setEditPermissions(prev => ({...prev, upload: e.target.value}))}
                    />
                    <span className="text-sm">Upload + Manage All</span>
                  </label>
                </div>
              </div>
            </div>
            
            <div>
              <Label className="text-sm font-medium">Extra Permissions</Label>
              <div className="mt-1 space-y-1">
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={editPermissions.download}
                    disabled={editPermissions.view === 'none'}
                    onChange={(e) => setEditPermissions(prev => ({...prev, download: e.target.checked}))}
                  />
                  <span className={`text-sm ${editPermissions.view === 'none' ? 'text-gray-400' : ''}`}>Download Files</span>
                </label>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={editPermissions.share}
                    disabled={editPermissions.view === 'none'}
                    onChange={(e) => setEditPermissions(prev => ({...prev, share: e.target.checked}))}
                  />
                  <span className={`text-sm ${editPermissions.view === 'none' ? 'text-gray-400' : ''}`}>Generate Share Links</span>
                </label>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={editPermissions.create_folder}
                    disabled={editPermissions.upload === 'none'}
                    onChange={(e) => setEditPermissions(prev => ({...prev, create_folder: e.target.checked}))}
                  />
                  <span className={`text-sm ${editPermissions.upload === 'none' ? 'text-gray-400' : ''}`}>Create Folders</span>
                </label>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={editPermissions.invite_members}
                    onChange={(e) => setEditPermissions(prev => ({...prev, invite_members: e.target.checked}))}
                  />
                  <span className="text-sm font-bold">Invite Members</span>
                </label>
              </div>
            </div>
            
            <div className="space-y-3">
              <Label className="text-base font-medium">Access Scope</Label>
              <div className="space-y-2">
                <label className="flex items-center space-x-2">
                  <input
                    type="radio"
                    name="editScope"
                    value="entire"
                    checked={editScopeType === 'entire'}
                    onChange={(e) => setEditScopeType(e.target.value)}
                  />
                  <span className="text-sm">Entire Bucket</span>
                </label>
                <label className="flex items-center space-x-2">
                  <input
                    type="radio"
                    name="editScope"
                    value="specific"
                    checked={editScopeType === 'specific'}
                    onChange={(e) => setEditScopeType(e.target.value)}
                  />
                  <span className="text-sm">Specific Folders</span>
                </label>
              </div>
            </div>
            
            {editScopeType === 'specific' && (
              <div className="space-y-2">
                <Label>Folder Paths (one per line)</Label>
                <textarea
                  className="w-full p-2 border rounded text-sm"
                  rows={4}
                  value={editSelectedFolders.join('\n')}
                  onChange={(e) => setEditSelectedFolders(e.target.value.split('\n').filter(f => f.trim()))}
                  placeholder="folder1\nfolder2/subfolder\nfolder3"
                />
                <p className="text-xs text-gray-500">
                  Enter folder paths, one per line. Each folder includes all its subfolders.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditPermissions(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => {
                setShowEditPermissions(false);
                if (editingMember) handleRemoveMember(editingMember);
              }}
            >
              Remove Member
            </Button>
            <Button onClick={handleUpdateMemberPermissions}>
              Update Permissions
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmConfig.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">{confirmConfig.message}</p>
            {confirmConfig.memberToRemove && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Type "remove" to confirm:</p>
                <input
                  type="text"
                  className="w-full p-2 border rounded"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="remove"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>
              Cancel
            </Button>
            <Button 
              variant={confirmConfig.memberToRemove ? 'destructive' : 'default'}
              onClick={() => {
                setShowConfirmDialog(false);
                confirmConfig.onConfirm();
              }}
              disabled={confirmConfig.memberToRemove && confirmText !== 'remove'}
            >
              {confirmConfig.memberToRemove ? 'Remove' : 'OK'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
};

export default MemberManagement;