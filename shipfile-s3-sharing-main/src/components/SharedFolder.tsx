import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  Download, Folder, File, Image, FileText, Archive, Music, Video, ArrowLeft
} from "lucide-react";

interface FileItem {
  name: string;
  type: 'folder' | 'file';
  key: string;
  size?: string;
  modified: string;
  fileType?: string;
}

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

export default function SharedFolder() {
  const { shareId } = useParams<{ shareId: string }>();
  const [folderData, setFolderData] = useState<any>(null);
  const [currentPath, setCurrentPath] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  console.log('SharedFolder component loaded with shareId:', shareId);

  const loadFolderContents = async (path = '') => {
    try {
      setLoading(true);
      setError('');
      
      console.log('Loading shared folder:', shareId, 'path:', path);
      const url = `http://localhost:3001/api/shared-folder/${shareId}?path=${encodeURIComponent(path)}`;
      console.log('Request URL:', url);
      
      const response = await fetch(url);
      console.log('Response status:', response.status);
      
      const data = await response.json();
      console.log('Response data:', data);

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load folder');
      }

      setFolderData(data);
      setCurrentPath(path);
    } catch (error) {
      console.error('SharedFolder error:', error);
      setError(error instanceof Error ? error.message : 'Failed to load folder');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    console.log('SharedFolder mounted with shareId:', shareId);
    if (shareId) {
      loadFolderContents();
    } else {
      setError('Invalid share link');
      setLoading(false);
    }
  }, [shareId]);

  const handleFolderClick = (folderName: string) => {
    const newPath = currentPath ? `${currentPath}/${folderName}` : folderName;
    loadFolderContents(newPath);
  };

  const handleBackClick = () => {
    const pathParts = currentPath.split('/');
    pathParts.pop();
    loadFolderContents(pathParts.join('/'));
  };

  const handleDownload = (file: FileItem) => {
    const encodedKey = encodeURIComponent(file.key);
    const downloadUrl = `http://localhost:3001/api/shared-folder/${shareId}/download/${encodedKey}`;
    window.open(downloadUrl, '_blank');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p>Loading shared folder... ShareId: {shareId}</p>
          <p className="text-sm text-gray-500 mt-2">If you see this, the route is working</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <h2 className="text-xl font-semibold text-red-600 mb-2">Access Error</h2>
            <p className="text-gray-600 mb-4">{error}</p>
            <p className="text-sm text-gray-500">The shared folder may have expired or been revoked.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-900">Shared Folder: {folderData?.folderName}</h1>
          <div className="flex items-center space-x-2 text-sm text-gray-600 mt-1">
            <span>Path:</span>
            <span className="text-blue-600">{folderData?.folderName}</span>
            {currentPath && (
              <>
                <span>/</span>
                <span>{currentPath}</span>
              </>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Expires: {new Date(folderData?.expiresAt).toLocaleString()}
          </p>
        </div>
      </header>

      <div className="p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center mb-4">
            {currentPath && (
              <Button variant="outline" onClick={handleBackClick} className="mr-4">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            )}
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Modified</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {folderData?.contents?.map((item: FileItem, index: number) => (
                    <TableRow key={index}>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          {getFileIcon(item.type, item.fileType)}
                          <span 
                            className={item.type === 'folder' ? 'cursor-pointer hover:text-blue-600' : ''}
                            onClick={() => item.type === 'folder' && handleFolderClick(item.name)}
                          >
                            {item.name}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>{item.size || '-'}</TableCell>
                      <TableCell>{item.modified}</TableCell>
                      <TableCell>
                        {item.type === 'file' && (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => handleDownload(item)}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {(!folderData?.contents || folderData.contents.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-gray-500 py-8">
                        This folder is empty
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}