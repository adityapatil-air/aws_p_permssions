import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { 
  Upload, Download, Trash2, Eye, Share, Folder, 
  File, Image, FileText, Archive, Music, Video,
  Search, Filter, Grid, List, Plus, Settings, UserPlus, Building
} from "lucide-react";
import { useClerk } from "@clerk/clerk-react";
import React from "react";

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
    case 'pdf': case 'doc': case 'docx': case 'txt':
      return <FileText className="h-4 w-4 text-red-500" />;
    case 'zip': case 'rar': case '7z':
      return <Archive className="h-4 w-4 text-yellow-500" />;
    case 'mp3': case 'wav': case 'flac':
      return <Music className="h-4 w-4 text-purple-500" />;
    case 'mp4': case 'avi': case 'mkv':
      return <Video className="h-4 w-4 text-orange-500" />;
    default:
      return <File className="h-4 w-4 text-gray-500" />;
  }
};

export default function FileManager() {
  const { signOut } = useClerk();
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
  });
  const [scopeType, setScopeType] = useState('entire');
  const [availableFolders, setAvailableFolders] = useState([]);
  const [selectedFolders, setSelectedFolders] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [userPermissions, setUserPermissions] = useState(null);

  const currentBucket = new URLSearchParams(window.location.search).get('bucket') || 'My Bucket';

  const filteredFiles = files
    .filter(file => {
      const matchesSearch = file.name.toLowerCase().includes(searchTerm.toLowerCase());
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
        const response = await fetch('http://localhost:3001/api/upload-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bucketName: currentBucket,
            fileName: file.name,
            fileType: file.type,
            folderPath: currentPath,
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

        console.log(`Uploaded ${file.name} successfully`);
      } catch (error) {
        console.error(`Failed to upload ${file.name}:`, error);
        alert(`Failed to upload ${file.name}`);
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
      const response = await fetch('http://localhost:3001/api/folders', {
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
    } catch (error) {
      console.error('Failed to create folder:', error);
      alert('Failed to create folder');
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
      
      const url = `http://localhost:3001/api/buckets/${currentBucket}/files${params.toString() ? '?' + params.toString() : ''}`;
      console.log('=== DEBUG INFO ===');
      console.log('currentUser state:', currentUser);
      console.log('localStorage currentMember:', localStorage.getItem('currentMember'));
      console.log('localStorage currentOwner:', localStorage.getItem('currentOwner'));
      console.log('Final userEmail being sent:', userEmail);
      console.log('Loading files from:', url);
      const response = await fetch(url);
      const data = await response.json();
      console.log('Files loaded:', data);
      setFiles(data);
    } catch (error) {
      console.error('Failed to load files:', error);
    }
  };
  
  const checkOrganization = async () => {
    try {
      const response = await fetch(`http://localhost:3001/api/organizations/${currentBucket}`);
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
      const response = await fetch('http://localhost:3001/api/organizations', {
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
      alert('Organization created successfully!');
    } catch (error) {
      console.error('Failed to create organization:', error);
      alert('Failed to create organization');
    }
  };
  
  const loadFolders = async () => {
    try {
      const ownerData = localStorage.getItem('currentOwner');
      const memberData = localStorage.getItem('currentMember');
      
      if (ownerData) {
        // Owner can see all folders
        const owner = JSON.parse(ownerData);
        const response = await fetch(`http://localhost:3001/api/buckets/${currentBucket}/folders?ownerEmail=${encodeURIComponent(owner.email)}`);
        const folders = await response.json();
        setAvailableFolders(folders);
      } else if (memberData) {
        // Member can only see their accessible folders
        try {
          const member = JSON.parse(memberData);
          console.log('Member data:', member);
          
          if (member.scopeType === 'specific' || member.scopeType === 'nested') {
            let accessibleFolders = [];
            
            // Handle different data formats
            if (typeof member.scopeFolders === 'string') {
              accessibleFolders = JSON.parse(member.scopeFolders);
            } else if (Array.isArray(member.scopeFolders)) {
              accessibleFolders = member.scopeFolders;
            }
            
            console.log('Accessible folders:', accessibleFolders);
            setAvailableFolders(accessibleFolders || []);
          } else {
            setAvailableFolders([]);
          }
        } catch (error) {
          console.error('Error parsing member data:', error);
          setAvailableFolders([]);
        }
      } else {
        setAvailableFolders([]);
      }
    } catch (error) {
      console.error('Failed to load folders:', error);
    }
  };

  const handleSendInvite = async () => {
    if (!inviteEmail.trim()) return;
    
    try {
      const response = await fetch('http://localhost:3001/api/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bucketName: currentBucket,
          email: inviteEmail.trim(),
          permissions: invitePermissions,
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
      });
      setScopeType('entire');
      setSelectedFolders([]);
      alert(`Invitation email sent successfully to ${inviteEmail}!`);
    } catch (error) {
      console.error('Failed to send invitation:', error);
      alert(error.message || 'Failed to send invitation');
    }
  };
  


  const handleFolderClick = (folderName: string) => {
    const newPath = currentPath ? `${currentPath}/${folderName}` : folderName;
    setCurrentPath(newPath);
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
      
      const response = await fetch('http://localhost:3001/api/download', {
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
      alert('Download failed');
    }
  };

  const handleDelete = async () => {
    if (selectedFiles.length === 0) return;
    
    if (!confirm(`Delete ${selectedFiles.length} item(s)?`)) return;
    
    try {
      const response = await fetch('http://localhost:3001/api/delete', {
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
      loadFiles();
      
    } catch (error) {
      console.error('Delete failed:', error);
      alert('Delete failed');
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
      
      const response = await fetch('http://localhost:3001/api/share', {
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
      alert('Failed to generate share link');
    } finally {
      setIsGeneratingLink(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(shareLink);
    alert('Link copied to clipboard!');
  };

  const hasPermission = (action) => {
    if (currentUser?.role === 'owner') return true;
    if (!userPermissions) return false;
    
    switch (action) {
      case 'upload':
        return userPermissions.uploadOnly || userPermissions.uploadViewOwn || userPermissions.uploadViewAll;
      case 'download':
        return userPermissions.viewDownload || userPermissions.uploadViewAll;
      case 'delete':
        return userPermissions.deleteFiles;
      case 'share':
        return userPermissions.generateLinks;
      case 'createFolder':
        return userPermissions.createFolder;
      case 'invite':
        return userPermissions.inviteMembers;
      default:
        return false;
    }
  };

  const handleUploadClick = () => {
    if (!hasPermission('upload')) {
      alert('You do not have permission to perform UPLOAD on this bucket. Please contact the owner for access.');
      return;
    }
    setShowUpload(true);
  };

  const handleShareClick = () => {
    if (!hasPermission('share')) {
      alert('You do not have permission to perform SHARE on this bucket. Please contact the owner for access.');
      return;
    }
    setShowShareModal(true);
  };

  const handleDeleteClick = () => {
    if (!hasPermission('delete')) {
      alert('You do not have permission to perform DELETE on this bucket. Please contact the owner for access.');
      return;
    }
    handleDelete();
  };

  const handleNewFolderClick = () => {
    if (!hasPermission('createFolder')) {
      alert('You do not have permission to perform CREATE FOLDER on this bucket. Please contact the owner for access.');
      return;
    }
    setShowNewFolder(true);
  };

  // Load user data on component mount
  React.useEffect(() => {
    const memberData = localStorage.getItem('currentMember');
    const ownerData = localStorage.getItem('currentOwner');
    
    if (memberData) {
      const member = JSON.parse(memberData);
      setCurrentUser({ email: member.email, role: 'member' });
      setUserPermissions(JSON.parse(member.permissions || '{}'));
    } else if (ownerData) {
      const owner = JSON.parse(ownerData);
      setCurrentUser({ email: owner.email, role: 'owner' });
      setUserPermissions(null);
    }
  }, []);
  
  // Load files when bucket or path changes
  React.useEffect(() => {
    if (currentBucket !== 'My Bucket') {
      loadFiles();
      checkOrganization();
    }
  }, [currentBucket, currentPath]);

  React.useEffect(() => {
    if (showInvite && scopeType === 'specific') {
      loadFolders();
    }
  }, [showInvite, scopeType]);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <h1 className="text-2xl font-bold">ShipFile</h1>
            <div className="flex items-center space-x-1 text-sm">
              <span className="text-blue-600 cursor-pointer" onClick={() => setCurrentPath('')}>
                {currentBucket}
              </span>
              {currentPath && (
                <>
                  <span className="text-gray-400">/</span>
                  <span className="text-gray-600">{currentPath}</span>
                </>
              )}
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
            <Button variant="outline" size="sm">
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
              {currentPath && (
                <Button variant="outline" onClick={handleBackClick}>
                  <span className="mr-2">←</span>
                  Back
                </Button>
              )}
              <Button onClick={handleUploadClick}>
                <Upload className="h-4 w-4 mr-2" />
                Upload
              </Button>
              {selectedFiles.length === 0 && (
                <Button variant="outline" onClick={handleNewFolderClick}>
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
                  <Button variant="destructive" size="sm" onClick={handleDeleteClick}>
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
                className="px-3 py-1 border rounded text-sm"
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
                className="px-3 py-1 border rounded text-sm"
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
          <Card>
            <CardContent className="p-0">
              {viewMode === 'list' ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <input
                          type="checkbox"
                          checked={selectedFiles.length > 0 && selectedFiles.length === files.length}
                          onChange={handleSelectAll}
                        />
                      </TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Modified</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredFiles.map((file) => (
                      <TableRow key={file.id}>
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
                            <span 
                              className={file.type === 'folder' ? 'cursor-pointer hover:text-blue-600' : ''}
                              onClick={() => file.type === 'folder' && handleFolderClick(file.name)}
                            >
                              {file.name}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>{file.size || '-'}</TableCell>
                        <TableCell>{file.modified}</TableCell>
                        <TableCell>
                          <div className="flex space-x-1">
                            <Button variant="ghost" size="sm">
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm">
                              <Download className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm">
                              <Share className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
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
            
            <div className="space-y-3">
              <Label className="text-base font-medium">Permissions</Label>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={invitePermissions.viewOnly}
                    onChange={(e) => setInvitePermissions(prev => ({...prev, viewOnly: e.target.checked}))}
                  />
                  <span className="text-sm">View Only</span>
                </label>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={invitePermissions.viewDownload}
                    onChange={(e) => setInvitePermissions(prev => ({...prev, viewDownload: e.target.checked}))}
                  />
                  <span className="text-sm">View + Download</span>
                </label>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={invitePermissions.uploadOnly}
                    onChange={(e) => setInvitePermissions(prev => ({...prev, uploadOnly: e.target.checked}))}
                  />
                  <span className="text-sm">Upload Only</span>
                </label>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={invitePermissions.uploadViewOwn}
                    onChange={(e) => setInvitePermissions(prev => ({...prev, uploadViewOwn: e.target.checked}))}
                  />
                  <span className="text-sm">Upload + View Own</span>
                </label>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={invitePermissions.uploadViewAll}
                    onChange={(e) => setInvitePermissions(prev => ({...prev, uploadViewAll: e.target.checked}))}
                  />
                  <span className="text-sm">Upload + View All</span>
                </label>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={invitePermissions.deleteFiles}
                    onChange={(e) => setInvitePermissions(prev => ({...prev, deleteFiles: e.target.checked}))}
                  />
                  <span className="text-sm">Delete Files/Folders</span>
                </label>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={invitePermissions.generateLinks}
                    onChange={(e) => setInvitePermissions(prev => ({...prev, generateLinks: e.target.checked}))}
                  />
                  <span className="text-sm">Generate Share Links</span>
                </label>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={invitePermissions.createFolder}
                    onChange={(e) => setInvitePermissions(prev => ({...prev, createFolder: e.target.checked}))}
                  />
                  <span className="text-sm">Create Folders</span>
                </label>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={invitePermissions.deleteOwnFiles}
                    onChange={(e) => setInvitePermissions(prev => ({...prev, deleteOwnFiles: e.target.checked}))}
                  />
                  <span className="text-sm">Delete Own Files</span>
                </label>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={invitePermissions.inviteMembers}
                    onChange={(e) => setInvitePermissions(prev => ({...prev, inviteMembers: e.target.checked}))}
                  />
                  <span className="text-sm">Invite Members</span>
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
                  <span className="text-sm">Specific Folder(s)</span>
                </label>
                <label className="flex items-center space-x-2">
                  <input
                    type="radio"
                    name="scope"
                    value="nested"
                    checked={scopeType === 'nested'}
                    onChange={(e) => setScopeType(e.target.value)}
                  />
                  <span className="text-sm">Nested Folders (with inheritance)</span>
                </label>
              </div>
            </div>
            
            {scopeType === 'specific' && (
              <div className="space-y-2">
                <Label>Select Folders</Label>
                <div className="max-h-32 overflow-y-auto border rounded p-2 space-y-1">
                  {availableFolders.map(folder => (
                    <label key={folder} className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={selectedFolders.includes(folder)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedFolders(prev => [...prev, folder]);
                          } else {
                            setSelectedFolders(prev => prev.filter(f => f !== folder));
                          }
                        }}
                      />
                      <span className="text-sm">{folder}</span>
                    </label>
                  ))}
                  {availableFolders.length === 0 && (
                    <p className="text-sm text-gray-500">No folders found in this bucket</p>
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
    </div>
  );
}