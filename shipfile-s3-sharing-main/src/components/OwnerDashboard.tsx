import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Plus, Settings, Users, BarChart3, Moon, Sun } from "lucide-react";
import { useClerk } from "@clerk/clerk-react";
import React from "react";
import { useDarkMode } from '../hooks/use-dark-mode';
import { API_BASE_URL } from '../config';

import MemberManagement from "./MemberManagement";

interface Bucket {
  id: string;
  name: string;
  region: string;
  created: string;
  userCount: number;
}

const AWS_REGIONS = [
  { value: "us-east-1", label: "US East (N. Virginia)" },
  { value: "us-east-2", label: "US East (Ohio)" },
  { value: "us-west-1", label: "US West (N. California)" },
  { value: "us-west-2", label: "US West (Oregon)" },
  { value: "ca-central-1", label: "Canada (Central)" },
  { value: "ca-west-1", label: "Canada West (Calgary)" },
  { value: "sa-east-1", label: "South America (São Paulo)" },
  { value: "eu-north-1", label: "Europe (Stockholm)" },
  { value: "eu-south-1", label: "Europe (Milan)" },
  { value: "eu-south-2", label: "Europe (Spain)" },
  { value: "eu-west-1", label: "Europe (Ireland)" },
  { value: "eu-west-2", label: "Europe (London)" },
  { value: "eu-west-3", label: "Europe (Paris)" },
  { value: "eu-central-1", label: "Europe (Frankfurt)" },
  { value: "eu-central-2", label: "Europe (Zurich)" },
  { value: "me-south-1", label: "Middle East (Bahrain)" },
  { value: "me-central-1", label: "Middle East (UAE)" },
  { value: "af-south-1", label: "Africa (Cape Town)" },
  { value: "ap-south-1", label: "Asia Pacific (Mumbai)" },
  { value: "ap-south-2", label: "Asia Pacific (Hyderabad)" },
  { value: "ap-northeast-1", label: "Asia Pacific (Tokyo)" },
  { value: "ap-northeast-2", label: "Asia Pacific (Seoul)" },
  { value: "ap-northeast-3", label: "Asia Pacific (Osaka)" },
  { value: "ap-southeast-1", label: "Asia Pacific (Singapore)" },
  { value: "ap-southeast-2", label: "Asia Pacific (Sydney)" },
  { value: "ap-southeast-3", label: "Asia Pacific (Jakarta)" },
  { value: "ap-southeast-4", label: "Asia Pacific (Melbourne)" },
  { value: "ap-east-1", label: "Asia Pacific (Hong Kong)" }
];

export default function OwnerDashboard() {
  const { signOut, user } = useClerk();
  const { isDarkMode, toggleDarkMode } = useDarkMode();

  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [showAddBucket, setShowAddBucket] = useState(false);
  const [accessKey, setAccessKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [region, setRegion] = useState("");
  const [bucketName, setBucketName] = useState("");
  const [friendlyName, setFriendlyName] = useState("");
  const [encryptKeys, setEncryptKeys] = useState(true);
  const [error, setError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [selectedBucket, setSelectedBucket] = useState<string>("");
  const [analytics, setAnalytics] = useState<any>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [showMemberManagement, setShowMemberManagement] = useState(false);
  const [selectedBucketForMembers, setSelectedBucketForMembers] = useState<string>("");


  const loadBuckets = React.useCallback(async () => {
    try {
      const ownerEmail = user?.primaryEmailAddress?.emailAddress;
      if (!ownerEmail) return;
      
      const response = await fetch(`${API_BASE_URL}/api/buckets?ownerEmail=${encodeURIComponent(ownerEmail)}`);
      const data = await response.json();
      setBuckets(data.map((bucket: any) => ({
        id: bucket.id.toString(),
        name: bucket.name,
        region: bucket.region,
        created: bucket.created,
        userCount: bucket.userCount || 0
      })));
    } catch (error) {
      console.error('Failed to load buckets:', error);
    }
  }, [user?.primaryEmailAddress?.emailAddress]);
  
  React.useEffect(() => {
    // Save owner email to localStorage when user data is available
    if (user?.primaryEmailAddress?.emailAddress) {
      localStorage.setItem('currentOwner', JSON.stringify({
        email: user.primaryEmailAddress.emailAddress,
        role: 'owner'
      }));
      loadBuckets();
    }
  }, [user, loadBuckets]);

  const handleAddBucket = async () => {
    setError("");
    setIsVerifying(true);
    
    try {
      if (!bucketName.match(/^[a-z0-9.-]{3,63}$/)) {
        throw new Error("Bucket name must be 3-63 characters, lowercase letters, numbers, dots, and hyphens only.");
      }
      
      const ownerEmail = user?.primaryEmailAddress?.emailAddress;
      if (!ownerEmail) {
        throw new Error('User email not available');
      }
      
      console.log('Making request to:', `${API_BASE_URL}/api/buckets`);
      console.log('Request data:', { accessKey: accessKey.substring(0, 4) + '...', secretKey: '***', region, bucketName, ownerEmail });
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      const response = await fetch(`${API_BASE_URL}/api/buckets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessKey, secretKey, region, bucketName, ownerEmail }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      console.log('Response status:', response.status);
      const data = await response.json();
      console.log('Response data:', data);
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create bucket');
      }
      
      setBuckets(prev => [...prev, {
        id: data.id.toString(),
        name: data.name,
        region: data.region,
        created: data.created,
        userCount: 0
      }]);
      
      // Reload buckets to get updated member count
      loadBuckets();
      
      setShowAddBucket(false);
      resetForm();
      
    } catch (error) {
      console.error('Bucket creation error:', error);
      if (error.name === 'AbortError') {
        setError('Request timed out. Please check your network connection and try again.');
      } else {
        setError(error instanceof Error ? error.message : "Failed to create bucket");
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const resetForm = () => {
    setAccessKey("");
    setSecretKey("");
    setRegion("");
    setBucketName("");
    setFriendlyName("");
    setError("");
  };

  const loadStorageAnalytics = async (bucketName: string) => {
    setLoadingAnalytics(true);
    try {
      const ownerEmail = user?.primaryEmailAddress?.emailAddress;
      const url = bucketName === 'ALL' 
        ? `${API_BASE_URL}/api/analytics/complete?ownerEmail=${encodeURIComponent(ownerEmail || '')}`
        : `${API_BASE_URL}/api/buckets/${bucketName}/analytics?ownerEmail=${encodeURIComponent(ownerEmail || '')}`;
      const response = await fetch(url);
      const data = await response.json();
      setAnalytics(data);
    } catch (error) {
      console.error('Failed to load analytics:', error);
    } finally {
      setLoadingAnalytics(false);
    }
  };

  const handleAnalyticsClick = (bucketName: string) => {
    setSelectedBucket(bucketName);
    setShowAnalytics(true);
    loadStorageAnalytics(bucketName);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col transition-colors">
      <header className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 px-6 py-4 transition-colors">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold dark:text-white">ShipFile Dashboard</h1>
          <div className="flex items-center space-x-2">
            {buckets.length > 0 && (
              <Button variant="outline" onClick={() => handleAnalyticsClick('ALL')}>
                <BarChart3 className="h-4 w-4 mr-2" />
                Complete Analysis
              </Button>
            )}
            <Button 
              variant="outline" 
              size="sm" 
              onClick={toggleDarkMode}
            >
              {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>

            {user?.primaryEmailAddress?.emailAddress && (
              <span className="text-sm text-gray-600 px-2">
                {user.primaryEmailAddress.emailAddress}
              </span>
            )}
            <Button variant="outline" onClick={() => {
              localStorage.removeItem('currentOwner');
              signOut();
            }}>
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold dark:text-white">Your S3 Buckets</h2>
            <Button onClick={() => setShowAddBucket(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Bucket
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bucket Name</TableHead>
                    <TableHead>Region</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Users</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {buckets.map((bucket) => (
                    <TableRow key={bucket.id} className="cursor-pointer hover:bg-gray-50" onClick={() => window.location.href = `/file-manager?bucket=${bucket.name}`}>
                      <TableCell className="font-medium">{bucket.name}</TableCell>
                      <TableCell>{bucket.region}</TableCell>
                      <TableCell>{bucket.created}</TableCell>
                      <TableCell>{bucket.userCount}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); handleAnalyticsClick(bucket.name); }}>
                            <BarChart3 className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setSelectedBucketForMembers(bucket.name); setShowMemberManagement(true); }}>
                            <Users className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="outline">
                            <Settings className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </main>

      <Dialog open={showAddBucket} onOpenChange={setShowAddBucket}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add New S3 Bucket</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Access Key ID</Label>
              <Input
                value={accessKey}
                onChange={(e) => setAccessKey(e.target.value)}
                placeholder="AKIA..."
              />
            </div>
            
            <div className="space-y-2">
              <Label>Secret Access Key</Label>
              <Input
                type="password"
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
                placeholder="••••••••••••••••"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Region</Label>
              <Select value={region} onValueChange={setRegion}>
                <SelectTrigger>
                  <SelectValue placeholder="Select region" />
                </SelectTrigger>
                <SelectContent>
                  {AWS_REGIONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Bucket Name</Label>
              <Input
                value={bucketName}
                onChange={(e) => setBucketName(e.target.value)}
                placeholder="my-company-bucket"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Friendly Name (optional)</Label>
              <Input
                value={friendlyName}
                onChange={(e) => setFriendlyName(e.target.value)}
                placeholder="Company Documents"
              />
            </div>
            
            <div className="flex items-center space-x-2">
              <Switch
                checked={encryptKeys}
                onCheckedChange={setEncryptKeys}
              />
              <Label>Encrypt and store access keys (recommended)</Label>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddBucket(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleAddBucket}
              disabled={!accessKey || !secretKey || !region || !bucketName || isVerifying}
            >
              {isVerifying ? "Adding..." : "Add Bucket"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAnalytics} onOpenChange={setShowAnalytics}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedBucket === 'ALL' ? 'Complete Storage Analysis - All Buckets' : `Storage Analytics - ${selectedBucket}`}</DialogTitle>
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
                    <CardTitle className="text-sm font-medium">Total Storage</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{analytics.totalSize}</div>
                    <p className="text-xs text-gray-500">{analytics.totalFiles} files • {analytics.totalFolders || 0} folders</p>
                  </CardContent>
                </Card>
                
                {selectedBucket === 'ALL' ? (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Infrastructure</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{analytics.totalBuckets}</div>
                      <p className="text-xs text-gray-500">Buckets • {analytics.totalMembers || 0} members</p>
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Team</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{analytics.totalMembers || 0}</div>
                      <p className="text-xs text-gray-500">Members • {analytics.totalShares || 0} shares</p>
                    </CardContent>
                  </Card>
                )}
                
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
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">File Types Distribution</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3 max-h-64 overflow-y-auto">
                      {analytics.fileTypes?.map((type: any, index: number) => (
                        <div key={index} className="flex justify-between items-center">
                          <span className="text-sm font-medium">{type.extension.toUpperCase()}</span>
                          <div className="flex items-center gap-2">
                            <div className="w-24 bg-gray-200 rounded-full h-2">
                              <div 
                                className="bg-blue-600 h-2 rounded-full" 
                                style={{ width: `${Math.min((type.count / analytics.totalFiles) * 100, 100)}%` }}
                              ></div>
                            </div>
                            <span className="text-sm text-gray-500 w-8 text-right">{type.count}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
                
                {selectedBucket === 'ALL' && analytics.topBuckets ? (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Bucket Overview</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3 max-h-64 overflow-y-auto">
                        {analytics.topBuckets.map((bucket: any, index: number) => (
                          <div key={index} className="p-3 border rounded-lg">
                            <div className="flex justify-between items-start">
                              <span className="text-sm font-medium">{bucket.name}</span>
                              <span className="text-sm text-gray-500">{bucket.size}</span>
                            </div>
                            <div className="flex justify-between text-xs text-gray-400 mt-1">
                              <span>{bucket.files} files • {bucket.folders || 0} folders</span>
                              <span>{bucket.members || 0} members • {bucket.shares || 0} shares</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ) : analytics.topUploaders ? (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Top Contributors</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {analytics.topUploaders.map((uploader: any, index: number) => (
                          <div key={index} className="flex justify-between items-center">
                            <span className="text-sm truncate">{uploader.email}</span>
                            <span className="text-sm text-gray-500">{uploader.files} files</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Team Members</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {analytics.memberList?.map((member: any, index: number) => (
                          <div key={index} className="flex justify-between items-center">
                            <span className="text-sm truncate">{member.email}</span>
                            <span className="text-xs text-gray-400">{member.scope_type || 'full'}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
                
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">{selectedBucket === 'ALL' ? 'Top Folders (All Buckets)' : 'Folder Analysis'}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {analytics.topFolders?.map((folder: any, index: number) => (
                        <div key={index} className="flex justify-between items-center">
                          <span className="text-sm truncate" title={folder.name}>{folder.name || 'Root'}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-500">{folder.size}</span>
                            <span className="text-xs text-gray-400">({folder.files})</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
              
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Recent Activity Log</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {analytics.recentActivity?.map((activity: any, index: number) => (
                      <div key={index} className="flex justify-between items-start py-2 border-b border-gray-100 last:border-0">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">
                              {(() => {
                                const ownerData = localStorage.getItem('currentOwner');
                                const ownerEmail = ownerData ? JSON.parse(ownerData).email : user?.primaryEmailAddress?.emailAddress;
                                
                                if (activity.user_email === ownerEmail || activity.user_email === 'owner') {
                                  return 'owner';
                                }
                                return activity.user_email;
                              })()} 
                            </span>
                            <span className="text-xs bg-gray-100 px-2 py-1 rounded">{activity.action}</span>
                            {selectedBucket === 'ALL' && activity.bucket_name && (
                              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">{activity.bucket_name}</span>
                            )}
                          </div>
                          <div className="text-sm text-gray-500 truncate mt-1" title={activity.resource_path}>
                            {activity.resource_path}
                          </div>
                        </div>
                        <span className="text-xs text-gray-400 whitespace-nowrap ml-2">
                          {new Date(activity.timestamp).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
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

      <MemberManagement
        open={showMemberManagement}
        onOpenChange={setShowMemberManagement}
        bucketName={selectedBucketForMembers}
        ownerEmail={user?.primaryEmailAddress?.emailAddress || ""}
      />
      
      {/* Footer */}
      <footer className="bg-white border-t mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center text-sm text-gray-500">
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
    </div>
  );
}