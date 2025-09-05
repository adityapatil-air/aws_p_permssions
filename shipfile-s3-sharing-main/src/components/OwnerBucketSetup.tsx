import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface Bucket {
  name: string;
  created: string;
  region: string;
}

interface AccountInfo {
  accountId: string;
  identity: string;
}

const AWS_REGIONS = [
  { value: "us-east-1", label: "US East (N. Virginia)" },
  { value: "us-east-2", label: "US East (Ohio)" },
  { value: "us-west-1", label: "US West (N. California)" },
  { value: "us-west-2", label: "US West (Oregon)" },
  { value: "ca-central-1", label: "Canada (Central)" },
  { value: "eu-west-1", label: "Europe (Ireland)" },
  { value: "eu-west-2", label: "Europe (London)" },
  { value: "eu-west-3", label: "Europe (Paris)" },
  { value: "eu-central-1", label: "Europe (Frankfurt)" },
  { value: "eu-north-1", label: "Europe (Stockholm)" },
  { value: "ap-south-1", label: "Asia Pacific (Mumbai)" },
  { value: "ap-southeast-1", label: "Asia Pacific (Singapore)" },
  { value: "ap-southeast-2", label: "Asia Pacific (Sydney)" },
  { value: "ap-northeast-1", label: "Asia Pacific (Tokyo)" },
  { value: "ap-northeast-2", label: "Asia Pacific (Seoul)" },
  { value: "sa-east-1", label: "South America (São Paulo)" }
];

export default function OwnerBucketSetup() {
  const [accessKey, setAccessKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [region, setRegion] = useState("");
  const [isVerified, setIsVerified] = useState(false);
  const [error, setError] = useState("");
  const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null);
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [newBucketName, setNewBucketName] = useState("");
  const [newBucketRegion, setNewBucketRegion] = useState("");
  const [friendlyName, setFriendlyName] = useState("");
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [selectedBucket, setSelectedBucket] = useState<Bucket | null>(null);
  const [isNewBucket, setIsNewBucket] = useState(false);
  const [encryptKeys, setEncryptKeys] = useState(true);
  const [hasExistingSetup, setHasExistingSetup] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const validateAWSCredentials = (accessKey: string, secretKey: string, region: string) => {
    const accessKeyPattern = /^AKIA[0-9A-Z]{16}$/;
    const secretKeyPattern = /^[A-Za-z0-9/+=]{40}$/;
    const validRegions = AWS_REGIONS.map(r => r.value);
    
    if (!accessKeyPattern.test(accessKey)) {
      throw new Error("Invalid Access Key ID format");
    }
    if (!secretKeyPattern.test(secretKey)) {
      throw new Error("Invalid Secret Access Key format");
    }
    if (!validRegions.includes(region)) {
      throw new Error("Invalid region selected");
    }
    return true;
  };

  const handleVerify = async () => {
    setError("");
    setIsVerifying(true);
    
    try {
      validateAWSCredentials(accessKey, secretKey, region);
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const mockBuckets = [
        { name: "my-project-bucket", created: "2024-01-15", region: "us-east-1" },
        { name: "backup-storage", created: "2024-02-20", region: "us-west-2" }
      ];
      
      setAccountInfo({
        accountId: "123456789012",
        identity: accessKey.substring(0, 8) + "..."
      });
      setBuckets(mockBuckets);
      setNewBucketRegion(region);
      setIsVerified(true);
      setHasExistingSetup(mockBuckets.length > 0);
      
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not verify credentials — please re-check keys and region.");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSelectBucket = (bucket: Bucket) => {
    setSelectedBucket(bucket);
    setIsNewBucket(false);
    setShowConfirmModal(true);
  };

  const handleCreateAndBind = () => {
    if (!newBucketName) return;
    
    const newBucket: Bucket = {
      name: newBucketName,
      created: new Date().toISOString().split('T')[0],
      region: newBucketRegion
    };
    
    setSelectedBucket(newBucket);
    setIsNewBucket(true);
    setShowConfirmModal(true);
  };

  const handleConfirmSetup = () => {
    console.log("Setting up bucket:", selectedBucket);
    console.log("Encrypt keys:", encryptKeys);
    console.log("Is new bucket:", isNewBucket);
    setShowConfirmModal(false);
  };

  if (!isVerified) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center">Verify AWS Account</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="accessKey">Access Key ID</Label>
              <Input
                id="accessKey"
                value={accessKey}
                onChange={(e) => setAccessKey(e.target.value)}
                placeholder="AKIA..."
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="secretKey">Secret Access Key</Label>
              <Input
                id="secretKey"
                type="password"
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
                placeholder="••••••••••••••••"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="region">Region</Label>
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

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <p className="text-sm text-gray-600">
              We will verify your account to list and create buckets. Keys are encrypted and never shown to members.
            </p>

            <div className="flex gap-2">
              <Button 
                onClick={handleVerify} 
                className="flex-1"
                disabled={!accessKey || !secretKey || !region || isVerifying}
              >
                {isVerifying ? "Verifying..." : "Verify"}
              </Button>
              <Button variant="outline" className="flex-1">
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {accountInfo && (
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-gray-600">
                Account ID: {accountInfo.accountId} • Identity: {accountInfo.identity}
              </p>
            </CardContent>
          </Card>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Your AWS Buckets</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bucket Name</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Region</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {buckets.map((bucket) => (
                    <TableRow key={bucket.name}>
                      <TableCell>{bucket.name}</TableCell>
                      <TableCell>{bucket.created}</TableCell>
                      <TableCell>{bucket.region}</TableCell>
                      <TableCell>
                        <Button 
                          size="sm" 
                          onClick={() => handleSelectBucket(bucket)}
                        >
                          Select
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Create New Bucket</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="bucketName">Bucket Name</Label>
                <Input
                  id="bucketName"
                  value={newBucketName}
                  onChange={(e) => setNewBucketName(e.target.value)}
                  placeholder="my-new-bucket"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="bucketRegion">Region</Label>
                <Select value={newBucketRegion} onValueChange={setNewBucketRegion}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AWS_REGIONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="friendlyName">Friendly Name (optional)</Label>
                <Input
                  id="friendlyName"
                  value={friendlyName}
                  onChange={(e) => setFriendlyName(e.target.value)}
                  placeholder="My Project Bucket"
                />
              </div>
              
              <Button 
                onClick={handleCreateAndBind}
                disabled={!newBucketName}
                className="w-full"
              >
                Create & Bind
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Bucket Setup</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <p>
              {isNewBucket ? "Create and use" : "Use existing"} bucket: <strong>{selectedBucket?.name}</strong>
            </p>
            <p>Region: {selectedBucket?.region}</p>
            
            <div className="flex items-center space-x-2">
              <Switch
                id="encrypt-keys"
                checked={encryptKeys}
                onCheckedChange={setEncryptKeys}
              />
              <Label htmlFor="encrypt-keys">
                Encrypt and store access keys for this bucket (recommended)
              </Label>
            </div>
            <p className="text-sm text-gray-600">
              Only owners see the keys; members never see them.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirmSetup}>
              Confirm Setup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}