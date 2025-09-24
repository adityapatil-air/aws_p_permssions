import { API_BASE_URL } from '@/config/api';
export const API_BASE_URL = import.meta.env.VITE_API_URL || '${API_BASE_URL}';

export const apiEndpoints = {
  // Bucket endpoints
  buckets: `${API_BASE_URL}/api/buckets`,
  uploadUrl: `${API_BASE_URL}/api/upload-url`,
  folders: `${API_BASE_URL}/api/folders`,
  download: `${API_BASE_URL}/api/download`,
  share: `${API_BASE_URL}/api/share`,
  delete: `${API_BASE_URL}/api/delete`,
  rename: `${API_BASE_URL}/api/rename`,
  
  // Organization endpoints
  organizations: `${API_BASE_URL}/api/organizations`,
  invite: `${API_BASE_URL}/api/invite`,
  
  // Member endpoints
  memberLogin: `${API_BASE_URL}/api/member/login`,
  memberGoogleLogin: `${API_BASE_URL}/api/member/google-login`,
  
  // File endpoints
  preview: (bucketName: string, fileKey: string) => 
    `${API_BASE_URL}/api/preview/${bucketName}/${encodeURIComponent(fileKey)}`,
  
  // Utility function to get bucket files URL
  bucketFiles: (bucketName: string) => `${API_BASE_URL}/api/buckets/${bucketName}/files`,
  bucketInfo: (bucketName: string) => `${API_BASE_URL}/api/buckets/${bucketName}/info`,
  bucketAnalytics: (bucketName: string) => `${API_BASE_URL}/api/buckets/${bucketName}/analytics`,
  
  // File ownership
  fileOwnership: `${API_BASE_URL}/api/files/ownership`,
  
  // Members
  members: (bucketName: string) => `${API_BASE_URL}/api/buckets/${bucketName}/members`,
  memberPermissions: (email: string) => `${API_BASE_URL}/api/members/${encodeURIComponent(email)}/permissions`,
};