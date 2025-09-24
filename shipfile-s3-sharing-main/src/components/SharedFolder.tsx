import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  Download, Folder, File, Image, FileText, Archive, Music, Video, ArrowLeft, Eye
} from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { API_BASE_URL } from '@/config/api';

interface FileItem {
  name: string;
  type: 'folder' | 'file';
  key: string;
  size?: string;
  modified: string;
  fileType?: string;
  folderPath?: string;
}

const getFileIcon = (type: string, fileType?: string) => {
  if (type === 'folder') return <Folder className="h-4 w-4 text-blue-500" />;
  
  switch (fileType?.toLowerCase()) {
    case 'jpg': case 'jpeg': case 'png': case 'gif':
      return <Image className="h-4 w-4 text-green-500" />;
    case 'pdf':
      return <FileText className="h-4 w-4 text-red-500" />;
    case 'doc': case 'docx': case 'txt':
      return <FileText className="h-4 w-4 text-blue-500" />;
    case 'ppt': case 'pptx':
      return <FileText className="h-4 w-4 text-orange-500" />;
    case 'zip': case 'rar': case '7z':
      return <Archive className="h-4 w-4 text-yellow-500" />;
    case 'mp3': case 'wav': case 'flac':
      return <Music className="h-4 w-4 text-purple-500" />;
    case 'mp4': case 'avi': case 'mkv':
      return <Video className="h-4 w-4 text-green-500" />;
    default:
      return <File className="h-4 w-4 text-gray-500" />;
  }
};

export default function SharedFolder() {
  const { shareId } = useParams<{ shareId: string }>();
  const [shareData, setShareData] = useState<any>(null);
  const [currentPath, setCurrentPath] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  console.log('SharedFolder component loaded with shareId:', shareId);

  const loadSharedContent = async () => {
    try {
      setLoading(true);
      setError('');
      
      console.log('Loading shared content:', shareId);
      const url = `${API_BASE_URL}/api/shared/${shareId}`;
      console.log('Request URL:', url);
      
      const response = await fetch(url);
      console.log('Response status:', response.status);
      
      const data = await response.json();
      console.log('Response data:', data);

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load shared content');
      }

      setShareData(data);
    } catch (error) {
      console.error('SharedContent error:', error);
      setError(error instanceof Error ? error.message : 'Failed to load shared content');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    console.log('SharedFolder mounted with shareId:', shareId);
    if (shareId) {
      loadSharedContent();
    } else {
      setError('Invalid share link');
      setLoading(false);
    }
  }, [shareId]);

  // Show all files in a single group without exposing paths
  const allFiles = shareData?.files || [];

  const handleDownload = (file: FileItem) => {
    const encodedKey = encodeURIComponent(file.key);
    const downloadUrl = `${API_BASE_URL}/api/shared/${shareId}/download/${encodedKey}`;
    window.open(downloadUrl, '_blank');
  };

  const handlePreview = (file: FileItem) => {
    const fileExt = file.fileType?.toLowerCase();
    const nonPreviewableTypes = ['docx', 'doc', 'pptx', 'ppt', 'xlsx', 'xls', 'zip', 'rar', '7z', 'exe', 'msi'];
    
    if (nonPreviewableTypes.includes(fileExt || '')) {
      toast({
        title: "Preview Not Available",
        description: `${file.name} cannot be previewed in browser. Please download to view.`,
        variant: "destructive",
      });
      return;
    }
    
    const encodedKey = encodeURIComponent(file.key);
    const previewUrl = `${API_BASE_URL}/api/shared/${shareId}/preview/${encodedKey}`;
    window.open(previewUrl, '_blank');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p>Loading shared content... ShareId: {shareId}</p>
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
          <h1 className="text-2xl font-bold text-gray-900">📁 Shared Files</h1>
          <p className="text-sm text-gray-600 mt-1">
            {shareData?.files?.length || 0} files shared with you
          </p>
          <p className="text-xs text-gray-500 mt-1">
            ⏰ Expires: {shareData?.expiresAt ? new Date(shareData.expiresAt).toLocaleString() : 'N/A'}
          </p>
        </div>
      </header>

      <div className="p-6">
        <div className="max-w-7xl mx-auto space-y-6">
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
                  {allFiles.map((file: FileItem, index: number) => (
                    <TableRow key={index}>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          {getFileIcon(file.type, file.fileType)}
                          <span>{file.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>{file.size || '-'}</TableCell>
                      <TableCell>
                        <div className="flex space-x-2">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => handlePreview(file)}
                            className="hover:bg-green-50 hover:text-green-600"
                            title="Preview"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => handleDownload(file)}
                            className="hover:bg-blue-50 hover:text-blue-600"
                            title="Download"
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          
          {allFiles.length === 0 && (
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-gray-500">No files found in this share.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}