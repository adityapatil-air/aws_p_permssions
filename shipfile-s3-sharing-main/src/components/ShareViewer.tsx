import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { 
  Download, Eye, Folder, File, Image, FileText, 
  Archive, Music, Video, ArrowLeft
} from 'lucide-react';

interface ShareFile {
  name: string;
  type: 'file' | 'folder';
  path: string;
  size?: number;
  modified?: string;
}

interface ShareData {
  bucketName: string;
  items: any[];
  permissions: string;
  expiresAt?: string;
}

const getFileIcon = (fileName: string) => {
  const ext = fileName.split('.').pop()?.toLowerCase();
  
  switch (ext) {
    case 'jpg': case 'jpeg': case 'png': case 'gif': case 'webp':
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

export default function ShareViewer() {
  const { shareId } = useParams<{ shareId: string }>();
  const [shareData, setShareData] = useState<ShareData | null>(null);
  const [files, setFiles] = useState<ShareFile[]>([]);
  const [currentPath, setCurrentPath] = useState('');
  const [previewFile, setPreviewFile] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadShareData();
  }, [shareId]);

  useEffect(() => {
    if (shareData) {
      loadFiles();
    }
  }, [shareData, currentPath]);

  const loadShareData = async () => {
    try {
      const response = await fetch(`http://localhost:3001/api/share/${shareId}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error);
      }
      const data = await response.json();
      setShareData(data);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to load share');
    } finally {
      setLoading(false);
    }
  };

  const loadFiles = async () => {
    try {
      const response = await fetch(`http://localhost:3001/api/share/${shareId}/list?prefix=${currentPath}`);
      const data = await response.json();
      setFiles(data.files || []);
    } catch (error) {
      console.error('Failed to load files:', error);
    }
  };

  const handleFolderClick = (folderPath: string) => {
    setCurrentPath(folderPath);
  };

  const handleFilePreview = (filePath: string) => {
    setPreviewFile(filePath);
  };

  const handleDownload = (filePath: string, fileName: string) => {
    const downloadUrl = `http://localhost:3001/api/share/${shareId}/file/${filePath}`;
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = fileName;
    a.click();
  };

  const handleBack = () => {
    const pathParts = currentPath.split('/').filter(p => p);
    pathParts.pop();
    setCurrentPath(pathParts.join('/'));
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p>Loading shared content...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-red-600">Access Denied</CardTitle>
          </CardHeader>
          <CardContent>
            <p>{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h1 className="text-2xl font-bold">ShipFile Share</h1>
            <Badge variant="outline">
              {shareData?.permissions === 'view-only' ? 'View Only' : 'View + Download'}
            </Badge>
            {shareData?.expiresAt && (
              <Badge variant="secondary">
                Expires: {new Date(shareData.expiresAt).toLocaleDateString()}
              </Badge>
            )}
          </div>
        </div>
      </header>

      <div className="p-6">
        <div className="max-w-6xl mx-auto">
          {/* Breadcrumb */}
          <div className="flex items-center space-x-2 mb-6">
            {currentPath && (
              <Button variant="ghost" size="sm" onClick={handleBack}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            )}
            <div className="text-sm text-gray-600">
              <span>Shared Files</span>
              {currentPath && <span> / {currentPath}</span>}
            </div>
          </div>

          {/* File List */}
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {files.map((file, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          {file.type === 'folder' ? (
                            <Folder className="h-4 w-4 text-blue-500" />
                          ) : (
                            getFileIcon(file.name)
                          )}
                          <span 
                            className={file.type === 'folder' ? 'cursor-pointer hover:text-blue-600' : ''}
                            onClick={() => file.type === 'folder' && handleFolderClick(file.path)}
                          >
                            {file.name}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {file.size ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex space-x-2">
                          {file.type === 'file' && (
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => handleFilePreview(file.path)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          )}
                          {shareData?.permissions === 'view-download' && (
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => handleDownload(file.path, file.name)}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* File Preview */}
          {previewFile && (
            <Card className="mt-6">
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>Preview: {previewFile.split('/').pop()}</CardTitle>
                  <Button variant="outline" onClick={() => setPreviewFile(null)}>
                    Close
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="border rounded p-4 bg-white">
                  <iframe
                    src={`http://localhost:3001/api/share/${shareId}/file/${previewFile}`}
                    className="w-full h-96"
                    title="File Preview"
                  />
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}