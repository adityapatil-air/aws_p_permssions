import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { 
  Upload, Download, Trash2, Eye, Share, Folder, 
  File, Image, FileText, Archive, Music, Video, Play,
  Search, Filter, Grid, List, Plus, Settings, UserPlus, Building, Edit, BarChart3, Moon, Sun
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster";
import { useClerk } from "@clerk/clerk-react";
import React from "react";
import { API_BASE_URL } from '@/config/api';
import { useDarkMode } from '../hooks/use-dark-mode';

interface FileItem {
  id: string;
  name: string;
  type: 'folder' | 'file';
  size?: string;
  modified: string;
  fileType?: string;
  url?: string;
}

const mockFiles: FileItem[] = [
  { id: '1', name: 'Documents', type: 'folder', modified: '2024-01-15' },
  { id: '2', name: 'Images', type: 'folder', modified: '2024-01-20' },
  { id: '3', name: 'report.pdf', type: 'file', size: '2.5 MB', modified: '2024-01-22', fileType: 'pdf' },
  { id: '4', name: 'presentation.pptx', type: 'file', size: '5.1 MB', modified: '2024-01-21', fileType: 'pptx' },
  { id: '5', name: 'photo.jpg', type: 'file', size: '1.2 MB', modified: '2024-01-20', fileType: 'jpg' }
];

const getFileIcon = (type: string, fileType?: string) => {
  if (type === 'folder') return <Folder className="h-4 w-4 text-blue-500" />;
  
  switch (fileType?.toLowerCase()) {
    case 'jpg': case 'jpeg': case 'png': case 'gif':
      return <Image className="h-4 w-4 text-green-500" />;
    case 'pdf': case 'txt':
      return <FileText className="h-4 w-4 text-red-500" />;
    case 'doc': case 'docx':
      return <FileText className="h-4 w-4 text-blue-500" />;
    case 'ppt': case 'pptx':
      return <Play className="h-4 w-4 text-orange-600" />;
    case 'zip': case 'rar': case '7z':
      return <Archive className="h-4 w-4 text-yellow-500" />;
    case 'mp3': case 'wav': case 'flac':
      return <Music className="h-4 w-4 text-purple-500" />;
    case 'mp4': case 'avi': case 'mkv':
      return <Video className="h-4 w-4 text-green-600" />;
    default:
      return <File className="h-4 w-4 text-gray-500" />;
  }
};

const FolderTreeNode = ({ tree, level, expandedFolders, selectedFolderPaths, onToggleExpansion, onFolderSelect, isChildOfSelected }) => {
  return (
    <div>
      {Object.entries(tree).map(([folderName, folderData]) => {
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

export default function FileManager() {
  const { signOut } = useClerk();
  const { toast } = useToast();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [searchTerm, setSearchTerm] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [sortBy, setSortBy] = useState('name');
  const [currentPath, setCurrentPath] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareExpiry, setShareExpiry] = useState('1');
  const [shareLink, setShareLink] = useState('');
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  const [hasOrganization, setHasOrganization] = useState(false);
  const [showCreateOrg, setShowCreateOrg] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [orgName, setOrgName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePermissions, setInvitePermissions] = useState({
    view: 'none',
    upload: 'none',
    download: false,
    share: false,
    create_folder: false,
    invite_members: false
  });
  const [scopeType, setScopeType] = useState('entire');
  const [availableFolders, setAvailableFolders] = useState([]);
  const [selectedFolders, setSelectedFolders] = useState([]);
  const [folderTree, setFolderTree] = useState({});
  const [expandedFolders, setExpandedFolders] = useState(new Set());
  const [selectedFolderPaths, setSelectedFolderPaths] = useState(new Set());
  const [showCopyPermissions, setShowCopyPermissions] = useState(false);
  const [availableMembers, setAvailableMembers] = useState([]);
  const [selectedMemberToCopy, setSelectedMemberToCopy] = useState('');
  const [currentUser, setCurrentUser] = useState(null);
  const [userPermissions, setUserPermissions] = useState(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [showMembers, setShowMembers] = useState(false);
  const [allMembers, setAllMembers] = useState([]);
  const [editingMember, setEditingMember] = useState(null);
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
  const [editSelectedFolders, setEditSelectedFolders] = useState([]);
  const [showLogs, setShowLogs] = useState(false);
  const [activityLogs, setActivityLogs] = useState([]);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState({
    title: '',
    message: '',
    confirmText: '',
    onConfirm: () => {},
    type: 'danger'
  });
  const [showPromptDialog, setShowPromptDialog] = useState(false);
  const [promptConfig, setPromptConfig] = useState({
    title: '',
    message: '',
    defaultValue: '',
    onConfirm: () => {}
  });
  const [promptValue, setPromptValue] = useState('');
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [analytics, setAnalytics] = useState(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const { isDarkMode, toggleDarkMode } = useDarkMode();

  const currentBucket = new URLSearchParams(window.location.search).get('bucket') || 'My Bucket';

  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [allFiles, setAllFiles] = useState([]);
  const [isLoadingAllFiles, setIsLoadingAllFiles] = useState(false);

  // Debounce search term
  React.useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchTerm]);

  // Load all files from all folders for search
  const loadAllFiles = async () => {
    if (isLoadingAllFiles || allFiles.length > 0) return;
    
    setIsLoadingAllFiles(true);
    try {
      let userEmail = currentUser?.email;
      if (!userEmail) {
        const memberData = localStorage.getItem('currentMember');
        const ownerData = localStorage.getItem('currentOwner');
        if (memberData) {
          userEmail = JSON.parse(memberData).email;
        } else if (ownerData) {
          userEmail = JSON.parse(ownerData).email;
        }
      }

      const params = new URLSearchParams();
      if (userEmail) params.append('userEmail', userEmail);
      params.append('recursive', 'true');

      const response = await fetch(`${API_BASE_URL}/api/buckets/${currentBucket}/files/all?${params.toString()}`);
      const data = await response.json();
      setAllFiles(data);
    } catch (error) {
      console.error('Failed to load all files:', error);
    } finally {
      setIsLoadingAllFiles(false);
    }
  };

  // Load all files when search is initiated
  React.useEffect(() => {
    if (debouncedSearchTerm.trim().length > 0) {
      loadAllFiles();
    }
  }, [debouncedSearchTerm]);

  // Use all files for search, current folder files for normal view
  const searchFiles = debouncedSearchTerm.trim().length > 0 ? allFiles : files;
  
  const filteredFiles = searchFiles
    .filter(file => {
      // Case-insensitive partial matching
      const matchesSearch = file.name.toLowerCase().includes(debouncedSearchTerm.toLowerCase());
      const matchesFilter = filterType === 'all' || 
        (filterType === 'folders' && file.type === 'folder') ||
        (filterType === 'images' && ['jpg', 'jpeg', 'png', 'gif'].includes(file.fileType || '')) ||
        (filterType === 'documents' && ['pdf', 'doc', 'docx', 'txt'].includes(file.fileType || '')) ||
        (filterType === 'videos' && ['mp4', 'avi', 'mkv'].includes(file.fileType || ''));
      return matchesSearch && matchesFilter;
    })
    .sort((a, b) => {
      // Folders always come first regardless of filter/sort
      if (a.type === 'folder' && b.type !== 'folder') return -1;
      if (a.type !== 'folder' && b.type === 'folder') return 1;
      
      // If both are folders, sort by name
      if (a.type === 'folder' && b.type === 'folder') {
        return a.name.localeCompare(b.name);
      }
      
      // Sort files by selected criteria
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'date') return new Date(b.modified).getTime() - new Date(a.modified).getTime();
      if (sortBy === 'size') return (parseFloat(b.size || '0') - parseFloat(a.size || '0'));
      return 0;
    });

  const handleFileSelect = (fileId: string) => {
    setSelectedFiles(prev => 
      prev.includes(fileId) 
        ? prev.filter(id => id !== fileId)
        : [...prev, fileId]
    );
  };

  const handleSelectAll = () => {
    setSelectedFiles(selectedFiles.length === files.length ? [] : files.map(f => f.id));
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files;
    if (!fileList) return;

    setIsUploading(true);
    
    for (const file of Array.from(fileList)) {
      try {
        console.log('Upload request - Current Path:', currentPath);
        console.log('Upload request - File Name:', file.name);
        
        const response = await fetch(`${API_BASE_URL}/api/upload-url`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bucketName: currentBucket,
            fileName: file.name,
            fileType: file.type,
            folderPath: currentPath || '',
            userEmail: currentUser?.email
          })
        });

        if (!response.ok) {
          throw new Error('Failed to get upload URL');
        }

        const { uploadUrl } = await response.json();
        
        const uploadResponse = await fetch(uploadUrl, {
          method: 'PUT',
          body: file
        });

        if (!uploadResponse.ok) {
          throw new Error('Failed to upload file');
        }

        // Track file ownership with the same S3 key used for upload
        const s3Key = currentPath ? `${currentPath}/${file.name}` : file.name;
        console.log('Tracking ownership for S3 key:', s3Key);
        console.log('Current path during ownership tracking:', currentPath);
        
        // Get the actual user email (owner or member)
        let uploaderEmail = currentUser?.email;
        if (!uploaderEmail) {
          const memberData = localStorage.getItem('currentMember');
          const ownerData = localStorage.getItem('currentOwner');
          if (memberData) {
            uploaderEmail = JSON.parse(memberData).email;
          } else if (ownerData) {
            uploaderEmail = JSON.parse(ownerData).email;
          }
        }
        
        await fetch(`${API_BASE_URL}/api/files/ownership`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bucketName: currentBucket,
            fileName: file.name,
            filePath: s3Key,
            ownerEmail: uploaderEmail
          })
        });

        console.log(`Uploaded ${file.name} successfully`);
      } catch (error) {
        console.error(`Failed to upload ${file.name}:`, error);
        setConfirmConfig({
          title: 'Upload Error',
          message: `Failed to upload ${file.name}. Please try again.`,
          confirmText: 'OK',
          onConfirm: () => {},
          type: 'info'
        });
        setShowConfirmDialog(true);
      }
    }
    
    setIsUploading(false);
    setShowUpload(false);
    loadFiles();
    
    // Reset file input
    event.target.value = '';
  };

  const handleCreateFolder = async () => {
    if (!folderName.trim()) return;
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/folders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bucketName: currentBucket,
          folderName: folderName.trim(),
          currentPath,
          userEmail: currentUser?.email
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to create folder');
      }
      
      setFolderName('');
      setShowNewFolder(false);
      loadFiles();
      
      toast({
        title: "Folder Created",
        description: `Folder "${folderName.trim()}" created successfully`,
        className: "bg-green-100 border-green-400 text-green-800"
      });
    } catch (error) {
      console.error('Failed to create folder:', error);
      setConfirmConfig({
        title: 'Error',
        message: 'Failed to create folder. Please try again.',
        confirmText: 'OK',
        onConfirm: () => {},
        type: 'info'
      });
      setShowConfirmDialog(true);
    }
  };

  const loadFiles = async () => {
    try {
      const prefix = currentPath ? `${currentPath}/` : '';
      const params = new URLSearchParams();
      if (prefix) params.append('prefix', prefix);
      
      // Get userEmail from currentUser state or localStorage
      let userEmail = currentUser?.email;
      
      if (!userEmail) {
        const memberData = localStorage.getItem('currentMember');
        const ownerData = localStorage.getItem('currentOwner');
        
        if (memberData) {
          const member = JSON.parse(memberData);
          userEmail = member.email;
        } else if (ownerData) {
          const owner = JSON.parse(ownerData);
          userEmail = owner.email;
        }
      }
      
      if (userEmail) params.append('userEmail', userEmail);
      
      const url = `${API_BASE_URL}/api/buckets/${currentBucket}/files${params.toString() ? '?' + params.toString() : ''}`;
      console.log('=== DEBUG INFO ===');
      console.log('currentUser state:', currentUser);
      console.log('localStorage currentMember:', localStorage.getItem('currentMember'));
      console.log('localStorage currentOwner:', localStorage.getItem('currentOwner'));
      console.log('Final userEmail being sent:', userEmail);
      console.log('Loading files from:', url);
      const response = await fetch(url);
      let data = await response.json();
      console.log('=== FILES LOADED ===');
      console.log('URL:', url);
      console.log('Raw data:', data);
      console.log('Files count:', data.length);
      
      // Get bucket info to check ownership
      let bucket = null;
      try {
        const bucketResponse = await fetch(`${API_BASE_URL}/api/buckets/${currentBucket}/info?userEmail=${encodeURIComponent(userEmail)}`);
        if (bucketResponse.ok) {
          bucket = await bucketResponse.json();
        }
      } catch (error) {
        console.log('Could not fetch bucket info:', error);
      }
      
      // Filter files based on current permissions (fetch fresh from database)
      if (currentUser?.role !== 'owner' && userEmail && bucket && bucket.owner_email !== userEmail) {
        // Get fresh member permissions from database
        const memberResponse = await fetch(`${API_BASE_URL}/api/members/${encodeURIComponent(userEmail)}/permissions?bucketName=${currentBucket}`);
        if (memberResponse.ok) {
          const memberData = await memberResponse.json();
          const freshPermissions = JSON.parse(memberData.permissions || '{}');
          
          console.log('Fresh permissions from database:', freshPermissions);
          
          // Check if user should only see own files
          if (freshPermissions.uploadViewOwn && !freshPermissions.uploadViewAll && !freshPermissions.viewOnly && !freshPermissions.viewDownload) {
            console.log('User can only view own files - filtering...');
            
            const ownershipResponse = await fetch(`${API_BASE_URL}/api/files/ownership/${currentBucket}?userEmail=${encodeURIComponent(userEmail)}`);
            const ownedFiles = await ownershipResponse.json();
            const ownedFilePaths = new Set(ownedFiles.map(f => f.file_path));
            
            console.log('Owned file paths:', Array.from(ownedFilePaths));
            
            data = data.filter(file => {
              if (file.type === 'folder') return true;
              
              const filePath = file.id;
              const isOwned = ownedFilePaths.has(filePath);
              
              console.log(`Checking file: ${file.name}, path: ${filePath}, owned: ${isOwned}`);
              return isOwned;
            }).map(file => ({
              ...file,
              isOwned: file.type === 'folder' ? true : ownedFilePaths.has(file.id)
            }));
          } else {
            console.log('User can view all files - adding ownership info for permission checks');
            
            // Even for users who can view all files, we need ownership info for rename/delete permissions
            const ownershipResponse = await fetch(`${API_BASE_URL}/api/files/ownership/${currentBucket}?userEmail=${encodeURIComponent(userEmail)}`);
            const ownedFiles = await ownershipResponse.json();
            const ownedFilePaths = new Set(ownedFiles.map(f => f.file_path));
            
            // Add ownership info to each file
            data = data.map(file => ({
              ...file,
              isOwned: file.type === 'folder' ? true : ownedFilePaths.has(file.id)
            }));
            
            console.log('=== OWNERSHIP DEBUG ===');
            console.log('User email:', userEmail);
            console.log('Owned file paths:', Array.from(ownedFilePaths));
            console.log('Files with ownership info:', data.map(f => ({name: f.name, id: f.id, isOwned: f.isOwned})));
            console.log('Raw ownership response:', ownedFiles);
          }
        }
      }
      
      // For owners, mark all files as owned
      if (currentUser?.role === 'owner' || !userEmail || (bucket && bucket.owner_email === userEmail)) {
        data = data.map(file => ({
          ...file,
          isOwned: true
        }));
      }
      
      setFiles(data);
    } catch (error) {
      console.error('Failed to load files:', error);
    }
  };
  
  const checkOrganization = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/organizations/${currentBucket}`);
      const org = await response.json();
      setHasOrganization(!!org);
    } catch (error) {
      console.error('Failed to check organization:', error);
      setHasOrganization(false);
    }
  };
  
  const handleCreateOrganization = async () => {
    if (!orgName.trim()) return;
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/organizations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bucketName: currentBucket,
          organizationName: orgName.trim()
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to create organization');
      }
      
      setHasOrganization(true);
      setShowCreateOrg(false);
      setOrgName('');
      setConfirmConfig({
        title: 'Success',
        message: 'Organization created successfully!',
        confirmText: 'OK',
        onConfirm: () => {},
        type: 'success'
      });
      setShowConfirmDialog(true);
    } catch (error) {
      console.error('Failed to create organization:', error);
      setConfirmConfig({
        title: 'Error',
        message: 'Failed to create organization. Please try again.',
        confirmText: 'OK',
        onConfirm: () => {},
        type: 'info'
      });
      setShowConfirmDialog(true);
    }
  };
  
  const buildFolderTree = (folderPaths) => {
    const tree = {};
    
    folderPaths.forEach(path => {
      const parts = path.split('/');
      let current = tree;
      
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

  const loadFolders = async () => {
    try {
      const ownerData = localStorage.getItem('currentOwner');
      const memberData = localStorage.getItem('currentMember');
      
      if (ownerData) {
        // Owner can see all folders - get complete folder structure
        const owner = JSON.parse(ownerData);
        const response = await fetch(`${API_BASE_URL}/api/buckets/${currentBucket}/folders/tree?ownerEmail=${encodeURIComponent(owner.email)}`);
        const folders = await response.json();
        const tree = buildFolderTree(folders);
        setFolderTree(tree);
      } else if (memberData) {
        // Member can see all subfolders within their accessible scope
        const member = JSON.parse(memberData);
        const response = await fetch(`${API_BASE_URL}/api/buckets/${currentBucket}/folders/tree?memberEmail=${encodeURIComponent(member.email)}`);
        const folders = await response.json();
        const tree = buildFolderTree(folders);
        setFolderTree(tree);
      } else {
        setFolderTree({});
      }
    } catch (error) {
      console.error('Failed to load folders:', error);
    }
  };

  // Convert simplified permissions to old format
  const convertToOldFormat = (simplified) => {
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

    // VIEW PERMISSIONS (independent of upload)
    if (simplified.view === 'own') {
      // Can only see files uploaded by themselves
      old.uploadViewOwn = true;
    } else if (simplified.view === 'all') {
      // Can see files uploaded by anyone
      if (simplified.download) {
        old.viewDownload = true;
      } else {
        old.viewOnly = true;
      }
    }
    
    // UPLOAD PERMISSIONS (independent of view)
    if (simplified.upload === 'own') {
      // Can upload + manage own files (rename/delete own)
      old.uploadOnly = true;
      old.deleteOwnFiles = true;
    } else if (simplified.upload === 'all') {
      // Can upload + manage all files (rename/delete any)
      old.uploadViewAll = true;
      old.deleteFiles = true;
    }
    
    // COMBINATION LOGIC
    // If upload=own + view=own → uploadViewOwn only
    if (simplified.upload === 'own' && simplified.view === 'own') {
      old.uploadViewOwn = true;
      old.uploadOnly = false;
      old.deleteOwnFiles = true;
    }
    // If upload=all + view=all → uploadViewAll
    else if (simplified.upload === 'all' && simplified.view === 'all') {
      old.uploadViewAll = true;
      old.deleteFiles = true;
      if (simplified.download) old.viewDownload = true;
    }
    
    // Extra permissions
    if (simplified.share) old.generateLinks = true;
    if (simplified.create_folder) old.createFolder = true;
    if (simplified.invite_members) old.inviteMembers = true;

    return old;
  };

  const handleSendInvite = async () => {
    if (!inviteEmail.trim()) return;
    
    try {
      const oldFormatPermissions = convertToOldFormat(invitePermissions);
      
      const response = await fetch(`${API_BASE_URL}/api/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bucketName: currentBucket,
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
      
      setShowInvite(false);
      setInviteEmail('');
      setInvitePermissions({
        view: 'none',
        upload: 'none',
        download: false,
        share: false,
        create_folder: false,
        invite_members: false
      });
      setScopeType('entire');
      setSelectedFolders([]);
      setExpandedFolders(new Set());
      setSelectedFolderPaths(new Set());
      setShowCopyPermissions(false);
      setAvailableMembers([]);
      setSelectedMemberToCopy('');
      
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
        setConfirmConfig({
          title: 'Invitation Created',
          message: `Share this link with ${inviteEmail}:\n\n${data.inviteLink}`,
          confirmText: 'Copy Link',
          onConfirm: () => navigator.clipboard.writeText(data.inviteLink),
          type: 'success'
        });
        setShowConfirmDialog(true);
      }
    } catch (error) {
      console.error('Failed to send invitation:', error);
      setConfirmConfig({
        title: 'Error',
        message: error.message || 'Failed to send invitation',
        confirmText: 'OK',
        onConfirm: () => {},
        type: 'info'
      });
      setShowConfirmDialog(true);
    }
  };
  


  const handleFolderClick = (folderName: string, folderId?: string) => {
    // If folderId contains full path (virtual folder), use it directly
    if (folderId && folderId.includes('/')) {
      const virtualPath = folderId.replace(/\/$/, ''); // Remove trailing slash
      console.log('Setting virtual path:', virtualPath);
      setCurrentPath(virtualPath);
    } else {
      const newPath = currentPath ? `${currentPath}/${folderName}` : folderName;
      setCurrentPath(newPath);
    }
  };

  const handleBackClick = () => {
    const pathParts = currentPath.split('/');
    pathParts.pop();
    setCurrentPath(pathParts.join('/'));
  };

  const handleDownload = async () => {
    if (selectedFiles.length === 0) return;
    
    try {
      const selectedItems = selectedFiles.map(fileId => {
        const fileObj = files.find(f => f.id === fileId);
        return {
          key: fileId,
          name: fileObj?.name || fileId,
          type: fileObj?.type || 'file'
        };
      });
      
      const response = await fetch(`${API_BASE_URL}/api/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bucketName: currentBucket,
          items: selectedItems,
          userEmail: currentUser?.email
        })
      });
      
      if (!response.ok) throw new Error('Download failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      if (selectedItems.length === 1 && selectedItems[0].type === 'file') {
        a.download = selectedItems[0].name;
      } else {
        a.download = selectedItems.length === 1 ? `${selectedItems[0].name}.zip` : 'download.zip';
      }
      
      a.click();
      window.URL.revokeObjectURL(url);
      
    } catch (error) {
      console.error('Download failed:', error);
      setConfirmConfig({
        title: 'Error',
        message: 'Download failed. Please try again.',
        confirmText: 'OK',
        onConfirm: () => {},
        type: 'info'
      });
      setShowConfirmDialog(true);
    }
  };

  const handleDelete = async () => {
    console.log('Bulk deleting files:', selectedFiles);
    if (selectedFiles.length === 0) return;
    
    setConfirmConfig({
      title: 'Delete Items',
      message: `Are you sure you want to delete ${selectedFiles.length} item(s)? This action cannot be undone.`,
      confirmText: 'delete',
      onConfirm: () => performBulkDelete(),
      type: 'danger',
      requiresTyping: true
    });
    setDeleteConfirmText('');
    setShowConfirmDialog(true);
    return;
  };

  const performBulkDelete = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/delete`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bucketName: currentBucket,
          items: selectedFiles,
          userEmail: currentUser?.email
        })
      });
      
      if (!response.ok) throw new Error('Delete failed');
      
      setSelectedFiles([]);
      await loadFiles();
      
      toast({
        title: "Files Deleted",
        description: `${selectedFiles.length} item(s) deleted successfully`,
        className: "bg-red-100 border-red-400 text-red-800"
      });
    } catch (error) {
      console.error('Delete failed:', error);
      setConfirmConfig({
        title: 'Error',
        message: 'Delete failed. Please try again.',
        confirmText: 'OK',
        onConfirm: () => {},
        type: 'info'
      });
      setShowConfirmDialog(true);
    }
  };

  const handleGenerateShareLink = async () => {
    if (selectedFiles.length === 0) return;
    
    setIsGeneratingLink(true);
    
    try {
      const selectedItems = selectedFiles.map(fileId => {
        const fileObj = files.find(f => f.id === fileId);
        return {
          key: fileId,
          name: fileObj?.name || fileId,
          type: fileObj?.type || 'file'
        };
      });
      
      const response = await fetch(`${API_BASE_URL}/api/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bucketName: currentBucket,
          items: selectedItems,
          shareType: 'limited',
          expiryHours: parseInt(shareExpiry),
          userEmail: currentUser?.email
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to generate share link');
      }
      
      const data = await response.json();
      setShareLink(data.shareUrl);
      
    } catch (error) {
      console.error('Share failed:', error);
      setConfirmConfig({
        title: 'Error',
        message: 'Failed to generate share link. Please try again.',
        confirmText: 'OK',
        onConfirm: () => {},
        type: 'info'
      });
      setShowConfirmDialog(true);
    } finally {
      setIsGeneratingLink(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(shareLink);
    setConfirmConfig({
      title: 'Success',
      message: 'Link copied to clipboard!',
      confirmText: 'OK',
      onConfirm: () => {},
      type: 'success'
    });
    setShowConfirmDialog(true);
    setTimeout(() => setShowConfirmDialog(false), 1500);
  };

  const hasPermission = (action, file = null) => {
    // Check if user is owner first
    const ownerData = localStorage.getItem('currentOwner');
    const memberData = localStorage.getItem('currentMember');
    
    if (ownerData && !memberData) return true; // Owner has all permissions
    
    // Get member permissions
    if (!memberData) return false;
    
    const member = JSON.parse(memberData);
    const freshPermissions = JSON.parse(member.permissions || '{}');
    
    console.log(`Permission check for ${action} on file ${file?.name || 'bulk'}: permissions=`, freshPermissions, 'isOwned=', file?.isOwned);
    
    switch (action) {
      case 'upload':
        return freshPermissions.uploadOnly || freshPermissions.uploadViewOwn || freshPermissions.uploadViewAll;
      case 'download':
        return freshPermissions.viewDownload || freshPermissions.uploadViewAll;
      case 'delete':
        if (freshPermissions.deleteFiles || freshPermissions.uploadViewAll) {
          return true; // Can delete all files
        }
        if (freshPermissions.deleteOwnFiles || freshPermissions.uploadViewOwn) {
          // Can only delete own files - check ownership
          if (!file) return true; // Allow if no specific file (bulk operations)
          console.log(`Delete permission check for ${file.name}: isOwned=${file.isOwned}`);
          return file.isOwned === true;
        }
        return false;
      case 'share':
        return freshPermissions.generateLinks;
      case 'createFolder':
        return freshPermissions.createFolder;
      case 'invite':
        return freshPermissions.inviteMembers;
      case 'rename':
        if (freshPermissions.uploadViewAll || freshPermissions.deleteFiles) {
          return true; // Can rename all files
        }
        if (freshPermissions.uploadViewOwn || freshPermissions.deleteOwnFiles) {
          // Can only rename own files - check ownership
          if (!file) return true; // Allow if no specific file
          console.log(`Rename permission check for ${file.name}: isOwned=${file.isOwned}`);
          return file.isOwned === true;
        }
        return false;
      case 'preview':
        // Check if user can view this specific file
        if (freshPermissions.uploadViewAll || freshPermissions.viewDownload || freshPermissions.viewOnly) {
          return true; // Can view all files
        }
        if (freshPermissions.uploadViewOwn) {
          return true; // File ownership already filtered in loadFiles
        }
        return false;
      default:
        return false;
    }
  };

  const handleUploadClick = () => {
    if (!hasPermission('upload')) {
      setConfirmConfig({
        title: 'Permission Denied',
        message: 'You do not have permission to upload files. Please contact the owner for access.',
        confirmText: 'OK',
        onConfirm: () => {},
        type: 'info'
      });
      setShowConfirmDialog(true);
      return;
    }
    
    // Check if user is at virtual root (has specific folder permissions but not in a folder)
    const memberData = localStorage.getItem('currentMember');
    if (memberData && !currentPath) {
      const member = JSON.parse(memberData);
      
      // Check if member has specific folder scope (not entire bucket access)
      if (member.scopeType === 'specific' || (member.scopeFolders && member.scopeFolders.length > 0)) {
        setConfirmConfig({
          title: 'Access Restricted',
          message: 'Please navigate to a folder first before uploading files.',
          confirmText: 'OK',
          onConfirm: () => {},
          type: 'info'
        });
        setShowConfirmDialog(true);
        return;
      }
    }
    
    setShowUpload(true);
  };

  const handleShareClick = () => {
    if (!hasPermission('share')) {
      setConfirmConfig({
        title: 'Permission Denied',
        message: 'You do not have permission to share files. Please contact the owner for access.',
        confirmText: 'OK',
        onConfirm: () => {},
        type: 'info'
      });
      setShowConfirmDialog(true);
      return;
    }
    setShowShareModal(true);
  };

  const handleDeleteClick = () => {
    // Check if user has delete permission for all selected files
    const selectedFileObjects = selectedFiles.map(fileId => files.find(f => f.id === fileId)).filter(Boolean);
    const canDeleteAll = selectedFileObjects.every(file => hasPermission('delete', file));
    
    if (!canDeleteAll) {
      setConfirmConfig({
        title: 'Permission Denied',
        message: 'You do not have permission to delete some of the selected files. You can only delete files you uploaded.',
        confirmText: 'OK',
        onConfirm: () => {},
        type: 'info'
      });
      setShowConfirmDialog(true);
      return;
    }
    handleDelete();
  };

  const handleNewFolderClick = () => {
    if (!hasPermission('createFolder')) {
      setConfirmConfig({
        title: 'Permission Denied',
        message: 'You do not have permission to create folders. Please contact the owner for access.',
        confirmText: 'OK',
        onConfirm: () => {},
        type: 'info'
      });
      setShowConfirmDialog(true);
      return;
    }
    
    // Check if user is at virtual root
    const memberData = localStorage.getItem('currentMember');
    if (memberData && !currentPath) {
      const member = JSON.parse(memberData);
      
      // Check if member has specific folder scope (not entire bucket access)
      if (member.scopeType === 'specific' || (member.scopeFolders && member.scopeFolders.length > 0)) {
        setConfirmConfig({
          title: 'Access Restricted',
          message: 'Please navigate to a folder first before creating new folders.',
          confirmText: 'OK',
          onConfirm: () => {},
          type: 'info'
        });
        setShowConfirmDialog(true);
        return;
      }
    }
    
    setShowNewFolder(true);
  };

  const handlePreviewFile = (file) => {
    if (file.type === 'folder') return;
    
    const fileExt = file.fileType?.toLowerCase();
    const previewableTypes = ['jpg', 'jpeg', 'png', 'gif', 'pdf', 'txt', 'html', 'css', 'js', 'json'];
    
    if (!previewableTypes.includes(fileExt)) {
      setConfirmConfig({
        title: 'Preview Not Available',
        message: `Preview not available for ${fileExt?.toUpperCase() || 'this'} files. Use download to view the file.`,
        confirmText: 'OK',
        onConfirm: () => {},
        type: 'info'
      });
      setShowConfirmDialog(true);
      return;
    }
    
    // Generate preview URL with encoded file path
    const encodedFileId = encodeURIComponent(file.id);
    const previewUrl = `${API_BASE_URL}/api/preview/${currentBucket}/${encodedFileId}?userEmail=${encodeURIComponent(currentUser?.email || '')}`;
    window.open(previewUrl, '_blank');
  };

  const handleDownloadSingle = async (file) => {
    if (!hasPermission('download')) {
      setConfirmConfig({
        title: 'Permission Denied',
        message: 'You do not have permission to download files. Please contact the owner for access.',
        confirmText: 'OK',
        onConfirm: () => {},
        type: 'info'
      });
      setShowConfirmDialog(true);
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bucketName: currentBucket,
          items: [{ key: file.id, name: file.name, type: file.type }],
          userEmail: currentUser?.email
        })
      });
      
      if (!response.ok) throw new Error('Download failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download failed:', error);
      setConfirmConfig({
        title: 'Error',
        message: 'Download failed. Please try again.',
        confirmText: 'OK',
        onConfirm: () => {},
        type: 'info'
      });
      setShowConfirmDialog(true);
    }
  };

  const handleShareSingle = async (file) => {
    if (!hasPermission('share')) {
      setConfirmConfig({
        title: 'Permission Denied',
        message: 'You do not have permission to share files. Please contact the owner for access.',
        confirmText: 'OK',
        onConfirm: () => {},
        type: 'info'
      });
      setShowConfirmDialog(true);
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bucketName: currentBucket,
          items: [{ key: file.id, name: file.name, type: file.type }],
          shareType: 'limited',
          expiryHours: 24,
          userEmail: currentUser?.email
        })
      });
      
      if (!response.ok) throw new Error('Failed to generate share link');
      
      const data = await response.json();
      navigator.clipboard.writeText(data.shareUrl);
      
      const message = file.type === 'folder' 
        ? 'Folder share link copied to clipboard! Recipients can browse and download files from this folder.'
        : 'File share link copied to clipboard!';
      
      setConfirmConfig({
        title: 'Success',
        message: message,
        confirmText: 'OK',
        onConfirm: () => {},
        type: 'success'
      });
      setShowConfirmDialog(true);
      setTimeout(() => setShowConfirmDialog(false), 2000);
    } catch (error) {
      console.error('Share failed:', error);
      setConfirmConfig({
        title: 'Error',
        message: 'Failed to generate share link. Please try again.',
        confirmText: 'OK',
        onConfirm: () => {},
        type: 'info'
      });
      setShowConfirmDialog(true);
    }
  };

  const handleRename = async (file) => {
    if (!hasPermission('rename', file)) {
      setConfirmConfig({
        title: 'Permission Denied',
        message: 'You do not have permission to rename this file. You can only rename files you uploaded.',
        confirmText: 'OK',
        onConfirm: () => {},
        type: 'info'
      });
      setShowConfirmDialog(true);
      return;
    }
    
    setPromptConfig({
      title: `Rename ${file.type}`,
      message: `Enter new name for "${file.name}":`,
      defaultValue: file.name,
      onConfirm: (newName) => performRename(file, newName)
    });
    setPromptValue(file.name);
    setShowPromptDialog(true);
    return;
  };

  const performRename = async (file, newName) => {
    if (!newName || newName === file.name) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bucketName: currentBucket,
          oldKey: file.id,
          newName: newName,
          type: file.type,
          currentPath: currentPath,
          userEmail: currentUser?.email
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to rename');
      }
      
      await loadFiles(); // Refresh the file list
      
      toast({
        title: "File Renamed",
        description: `"${file.name}" renamed successfully`,
        className: "bg-green-100 border-green-400 text-green-800"
      });
      
      // Refresh member permissions if user is a member (in case folder permissions were updated)
      const memberData = localStorage.getItem('currentMember');
      if (memberData) {
        try {
          const member = JSON.parse(memberData);
          const response = await fetch(`${API_BASE_URL}/api/members/${encodeURIComponent(member.email)}/permissions?bucketName=${currentBucket}`);
          if (response.ok) {
            const updatedMemberData = await response.json();
            const refreshedMember = {
              ...member,
              permissions: updatedMemberData.permissions,
              scopeType: updatedMemberData.scope_type,
              scopeFolders: updatedMemberData.scope_folders
            };
            localStorage.setItem('currentMember', JSON.stringify(refreshedMember));
            console.log('Refreshed member permissions after rename');
          }
        } catch (error) {
          console.error('Failed to refresh member permissions:', error);
        }
      }
    } catch (error) {
      console.error('Rename failed:', error);
      setConfirmConfig({
        title: 'Error',
        message: error.message || 'Failed to rename',
        confirmText: 'OK',
        onConfirm: () => {},
        type: 'info'
      });
      setShowConfirmDialog(true);
    }
  };

  const handleDeleteSingle = async (file) => {
    console.log('Deleting file:', file.name, 'ID:', file.id);
    if (!hasPermission('delete', file)) {
      setConfirmConfig({
        title: 'Permission Denied',
        message: 'You do not have permission to delete this file. You can only delete files you uploaded.',
        confirmText: 'OK',
        onConfirm: () => {},
        type: 'info'
      });
      setShowConfirmDialog(true);
      return;
    }

    setConfirmConfig({
      title: 'Delete File',
      message: `Are you sure you want to delete "${file.name}"? This action cannot be undone.`,
      confirmText: 'delete',
      onConfirm: () => performSingleDelete(file),
      type: 'danger',
      requiresTyping: true
    });
    setDeleteConfirmText('');
    setShowConfirmDialog(true);
    return;
  };

  const performSingleDelete = async (file) => {
    try {
      const deletePayload = {
        bucketName: currentBucket,
        items: [file.id],
        userEmail: currentUser?.email
      };
      
      const response = await fetch(`${API_BASE_URL}/api/delete`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(deletePayload)
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete');
      }
      
      await loadFiles(); // Refresh the file list
      toast({
        title: "File Deleted",
        description: `"${file.name}" deleted successfully`,
        className: "bg-red-100 border-red-400 text-red-800"
      });
    } catch (error) {
      console.error('Delete failed:', error);
      setConfirmConfig({
        title: 'Error',
        message: error.message || 'Failed to delete',
        confirmText: 'OK',
        onConfirm: () => {},
        type: 'info'
      });
      setShowConfirmDialog(true);
    }
  };

  const handlePasswordChange = async () => {
    if (!passwordData.newPassword || !passwordData.confirmPassword) {
      setConfirmConfig({
        title: 'Error',
        message: 'Please fill in all fields',
        confirmText: 'OK',
        onConfirm: () => {},
        type: 'info'
      });
      setShowConfirmDialog(true);
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setConfirmConfig({
        title: 'Error',
        message: 'New passwords do not match',
        confirmText: 'OK',
        onConfirm: () => {},
        type: 'info'
      });
      setShowConfirmDialog(true);
      return;
    }

    if (passwordData.newPassword.length < 6) {
      setConfirmConfig({
        title: 'Error',
        message: 'Password must be at least 6 characters',
        confirmText: 'OK',
        onConfirm: () => {},
        type: 'info'
      });
      setShowConfirmDialog(true);
      return;
    }

    try {
      const endpoint = currentUser?.role === 'owner' ? '/api/owner/change-password' : '/api/member/change-password';
      
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: currentUser?.email,
          currentPassword: passwordData.currentPassword,
          newPassword: passwordData.newPassword
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        if (data.isGoogleUser) {
          setConfirmConfig({
            title: 'Google Account',
            message: data.error,
            confirmText: 'OK',
            onConfirm: () => {
              setShowPasswordModal(false);
              setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
            },
            type: 'info'
          });
          setShowConfirmDialog(true);
          return;
        }
        throw new Error(data.error || 'Failed to change password');
      }
      
      setConfirmConfig({
        title: 'Success',
        message: 'Password changed successfully! Please login again.',
        confirmText: 'OK',
        onConfirm: () => {
          setShowPasswordModal(false);
          setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
          localStorage.removeItem('currentMember');
          localStorage.removeItem('currentOwner');
          if (currentUser?.role === 'owner') {
            signOut();
          } else {
            window.location.href = '/login';
          }
        },
        type: 'success'
      });
      setShowConfirmDialog(true);
    } catch (error) {
      console.error('Password change failed:', error);
      setConfirmConfig({
        title: 'Error',
        message: error.message || 'Failed to change password',
        confirmText: 'OK',
        onConfirm: () => {},
        type: 'info'
      });
      setShowConfirmDialog(true);
    }
  };

  // Load user data on component mount
  React.useEffect(() => {
    const memberData = localStorage.getItem('currentMember');
    const ownerData = localStorage.getItem('currentOwner');
    
    if (memberData) {
      const member = JSON.parse(memberData);
      setCurrentUser({ email: member.email, role: 'member' });
      
      // For multi-bucket members, find permissions for current bucket
      if (member.buckets && member.buckets.length > 0) {
        const currentBucketData = member.buckets.find(b => b.bucketName === currentBucket);
        if (currentBucketData) {
          setUserPermissions(JSON.parse(currentBucketData.permissions || '{}'));
        }
      } else {
        // Backward compatibility
        setUserPermissions(JSON.parse(member.permissions || '{}'));
      }
    } else if (ownerData) {
      const owner = JSON.parse(ownerData);
      setCurrentUser({ email: owner.email, role: 'owner' });
      setUserPermissions(null);
    }
  }, [currentBucket]);
  
  // Load files when bucket or path changes
  React.useEffect(() => {
    if (currentBucket !== 'My Bucket') {
      loadFiles();
      checkOrganization();
    }
  }, [currentBucket, currentPath]);

  React.useEffect(() => {
    if (showInvite && scopeType === 'specific') {
      setExpandedFolders(new Set());
      setSelectedFolderPaths(new Set());
      loadFolders();
    }
  }, [showInvite, scopeType]);

  React.useEffect(() => {
    if (showMembers) {
      loadAllMembers();
    }
  }, [showMembers]);

  React.useEffect(() => {
    if (showEditPermissions && editScopeType === 'specific') {
      setExpandedFolders(new Set());
      loadFolders();
    }
  }, [showEditPermissions, editScopeType]);

  React.useEffect(() => {
    if (showLogs) {
      loadActivityLogs();
    }
  }, [showLogs]);

  const toggleFolderExpansion = (folderPath) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folderPath)) {
      newExpanded.delete(folderPath);
    } else {
      newExpanded.add(folderPath);
    }
    setExpandedFolders(newExpanded);
  };

  const isChildOfSelected = (folderPath, selectedPaths) => {
    return Array.from(selectedPaths).some(selectedPath => 
      folderPath.startsWith(selectedPath + '/') || folderPath === selectedPath
    );
  };

  const getChildPaths = (folderPath, tree) => {
    const paths = [];
    const traverse = (node, currentPath) => {
      Object.keys(node).forEach(key => {
        const childPath = currentPath ? `${currentPath}/${key}` : key;
        paths.push(childPath);
        if (node[key].children && Object.keys(node[key].children).length > 0) {
          traverse(node[key].children, childPath);
        }
      });
    };
    
    const parts = folderPath.split('/');
    let current = tree;
    for (const part of parts) {
      if (current[part]) {
        current = current[part].children;
      } else {
        return [];
      }
    }
    traverse(current, folderPath);
    return paths;
  };

  const handleFolderSelect = (folderPath, isSelected) => {
    const newSelected = new Set(selectedFolderPaths);
    
    if (isSelected) {
      // Add folder and remove any parent paths that would be redundant
      newSelected.add(folderPath);
      
      // Remove any child paths as they're now covered by parent
      const childPaths = getChildPaths(folderPath, folderTree);
      childPaths.forEach(childPath => newSelected.delete(childPath));
      
      // Remove any parent paths that are now redundant
      Array.from(newSelected).forEach(selectedPath => {
        if (folderPath.startsWith(selectedPath + '/')) {
          newSelected.delete(selectedPath);
        }
      });
    } else {
      // Remove folder and all its children
      newSelected.delete(folderPath);
      const childPaths = getChildPaths(folderPath, folderTree);
      childPaths.forEach(childPath => newSelected.delete(childPath));
    }
    
    setSelectedFolderPaths(newSelected);
    setSelectedFolders(Array.from(newSelected));
  };

  const loadAvailableMembers = async () => {
    try {
      const currentUserEmail = currentUser?.email;
      const isOwner = currentUser?.role === 'owner';
      
      const response = await fetch(`${API_BASE_URL}/api/buckets/${currentBucket}/members?userEmail=${encodeURIComponent(currentUserEmail)}&isOwner=${isOwner}`);
      const members = await response.json();
      setAvailableMembers(members);
    } catch (error) {
      console.error('Failed to load members:', error);
    }
  };

  const handleCopyPermissions = async (memberEmail) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/members/${encodeURIComponent(memberEmail)}/permissions?bucketName=${currentBucket}`);
      const memberData = await response.json();
      
      if (memberData.permissions) {
        const permissions = JSON.parse(memberData.permissions);
        
        // Convert old format to simplified format
        const simplified = {
          view: 'none',
          upload: 'none',
          download: false,
          share: false,
          create_folder: false,
          invite_members: false
        };
        
        // Determine view permissions
        if (permissions.uploadViewOwn) {
          simplified.view = 'own';
        } else if (permissions.uploadViewAll || permissions.viewDownload || permissions.viewOnly) {
          simplified.view = 'all';
        }
        
        // Determine upload permissions
        if (permissions.uploadViewOwn) {
          simplified.upload = 'own';
        } else if (permissions.uploadViewAll) {
          simplified.upload = 'all';
        }
        
        // Set other permissions
        if (permissions.viewDownload) simplified.download = true;
        if (permissions.generateLinks) simplified.share = true;
        if (permissions.createFolder) simplified.create_folder = true;
        if (permissions.inviteMembers) simplified.invite_members = true;
        
        if (showEditPermissions) {
          setEditPermissions(simplified);
          if (memberData.scope_type) {
            setEditScopeType(memberData.scope_type);
            if (memberData.scope_folders) {
              const scopeFolders = JSON.parse(memberData.scope_folders);
              setEditSelectedFolders(scopeFolders);
            }
          }
        } else {
          setInvitePermissions(simplified);
          
          // Copy scope settings
          if (memberData.scope_type) {
            setScopeType(memberData.scope_type);
            if (memberData.scope_folders) {
              const scopeFolders = JSON.parse(memberData.scope_folders);
              setSelectedFolders(scopeFolders);
              setSelectedFolderPaths(new Set(scopeFolders));
            }
          }
        }
      }
      
      setShowCopyPermissions(false);
      setSelectedMemberToCopy('');
    } catch (error) {
      console.error('Failed to copy permissions:', error);
      setConfirmConfig({
        title: 'Error',
        message: 'Failed to copy permissions',
        confirmText: 'OK',
        onConfirm: () => {},
        type: 'info'
      });
      setShowConfirmDialog(true);
    }
  };

  const handleShowCopyPermissions = () => {
    setShowCopyPermissions(true);
    loadAvailableMembers();
  };

  const loadAllMembers = async () => {
    try {
      // Get owner email from currentUser or localStorage
      let ownerEmail = currentUser?.email;
      if (!ownerEmail) {
        const ownerData = localStorage.getItem('currentOwner');
        if (ownerData) {
          ownerEmail = JSON.parse(ownerData).email;
        }
      }
      
      if (!ownerEmail) {
        console.error('No owner email found');
        return;
      }
      
      const url = `${API_BASE_URL}/api/buckets/${currentBucket}/all-members?ownerEmail=${encodeURIComponent(ownerEmail)}`;
      const response = await fetch(url);
      const members = await response.json();
      setAllMembers(members);
    } catch (error) {
      console.error('Failed to load all members:', error);
    }
  };

  const formatPermissions = (permissionsStr) => {
    try {
      const perms = JSON.parse(permissionsStr);
      const permissions = [];
      
      // View permissions with more detail
      if (perms.uploadViewOwn) {
        permissions.push('View Own Files');
      } else if (perms.uploadViewAll || perms.viewOnly || perms.viewDownload) {
        permissions.push('View All Files');
      }
      
      // Download permission
      if (perms.viewDownload) {
        permissions.push('Download');
      }
      
      // Upload permissions
      if (perms.uploadViewOwn) {
        permissions.push('Upload + Manage Own');
      } else if (perms.uploadViewAll) {
        permissions.push('Upload + Manage All');
      }
      
      // Other permissions
      if (perms.generateLinks) permissions.push('Generate Share Links');
      if (perms.createFolder) permissions.push('Create Folders');
      if (perms.inviteMembers) permissions.push('Invite Members');
      
      return permissions.length > 0 ? permissions.join(', ') : 'No permissions';
    } catch {
      return 'Invalid permissions';
    }
  };

  const formatScope = (scopeType, scopeFolders) => {
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

  const handleEditMember = (member) => {
    setEditingMember(member);
    
    // Parse current permissions
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
      
      if (perms.viewOnly || perms.viewDownload) simplified.view = 'all';
      if (perms.uploadViewOwn) {
        simplified.view = 'own';
        simplified.upload = 'own';
      }
      if (perms.uploadViewAll) {
        simplified.view = 'all';
        simplified.upload = 'all';
      }
      if (perms.viewDownload) simplified.download = true;
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
          bucketName: currentBucket,
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
      loadAllMembers(); // Refresh the members list
      
      toast({
        title: "Permissions Updated",
        description: `Permissions updated for ${editingMember?.email}`,
        className: "bg-green-100 border-green-400 text-green-800"
      });
      
    } catch (error) {
      console.error('Failed to update member permissions:', error);
      setConfirmConfig({
        title: 'Error',
        message: error.message || 'Failed to update permissions',
        confirmText: 'OK',
        onConfirm: () => {},
        type: 'info'
      });
      setShowConfirmDialog(true);
    }
  };

  const handleRemoveMember = (member) => {
    setConfirmConfig({
      title: 'Remove Member',
      message: `Remove ${member.email} from the organization? They will lose access to this bucket.`,
      confirmText: 'remove',
      onConfirm: () => performRemoveMember(member),
      type: 'danger',
      requiresTyping: true
    });
    setDeleteConfirmText('');
    setShowConfirmDialog(true);
    return;
  };

  const performRemoveMember = async (member) => {
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/members/${encodeURIComponent(member.email)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bucketName: currentBucket
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to remove member');
      }
      
      loadAllMembers(); // Refresh the members list
      setShowMembers(false); // Navigate back to member list
      setShowEditPermissions(false); // Close edit permissions window
      setEditingMember(null); // Clear editing member
      
      toast({
        title: "Member Removed",
        description: `${member.email} has been removed from the organization`,
        className: "bg-red-100 border-red-400 text-red-800"
      });
      
    } catch (error) {
      console.error('Failed to remove member:', error);
      setConfirmConfig({
        title: 'Error',
        message: error.message || 'Failed to remove member',
        confirmText: 'OK',
        onConfirm: () => {},
        type: 'info'
      });
      setShowConfirmDialog(true);
    }
  };

  const loadActivityLogs = async () => {
    try {
      // Get owner email from currentUser or localStorage
      let ownerEmail = currentUser?.email;
      if (!ownerEmail) {
        const ownerData = localStorage.getItem('currentOwner');
        if (ownerData) {
          ownerEmail = JSON.parse(ownerData).email;
        }
      }
      
      if (!ownerEmail) {
        console.error('No owner email found');
        return;
      }
      
      const url = `${API_BASE_URL}/api/buckets/${currentBucket}/logs?ownerEmail=${encodeURIComponent(ownerEmail)}`;
      const response = await fetch(url);
      const logs = await response.json();
      setActivityLogs(logs);
    } catch (error) {
      console.error('Failed to load activity logs:', error);
    }
  };

  const formatAction = (action) => {
    const actionMap = {
      'upload': 'Upload',
      'delete': 'Delete',
      'delete_folder': 'Delete Folder',
      'rename': 'Rename',
      'share': 'Share Link',
      'create_folder': 'Create Folder',
      'permission_change': 'Permission Change'
    };
    return actionMap[action] || action;
  };

  const formatDetails = (action, oldName, details) => {
    if (action === 'rename' && oldName && details) {
      return `${oldName} → ${details}`;
    }
    if (action === 'share' && details) {
      return details;
    }
    if (action === 'permission_change') {
      return details || 'Permissions updated';
    }
    return '-';
  };

  const loadBucketAnalytics = async () => {
    setLoadingAnalytics(true);
    try {
      let userEmail = currentUser?.email;
      if (!userEmail) {
        const memberData = localStorage.getItem('currentMember');
        const ownerData = localStorage.getItem('currentOwner');
        if (memberData) {
          userEmail = JSON.parse(memberData).email;
        } else if (ownerData) {
          userEmail = JSON.parse(ownerData).email;
        }
      }
      
      if (!userEmail) {
        console.error('No user email found for analytics');
        setAnalytics(null);
        return;
      }
      
      const response = await fetch(`${API_BASE_URL}/api/buckets/${currentBucket}/analytics?ownerEmail=${encodeURIComponent(userEmail)}`);
      
      if (!response.ok) {
        throw new Error(`Analytics request failed: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('Analytics data:', data);
      setAnalytics(data);
    } catch (error) {
      console.error('Failed to load analytics:', error);
      setAnalytics(null);
    } finally {
      setLoadingAnalytics(false);
    }
  };

  const handleAnalyticsClick = () => {
    setShowAnalytics(true);
    loadBucketAnalytics();
  };

  const canGrantPermission = (permissionType, permissionValue) => {
    if (currentUser?.role === 'owner') return true;
    if (!userPermissions) return false;

    switch (permissionType) {
      case 'view':
        if (permissionValue === 'all') {
          return userPermissions.uploadViewAll || userPermissions.viewDownload;
        }
        if (permissionValue === 'own') {
          return userPermissions.uploadViewOwn || userPermissions.uploadViewAll;
        }
        return true;
      
      case 'upload':
        if (permissionValue === 'all') {
          return userPermissions.uploadViewAll;
        }
        if (permissionValue === 'own') {
          return userPermissions.uploadViewOwn || userPermissions.uploadViewAll;
        }
        return true;
      
      case 'download':
        return userPermissions.viewDownload || userPermissions.uploadViewAll;
      
      case 'share':
        return userPermissions.generateLinks;
      
      case 'create_folder':
        return userPermissions.createFolder;
      
      case 'invite_members':
        return userPermissions.inviteMembers;
      
      default:
        return false;
    }
  };

  const canGrantScope = (scopeType) => {
    if (currentUser?.role === 'owner') return true;
    if (!userPermissions) return false;

    // Get current user's scope from localStorage
    const memberData = localStorage.getItem('currentMember');
    if (memberData) {
      const member = JSON.parse(memberData);
      if (scopeType === 'entire') {
        // Can only grant entire bucket access if user has entire bucket access
        return member.scopeType === 'entire';
      }
      if (scopeType === 'specific') {
        // Can grant specific folder access if user has any access
        return true;
      }
    }
    return false;
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col transition-colors">
      <header className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 px-6 py-4 transition-colors">
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <h1 className="text-2xl font-bold dark:text-white cursor-pointer hover:text-blue-600 dark:hover:text-blue-400" onClick={() => {
              // Navigate to appropriate dashboard based on user type
              const memberData = localStorage.getItem('currentMember');
              const ownerData = localStorage.getItem('currentOwner');
              
              if (memberData) {
                window.location.href = '/member-auth';
              } else if (ownerData) {
                window.location.href = '/owner-dashboard';
              } else {
                window.location.href = '/login';
              }
            }}>ShipFile</h1>
            <div className="flex items-center space-x-1 text-sm">
              {(() => {
                // Always refresh member data from localStorage to get latest permissions
                const memberData = localStorage.getItem('currentMember');
                if (memberData) {
                  const member = JSON.parse(memberData);
                  if (member.scopeType === 'specific' && member.scopeFolders) {
                    // Parse fresh scope folders (in case they were updated after rename)
                    let scopeFolders;
                    try {
                      scopeFolders = typeof member.scopeFolders === 'string' 
                        ? JSON.parse(member.scopeFolders) 
                        : member.scopeFolders;
                    } catch (e) {
                      scopeFolders = [];
                    }
                    
                    if (scopeFolders.length === 1) {
                      // Show only the deepest folder name as root
                      const scopeFolder = scopeFolders[0];
                      const folderName = scopeFolder.split('/').pop();
                      const relativePath = currentPath.replace(scopeFolder, '').replace(/^\//, '');
                      
                      return (
                        <>
                          <span className="text-blue-600 cursor-pointer" onClick={() => setCurrentPath(scopeFolder)}>
                            {currentBucket}/{folderName}
                          </span>
                          {relativePath && (
                            <>
                              <span className="text-gray-400">/</span>
                              <span className="text-gray-600">{relativePath}</span>
                            </>
                          )}
                        </>
                      );
                    }
                  }
                }
                
                // Default breadcrumb for owners and members with full access
                return (
                  <>
                    <span className="text-blue-600 cursor-pointer" onClick={() => setCurrentPath('')}>
                      {currentBucket}
                    </span>
                    {currentPath && (
                      <>
                        <span className="text-gray-400">/</span>
                        <span className="text-gray-600">{currentPath}</span>
                      </>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {!hasOrganization && hasPermission('invite') && (
              <Button variant="outline" size="sm" onClick={() => setShowCreateOrg(true)}>
                <Building className="h-4 w-4 mr-2" />
                Create Organization
              </Button>
            )}
            {hasOrganization && hasPermission('invite') && (
              <Button variant="outline" size="sm" onClick={() => setShowInvite(true)}>
                <UserPlus className="h-4 w-4 mr-2" />
                Invite Member
              </Button>
            )}
            {(() => {
              const ownerData = localStorage.getItem('currentOwner');
              const memberData = localStorage.getItem('currentMember');
              const isOwner = !!ownerData && !memberData;
              return isOwner && (
                <>
                  <Button variant="outline" size="sm" onClick={handleAnalyticsClick}>
                    <BarChart3 className="h-4 w-4 mr-2" />
                    Analytics
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setShowMembers(true)}>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Members
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setShowLogs(true)}>
                    <FileText className="h-4 w-4 mr-2" />
                    Logs
                  </Button>
                </>
              );
            })()}
            <Button 
              variant="outline" 
              size="sm" 
              onClick={toggleDarkMode}
            >
              {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowPasswordModal(true)}>
              <Settings className="h-4 w-4" />
            </Button>
            {currentUser?.email && (
              <span className="text-sm text-gray-600 px-2">
                {currentUser.email}
              </span>
            )}
            <Button variant="outline" onClick={() => {
              localStorage.removeItem('currentMember');
              localStorage.removeItem('currentOwner');
              if (currentUser?.role === 'owner') {
                signOut();
              } else {
                window.location.href = '/login';
              }
            }}>
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <div className="p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Toolbar */}
          <div className="flex flex-wrap gap-4 items-center justify-between">
            <div className="flex items-center space-x-2">
              {currentPath && !debouncedSearchTerm && (
                <Button variant="outline" onClick={handleBackClick}>
                  <span className="mr-2">←</span>
                  Back
                </Button>
              )}
              {debouncedSearchTerm && (
                <Button variant="outline" onClick={() => setSearchTerm('')}>
                  <span className="mr-2">←</span>
                  Clear Search
                </Button>
              )}
              <Button onClick={handleUploadClick}>
                <Upload className="h-4 w-4 mr-2" />
                Upload
              </Button>
              {selectedFiles.length === 0 && (
                <Button 
                  variant="outline" 
                  onClick={handleNewFolderClick}
                  disabled={!hasPermission('createFolder')}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  New Folder
                </Button>
              )}
              {selectedFiles.length > 0 && (
                <>
                  <Button variant="outline" size="sm" onClick={handleDownload}>
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleShareClick}>
                    <Share className="h-4 w-4 mr-2" />
                    Share
                  </Button>
                  <Button 
                    variant="destructive" 
                    size="sm" 
                    onClick={handleDeleteClick}
                    disabled={!selectedFiles.every(fileId => {
                      const file = files.find(f => f.id === fileId);
                      return file && hasPermission('delete', file);
                    })}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </Button>
                </>
              )}
            </div>
            
            <div className="flex items-center space-x-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search files..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 w-64"
                />
              </div>
              <select 
                value={filterType} 
                onChange={(e) => setFilterType(e.target.value)}
                className="px-3 py-1 border rounded text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
              >
                <option value="all">All Files</option>
                <option value="folders">Folders</option>
                <option value="images">Images</option>
                <option value="documents">Documents</option>
                <option value="videos">Videos</option>
              </select>
              <select 
                value={sortBy} 
                onChange={(e) => setSortBy(e.target.value)}
                className="px-3 py-1 border rounded text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
              >
                <option value="name">Sort by Name</option>
                <option value="date">Sort by Date</option>
                <option value="size">Sort by Size</option>
              </select>
              <div className="flex border rounded">
                <Button
                  variant={viewMode === 'list' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('list')}
                >
                  <List className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === 'grid' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('grid')}
                >
                  <Grid className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* File List */}
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardContent className="p-0">
              {viewMode === 'list' ? (
                <Table className="dark:text-gray-200">
                  <TableHeader className="dark:border-gray-700">
                    <TableRow className="dark:border-gray-700">
                      <TableHead className="w-12 dark:text-gray-300">
                        <input
                          type="checkbox"
                          checked={selectedFiles.length > 0 && selectedFiles.length === files.length}
                          onChange={handleSelectAll}
                        />
                      </TableHead>
                      <TableHead className="dark:text-gray-300">Name</TableHead>
                      <TableHead className="dark:text-gray-300">Size</TableHead>
                      <TableHead className="dark:text-gray-300">Modified</TableHead>
                      <TableHead className="dark:text-gray-300">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredFiles.map((file) => {
                      console.log(`Rendering file ${file.name}: isOwned=${file.isOwned}, hasRenamePermission=${hasPermission('rename', file)}`);
                      return (
                        <TableRow key={file.id} className="dark:border-gray-700 dark:hover:bg-gray-700">
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={selectedFiles.includes(file.id)}
                            onChange={() => handleFileSelect(file.id)}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            {getFileIcon(file.type, file.fileType)}
                            <div>
                              <span 
                                className={file.type === 'folder' ? 'cursor-pointer hover:text-blue-600' : ''}
                                onClick={() => file.type === 'folder' && handleFolderClick(file.name, file.id)}
                              >
                                {file.name}
                              </span>
                              {debouncedSearchTerm && file.folderPath && (
                                <div className="text-xs text-gray-500">
                                  📁 {file.folderPath}
                                </div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{file.size || '-'}</TableCell>
                        <TableCell>{file.modified}</TableCell>
                        <TableCell>
                          <div className="flex space-x-1">
                            {file.type === 'file' && hasPermission('preview', file) && (
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => handlePreviewFile(file)}
                                title="Preview"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            )}
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => handleDownloadSingle(file)}
                              disabled={!hasPermission('download')}
                              title="Download"
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => handleShareSingle(file)}
                              disabled={!hasPermission('share')}
                              title="Share"
                            >
                              <Share className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => handleRename(file)}
                              disabled={!hasPermission('rename', file)}
                              title="Rename"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => {
                                console.log('Single delete clicked for:', file.name);
                                handleDeleteSingle(file);
                              }}
                              disabled={!hasPermission('delete', file)}
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                        </TableRow>
                      );
                    })}
                    {filteredFiles.length === 0 && !isLoadingAllFiles && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-gray-500 py-8">
                          {debouncedSearchTerm ? 'No files found' : 
                           (() => {
                             // Check current permissions from localStorage
                             const memberData = localStorage.getItem('currentMember');
                             if (memberData) {
                               const member = JSON.parse(memberData);
                               const perms = JSON.parse(member.permissions || '{}');
                               if (perms.uploadViewOwn && !perms.uploadViewAll && !perms.viewOnly && !perms.viewDownload) {
                                 return 'You can view only files you uploaded';
                               }
                             }
                             return 'This folder is empty';
                           })()
                          }
                        </TableCell>
                      </TableRow>
                    )}
                    {isLoadingAllFiles && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-gray-500 py-8">
                          Searching...
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 p-4">
                  {filteredFiles.map((file) => (
                    <Card key={file.id} className="cursor-pointer hover:shadow-md">
                      <CardContent className="p-4 text-center">
                        <div className="mb-2">
                          {getFileIcon(file.type, file.fileType)}
                        </div>
                        <p className="text-sm truncate">{file.name}</p>
                        <p className="text-xs text-gray-500">{file.size}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Upload Dialog */}
      <Dialog open={showUpload} onOpenChange={setShowUpload}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Files</DialogTitle>
          </DialogHeader>
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
            <Upload className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <p className="text-lg mb-2">Drag and drop files here</p>
            <p className="text-gray-500 mb-4">or</p>
            <input 
              type="file" 
              multiple 
              onChange={handleFileUpload}
              className="hidden" 
              id="file-upload"
            />
            <Button onClick={() => document.getElementById('file-upload')?.click()}>
              Choose Files
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUpload(false)}>
              Cancel
            </Button>
            <Button disabled={isUploading}>
              {isUploading ? 'Uploading...' : 'Upload'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Folder Dialog */}
      <Dialog open={showNewFolder} onOpenChange={setShowNewFolder}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Folder</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Folder name"
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewFolder(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateFolder} disabled={!folderName.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share Modal */}
      <Dialog open={showShareModal} onOpenChange={(open) => {
        setShowShareModal(open);
        if (!open) setShareLink('');
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share Files</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Link Expiry Time</Label>
              <select 
                value={shareExpiry} 
                onChange={(e) => setShareExpiry(e.target.value)}
                className="w-full px-3 py-2 border rounded"
              >
                <option value="1">1 Hour</option>
                <option value="24">1 Day</option>
                <option value="168">7 Days</option>
                <option value="720">30 Days</option>
              </select>
            </div>
            
            {shareLink && (
              <div className="space-y-2">
                <Label>Share Link</Label>
                <div className="flex space-x-2">
                  <Input value={shareLink} readOnly className="flex-1" />
                  <Button onClick={copyToClipboard}>Copy</Button>
                </div>
                <p className="text-sm text-gray-500">
                  Expires in {shareExpiry} hour{shareExpiry !== '1' ? 's' : ''}
                </p>
                <p className="text-xs text-gray-400">
                  Direct download link - accessible from any machine
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowShareModal(false)}>
              Close
            </Button>
            {!shareLink && (
              <Button 
                onClick={handleGenerateShareLink}
                disabled={isGeneratingLink}
              >
                {isGeneratingLink ? 'Generating...' : 'Generate Link'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Organization Dialog */}
      <Dialog open={showCreateOrg} onOpenChange={setShowCreateOrg}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Organization</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Organization Name</Label>
              <Input
                placeholder="Enter organization name"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
              />
            </div>
            <p className="text-sm text-gray-500">
              Creating an organization will allow you to invite team members to collaborate on this bucket.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateOrg(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateOrganization} disabled={!orgName.trim()}>
              Create Organization
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invite Member Dialog */}
      <Dialog open={showInvite} onOpenChange={setShowInvite}>
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
            
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-base font-medium">Permissions</Label>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleShowCopyPermissions}
                  className="w-full"
                >
                  Copy Permissions from Existing Member
                </Button>
              </div>
              
              {/* View and Upload side by side */}
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <Label className="text-sm font-medium">View Access (Base Layer)</Label>
                  <div className="mt-1 space-y-1">
                    <label className="flex items-center space-x-2">
                      <input
                        type="radio"
                        name="view"
                        value="none"
                        checked={invitePermissions.view === 'none'}
                        onChange={(e) => setInvitePermissions(prev => ({
                          ...prev, 
                          view: e.target.value,
                          download: false,
                          share: false
                        }))}
                      />
                      <span className="text-sm">No View</span>
                    </label>
                    <label className="flex items-center space-x-2">
                      <input
                        type="radio"
                        name="view"
                        value="own"
                        checked={invitePermissions.view === 'own'}
                        disabled={!canGrantPermission('view', 'own')}
                        onChange={(e) => setInvitePermissions(prev => ({...prev, view: e.target.value}))}
                      />
                      <span className={`text-sm ${!canGrantPermission('view', 'own') ? 'text-gray-400' : ''}`}>
                        View Own Files
                      </span>
                    </label>
                    <label className="flex items-center space-x-2">
                      <input
                        type="radio"
                        name="view"
                        value="all"
                        checked={invitePermissions.view === 'all'}
                        disabled={!canGrantPermission('view', 'all')}
                        onChange={(e) => setInvitePermissions(prev => ({...prev, view: e.target.value}))}
                      />
                      <span className={`text-sm ${!canGrantPermission('view', 'all') ? 'text-gray-400' : ''}`}>
                        View All Files
                      </span>
                    </label>
                  </div>
                </div>
                
                <div>
                  <Label className="text-sm font-medium">Upload Access</Label>
                  <div className="mt-1 space-y-1">
                    <label className="flex items-center space-x-2">
                      <input
                        type="radio"
                        name="upload"
                        value="none"
                        checked={invitePermissions.upload === 'none'}
                        onChange={(e) => setInvitePermissions(prev => ({
                          ...prev, 
                          upload: e.target.value,
                          create_folder: false
                        }))}
                      />
                      <span className="text-sm">No Upload</span>
                    </label>
                    <label className="flex items-center space-x-2">
                      <input
                        type="radio"
                        name="upload"
                        value="own"
                        checked={invitePermissions.upload === 'own'}
                        disabled={!canGrantPermission('upload', 'own')}
                        onChange={(e) => setInvitePermissions(prev => ({...prev, upload: e.target.value}))}
                      />
                      <span className={`text-sm ${!canGrantPermission('upload', 'own') ? 'text-gray-400' : ''}`}>
                        Upload + Manage Own
                      </span>
                    </label>
                    <label className="flex items-center space-x-2">
                      <input
                        type="radio"
                        name="upload"
                        value="all"
                        checked={invitePermissions.upload === 'all'}
                        disabled={!canGrantPermission('upload', 'all')}
                        onChange={(e) => setInvitePermissions(prev => ({...prev, upload: e.target.value}))}
                      />
                      <span className={`text-sm ${!canGrantPermission('upload', 'all') ? 'text-gray-400' : ''}`}>
                        Upload + Manage All
                      </span>
                    </label>
                  </div>
                </div>
              </div>
              
              {/* Extra Permissions */}
              <div>
                <Label className="text-sm font-medium">Extra Permissions</Label>
                <div className="mt-1 space-y-1">
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={invitePermissions.download}
                      disabled={invitePermissions.view === 'none' || !canGrantPermission('download')}
                      onChange={(e) => setInvitePermissions(prev => ({...prev, download: e.target.checked}))}
                    />
                    <span className={`text-sm ${invitePermissions.view === 'none' || !canGrantPermission('download') ? 'text-gray-400' : ''}`}>
                      Download Files
                    </span>
                  </label>
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={invitePermissions.share}
                      disabled={invitePermissions.view === 'none' || !canGrantPermission('share')}
                      onChange={(e) => setInvitePermissions(prev => ({...prev, share: e.target.checked}))}
                    />
                    <span className={`text-sm ${invitePermissions.view === 'none' || !canGrantPermission('share') ? 'text-gray-400' : ''}`}>
                      Generate Share Links
                    </span>
                  </label>
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={invitePermissions.create_folder}
                      disabled={invitePermissions.upload === 'none' || !canGrantPermission('create_folder')}
                      onChange={(e) => setInvitePermissions(prev => ({...prev, create_folder: e.target.checked}))}
                    />
                    <span className={`text-sm ${invitePermissions.upload === 'none' || !canGrantPermission('create_folder') ? 'text-gray-400' : ''}`}>
                      Create Folders
                    </span>
                  </label>
                </div>
              </div>
              
              {/* Invite Members in bottom center */}
              <div className="flex justify-center pt-2">
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={invitePermissions.invite_members}
                    disabled={!canGrantPermission('invite_members')}
                    onChange={(e) => setInvitePermissions(prev => ({...prev, invite_members: e.target.checked}))}
                  />
                  <span className={`text-sm font-bold ${!canGrantPermission('invite_members') ? 'text-gray-400' : ''}`}>
                    Invite Members
                  </span>
                </label>
              </div>
            </div>
            
            <div className="space-y-3">
              <Label className="text-base font-medium">Access Scope</Label>
              <div className="space-y-2">
                <label className="flex items-center space-x-2">
                  <input
                    type="radio"
                    name="scope"
                    value="entire"
                    checked={scopeType === 'entire'}
                    disabled={!canGrantScope('entire')}
                    onChange={(e) => setScopeType(e.target.value)}
                  />
                  <span className={`text-sm ${!canGrantScope('entire') ? 'text-gray-400' : ''}`}>
                    Entire Bucket
                  </span>
                </label>
                <label className="flex items-center space-x-2">
                  <input
                    type="radio"
                    name="scope"
                    value="specific"
                    checked={scopeType === 'specific'}
                    disabled={!canGrantScope('specific')}
                    onChange={(e) => setScopeType(e.target.value)}
                  />
                  <span className={`text-sm ${!canGrantScope('specific') ? 'text-gray-400' : ''}`}>
                    Specific Folder (includes all subfolders)
                  </span>
                </label>
              </div>
            </div>
            
            {scopeType === 'specific' && (
              <div className="space-y-2">
                <Label>Select Folders (Multi-select supported)</Label>
                <div className="border rounded p-3">
                  <div className="max-h-48 overflow-y-auto">
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
                    <div className="mt-3 p-2 bg-blue-50 rounded">
                      <span className="text-sm font-medium">Selected paths: </span>
                      <div className="mt-1 space-y-1">
                        {Array.from(selectedFolderPaths).map(path => (
                          <div key={path} className="text-sm text-blue-600">/{path}</div>
                        ))}
                      </div>
                      <p className="text-xs text-gray-500 mt-2">
                        Each selected folder includes all its subfolders and files
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            <p className="text-sm text-gray-500">
              An invitation email will be sent with a link to join your organization.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInvite(false)}>
              Cancel
            </Button>
            <Button onClick={handleSendInvite} disabled={!inviteEmail.trim()}>
              Send Invitation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Copy Permissions Modal */}
      <Dialog open={showCopyPermissions} onOpenChange={setShowCopyPermissions}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy Permissions from Member</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Select Member to Copy From</Label>
              <div className="max-h-48 overflow-y-auto border rounded p-2">
                {availableMembers.length > 0 ? (
                  availableMembers.map(member => (
                    <div key={member.email} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded">
                      <div>
                        <div className="text-sm font-medium">{member.email}</div>
                        <div className="text-xs text-gray-500">
                          {member.scope_type === 'entire' ? 'Entire Bucket' : 
                           member.scope_type === 'specific' ? 'Specific Folders' : 'Limited Access'}
                        </div>
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleCopyPermissions(member.email)}
                      >
                        Copy
                      </Button>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8">
                    <p className="text-sm text-gray-500">Loading members...</p>
                  </div>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCopyPermissions(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Members Modal */}
      <Dialog open={showMembers} onOpenChange={(open) => {
        setShowMembers(open);
        if (open) loadAllMembers();
      }}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bucket Members</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {allMembers.length > 0 ? (
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
                  {allMembers.map((member, index) => (
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
                        {(() => {
                          const ownerData = localStorage.getItem('currentOwner');
                          const ownerEmail = ownerData ? JSON.parse(ownerData).email : currentUser?.email;
                          
                          if (!member.invited_by || member.invited_by === ownerEmail) {
                            return 'Owner';
                          }
                          return member.invited_by;
                        })()}
                      </TableCell>
                      <TableCell>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleEditMember(member)}
                        >
                          Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-500">No members found in this bucket.</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMembers(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Member Permissions Modal */}
      <Dialog open={showEditPermissions} onOpenChange={setShowEditPermissions}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Member Permissions - {editingMember?.email}</DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            <div className="space-y-2">
              <Label className="text-base font-medium">Permissions</Label>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleShowCopyPermissions}
                className="w-full"
              >
                Copy Permissions from Existing Member
              </Button>
            </div>
            
            {/* Same permission structure as invite modal */}
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
            
            {/* Extra Permissions */}
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
            
            {/* Access Scope */}
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
                <Label>Select Folders</Label>
                <div className="border rounded p-3">
                  <div className="max-h-48 overflow-y-auto">
                    {Object.keys(folderTree).length > 0 ? (
                      <FolderTreeNode 
                        tree={folderTree}
                        level={0}
                        expandedFolders={expandedFolders}
                        selectedFolderPaths={new Set(editSelectedFolders)}
                        onToggleExpansion={toggleFolderExpansion}
                        onFolderSelect={(folderPath, isSelected) => {
                          if (isSelected) {
                            setEditSelectedFolders(prev => [...prev, folderPath]);
                          } else {
                            setEditSelectedFolders(prev => prev.filter(f => f !== folderPath));
                          }
                        }}
                        isChildOfSelected={isChildOfSelected}
                      />
                    ) : (
                      <p className="text-sm text-gray-500">No folders found</p>
                    )}
                  </div>
                  
                  {editSelectedFolders.length > 0 && (
                    <div className="mt-3 p-2 bg-blue-50 rounded">
                      <span className="text-sm font-medium">Selected paths: </span>
                      <div className="mt-1 space-y-1">
                        {editSelectedFolders.map(path => (
                          <div key={path} className="text-sm text-blue-600">/{path}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditPermissions(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => handleRemoveMember(editingMember)}
            >
              Remove Member
            </Button>
            <Button onClick={handleUpdateMemberPermissions}>
              Update Permissions
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Activity Logs Modal */}
      <Dialog open={showLogs} onOpenChange={setShowLogs}>
        <DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Activity Logs</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {activityLogs.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Resource</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activityLogs.map((log, index) => (
                    <TableRow key={index}>
                      <TableCell className="text-sm">
                        {new Date(log.timestamp).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        {(() => {
                          const ownerData = localStorage.getItem('currentOwner');
                          const ownerEmail = ownerData ? JSON.parse(ownerData).email : currentUser?.email;
                          
                          if (log.user_email === ownerEmail || log.user_email === 'owner') {
                            return 'owner';
                          }
                          return log.user_email;
                        })()}
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatAction(log.action)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {log.resource_path}
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatDetails(log.action, log.old_name, log.details)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-500">No activity logs found.</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLogs(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Password Change Modal */}
      <Dialog open={showPasswordModal} onOpenChange={setShowPasswordModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Current Password</Label>
              <Input
                type="password"
                placeholder="Enter current password"
                value={passwordData.currentPassword}
                onChange={(e) => setPasswordData(prev => ({...prev, currentPassword: e.target.value}))}
              />
            </div>
            <div className="space-y-2">
              <Label>New Password</Label>
              <Input
                type="password"
                placeholder="Enter new password (min 6 characters)"
                value={passwordData.newPassword}
                onChange={(e) => setPasswordData(prev => ({...prev, newPassword: e.target.value}))}
              />
            </div>
            <div className="space-y-2">
              <Label>Confirm New Password</Label>
              <Input
                type="password"
                placeholder="Confirm new password"
                value={passwordData.confirmPassword}
                onChange={(e) => setPasswordData(prev => ({...prev, confirmPassword: e.target.value}))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowPasswordModal(false);
              setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
            }}>
              Cancel
            </Button>
            <Button onClick={handlePasswordChange}>
              Change Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modern Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmConfig.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">{confirmConfig.message}</p>
            {confirmConfig.requiresTyping && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Type "delete" to confirm:</p>
                <Input
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="delete"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>
              Cancel
            </Button>
            <Button 
              variant={confirmConfig.type === 'danger' ? 'destructive' : 'default'}
              onClick={() => {
                setShowConfirmDialog(false);
                confirmConfig.onConfirm();
              }}
              disabled={confirmConfig.requiresTyping && deleteConfirmText !== 'delete'}
            >
              {confirmConfig.confirmText === 'delete' ? 'Delete' : confirmConfig.confirmText}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modern Prompt Dialog */}
      <Dialog open={showPromptDialog} onOpenChange={setShowPromptDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{promptConfig.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">{promptConfig.message}</p>
            <Input
              value={promptValue}
              onChange={(e) => setPromptValue(e.target.value)}
              placeholder="Enter new name"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPromptDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => {
                setShowPromptDialog(false);
                promptConfig.onConfirm(promptValue);
              }}
              disabled={!promptValue.trim()}
            >
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Analytics Modal */}
      <Dialog open={showAnalytics} onOpenChange={setShowAnalytics}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bucket Analytics - {currentBucket}</DialogTitle>
          </DialogHeader>
          
          {loadingAnalytics ? (
            <div className="flex justify-center py-8">
              <div className="text-gray-500">Loading analytics...</div>
            </div>
          ) : analytics ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Storage</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{analytics.totalSize}</div>
                    <p className="text-xs text-gray-500">{analytics.totalFiles} files • {analytics.totalFolders || 0} folders</p>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Team</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{analytics.totalMembers || 0}</div>
                    <p className="text-xs text-gray-500">Members • {analytics.totalShares || 0} shares</p>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Activity</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{analytics.activeUsers}</div>
                    <p className="text-xs text-gray-500">Active users (30d)</p>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Recent Uploads</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{analytics.recentUploads}</div>
                    <p className="text-xs text-gray-500">This week</p>
                  </CardContent>
                </Card>
              </div>
              
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Folder Analysis</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {analytics.topFolders && analytics.topFolders.length > 0 ? (
                      analytics.topFolders.map((folder: any, index: number) => (
                        <div key={index} className="flex justify-between items-center">
                          <span className="text-sm truncate" title={folder.name}>{folder.name || 'Root'}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-500">{folder.size}</span>
                            <span className="text-xs text-gray-400">({folder.files})</span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-gray-500">No folders found</p>
                    )}
                  </div>
                </CardContent>
              </Card>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">File Types</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {analytics.fileTypes && analytics.fileTypes.length > 0 ? (
                        analytics.fileTypes.slice(0, 6).map((type: any, index: number) => (
                          <div key={index} className="flex justify-between items-center">
                            <span className="text-sm font-medium">{type.extension.toUpperCase()}</span>
                            <div className="flex items-center gap-2">
                              <div className="w-16 bg-gray-200 rounded-full h-2">
                                <div 
                                  className="bg-blue-600 h-2 rounded-full" 
                                  style={{ width: `${Math.min((type.count / (analytics.totalFiles || 1)) * 100, 100)}%` }}
                                ></div>
                              </div>
                              <span className="text-sm text-gray-500 w-6 text-right">{type.count}</span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-gray-500">No file types found</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Top Contributors</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {analytics.topUploaders && analytics.topUploaders.length > 0 ? (
                        analytics.topUploaders.map((uploader: any, index: number) => (
                          <div key={index} className="flex justify-between items-center">
                            <span className="text-sm truncate">{uploader.email}</span>
                            <span className="text-sm text-gray-500">{uploader.files} files</span>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-gray-500">No contributors found</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <BarChart3 className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>No analytics data available</p>
              <p className="text-sm mt-2">Upload some files to see analytics</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Footer */}
      <footer className="bg-white dark:bg-gray-800 border-t dark:border-gray-700 mt-auto transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center text-sm text-gray-500 dark:text-gray-400">
            <div>
              <span>&copy; 2025 ShipFile. All rights reserved.</span>
            </div>
            <div className="flex space-x-6">
              <a href="landing.html" className="hover:text-gray-700">Home</a>
              <a href="docs.html" className="hover:text-gray-700">Documentation</a>
              <a href="about.html" className="hover:text-gray-700">About</a>
              <a href="contact.html" className="hover:text-gray-700">Contact</a>
            </div>
          </div>
        </div>
      </footer>
      <Toaster />
    </div>
  );
}