import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle, XCircle } from "lucide-react";
import { API_BASE_URL } from '@/config/api';
import { SignIn, useUser } from '@clerk/clerk-react';

interface InviteData {
  email: string;
  permissions: string;
  orgName: string;
  bucketName: string;
}

export default function AcceptInvite() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [inviteData, setInviteData] = useState<InviteData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const { isSignedIn, user } = useUser();

  const formatPermissions = (permissionsStr: string) => {
    try {
      const permissions = JSON.parse(permissionsStr);
      const activePermissions = [];
      
      if (permissions.viewOnly) activePermissions.push("View Only");
      if (permissions.viewDownload) activePermissions.push("View + Download");
      if (permissions.uploadOnly) activePermissions.push("Upload Only");
      if (permissions.uploadViewOwn) activePermissions.push("Upload & View Own Files");
      if (permissions.uploadViewAll) activePermissions.push("Upload & View All Files");
      if (permissions.deleteFiles) activePermissions.push("Can Delete Files");
      if (permissions.generateLinks) activePermissions.push("Can Generate Share Links");
      if (permissions.createFolder) activePermissions.push("Can Create Folders");
      if (permissions.deleteOwnFiles) activePermissions.push("Can Delete Own Files");
      if (permissions.inviteMembers) activePermissions.push("Can Invite Members");
      
      return activePermissions.length > 0 ? activePermissions : ["No permissions assigned"];
    } catch {
      return ["Invalid permissions format"];
    }
  };

  useEffect(() => {
    if (token) {
      loadInviteData();
    }
  }, [token]);

  const loadInviteData = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/invite/${token}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Invalid invitation');
      }

      setInviteData(data);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to load invitation');
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptInvite = async () => {
    if (!isSignedIn || !user?.primaryEmailAddress?.emailAddress) {
      setError("Please sign in with Google first");
      return;
    }

    if (user.primaryEmailAddress.emailAddress !== inviteData?.email) {
      setError(`Please sign in with the invited email: ${inviteData?.email}`);
      return;
    }

    setAccepting(true);
    setError("");

    try {
      const response = await fetch(`${API_BASE_URL}/api/invite/${token}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: user.primaryEmailAddress.emailAddress,
          name: user.fullName || user.firstName || 'Member'
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to accept invitation');
      }

      setAccepted(true);
      
      // Store member data in localStorage
      const memberData = {
        email: data.email,
        buckets: [{
          bucketName: data.bucketName,
          permissions: inviteData.permissions,
          scopeType: data.scopeType || 'entire',
          scopeFolders: data.scopeFolders || '[]'
        }]
      };
      localStorage.setItem('currentMember', JSON.stringify(memberData));
      
      setTimeout(() => {
        navigate(`/file-manager?bucket=${data.bucketName}`);
      }, 2000);

    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to accept invitation');
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <p>Loading invitation...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error && !inviteData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center text-red-600">
              <XCircle className="h-5 w-5 mr-2" />
              Invalid Invitation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600 mb-4">{error}</p>
            <Button onClick={() => navigate('/')} className="w-full">
              Go to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (accepted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center text-green-600">
              <CheckCircle className="h-5 w-5 mr-2" />
              Welcome to ShipFile!
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600 mb-4">
              You have successfully joined the organization. Redirecting to your workspace...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Join ShipFile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {inviteData && (
            <div className="bg-blue-50 p-4 rounded-lg">
              <p className="text-sm text-blue-800 mb-2">
                <strong>{inviteData.email}</strong>, you've been invited to join{" "}
                <strong>{inviteData.orgName}</strong>
              </p>
              <div className="text-sm text-blue-700">
                <strong>Permissions:</strong>
                <ul className="list-disc list-inside mt-1 ml-2">
                  {formatPermissions(inviteData.permissions).map((permission, index) => (
                    <li key={index}>{permission}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {!isSignedIn ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 text-center">
                Sign in with Google to accept this invitation
              </p>
              <SignIn 
                appearance={{
                  elements: {
                    formButtonPrimary: 'bg-blue-600 hover:bg-blue-700',
                    card: 'shadow-none border-0',
                    rootBox: 'w-full',
                  },
                }}
                fallbackRedirectUrl={`/accept-invite/${token}`}
                forceRedirectUrl={`/accept-invite/${token}`}
              />
            </div>
          ) : (
            <div className="bg-green-50 p-4 rounded-lg">
              <p className="text-sm text-green-800">
                ✅ Signed in as: <strong>{user?.primaryEmailAddress?.emailAddress}</strong>
              </p>
              {user?.primaryEmailAddress?.emailAddress !== inviteData?.email && (
                <p className="text-sm text-red-600 mt-2">
                  ⚠️ Please sign in with the invited email: <strong>{inviteData?.email}</strong>
                </p>
              )}
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button
            onClick={handleAcceptInvite}
            disabled={accepting || !isSignedIn || user?.primaryEmailAddress?.emailAddress !== inviteData?.email}
            className="w-full"
          >
            {accepting ? "Accepting..." : "Accept Invitation"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}