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
import { Plus, Settings, Users } from "lucide-react";
import { useClerk } from "@clerk/clerk-react";
import React from "react";

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

  const loadBuckets = React.useCallback(async () => {
    try {
      const ownerEmail = user?.primaryEmailAddress?.emailAddress;
      if (!ownerEmail) return;
      
      const response = await fetch(`http://localhost:3001/api/buckets?ownerEmail=${encodeURIComponent(ownerEmail)}`);
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
      
      const response = await fetch('http://localhost:3001/api/buckets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessKey, secretKey, region, bucketName, ownerEmail })
      });
      
      const data = await response.json();
      
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
      setError(error instanceof Error ? error.message : "Failed to create bucket");
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

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">ShipFile Dashboard</h1>
          <div className="flex items-center space-x-2">
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
            <h2 className="text-xl font-semibold">Your S3 Buckets</h2>
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

                          <Button size="sm" variant="outline">
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
    </div>
  );
}