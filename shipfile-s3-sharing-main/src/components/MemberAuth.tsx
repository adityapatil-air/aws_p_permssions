import { API_BASE_URL } from '@/config/api';
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useDarkMode } from '../hooks/use-dark-mode';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import { ArrowLeft, User, Mail, AlertCircle, Moon, Sun } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SignIn, useUser, useClerk } from '@clerk/clerk-react';

const MemberAuth = () => {
  const navigate = useNavigate();
  const { isDarkMode, toggleDarkMode } = useDarkMode();

  const { isSignedIn, user } = useUser();
  const { signOut } = useClerk();
  const [error, setError] = useState('');
  const [member, setMember] = useState(null);




  // Check for existing member data on component mount
  React.useEffect(() => {
    const existingMember = localStorage.getItem('currentMember');
    if (existingMember && !isSignedIn) {
      try {
        const memberData = JSON.parse(existingMember);
        setMember(memberData);
      } catch (error) {
        localStorage.removeItem('currentMember');
      }
    }
  }, [isSignedIn]);



  React.useEffect(() => {
    const authenticateMember = async () => {
      if (isSignedIn && user?.primaryEmailAddress?.emailAddress && !error) {
        try {
          const response = await fetch(`${API_BASE_URL}/api/google-login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              email: user.primaryEmailAddress.emailAddress,
              name: user.fullName || user.firstName || 'Member'
            })
          });

          const data = await response.json();

          if (!response.ok) {
            setError(data.error || 'You are not a member of any organization');
            setTimeout(() => {
              signOut();
              setError('');
            }, 3000);
            return;
          }

          // Handle multiple buckets
          if (data.buckets && data.buckets.length > 0) {
            const memberData = {
              email: data.email,
              buckets: data.buckets,
              isOwner: data.isOwner || false
            };
            setMember(memberData);
            localStorage.setItem('currentMember', JSON.stringify(memberData));
            
            // If only one bucket, go directly to it
            if (data.buckets.length === 1) {
              navigate(`/file-manager?bucket=${data.buckets[0].bucketName}`);
            }
          } else {
            throw new Error('No buckets found for this member');
          }

        } catch (error) {
          setError('You are not a member of any organization');
          setTimeout(() => {
            signOut();
            setError('');
          }, 3000);
        }
      }
    };
    
    authenticateMember();
  }, [isSignedIn, user, error, signOut, navigate]);

  if (member) {
    return (
      <div className="min-h-screen bg-gradient-secondary dark:bg-gray-900 flex items-center justify-center px-4 transition-colors">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 p-4 bg-accent rounded-full w-fit">
              <User className="h-8 w-8 text-white" />
            </div>
            <CardTitle className="text-2xl">Welcome, Member!</CardTitle>
            <CardDescription>
              You're logged in as {member.email}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-lg font-semibold">Your Buckets:</h3>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={toggleDarkMode}
                >
                  {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </Button>
              </div>
              {member.buckets.map((bucket, index) => (
                <div key={index} className="border rounded-lg p-3">
                  <div className="flex justify-between items-center">
                    <div>
                      <h4 className="font-medium">{bucket.bucketName}</h4>
                      <p className="text-sm text-muted-foreground">
                        Scope: {bucket.scopeType || 'entire'}
                      </p>
                    </div>
                    <Button 
                      onClick={() => navigate(`/file-manager?bucket=${bucket.bucketName}`)}
                      variant="hero" 
                      size="sm"
                    >
                      Access
                    </Button>
                  </div>
                </div>
              ))}
              <Button 
                onClick={() => {
                  setMember(null);
                  localStorage.removeItem('currentMember');
                  if (isSignedIn) signOut();
                }}
                variant="outline" 
                className="w-full"
              >
                Sign Out
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-secondary dark:bg-gray-900 flex flex-col transition-colors">
      <header className="border-b border-border bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm transition-colors">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/login" className="flex items-center space-x-2">
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Login</span>
            </Link>
          </Button>
          <span className="text-lg font-semibold text-foreground dark:text-white">ShipFile</span>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 p-4 bg-accent rounded-full w-fit">
              <Mail className="h-8 w-8 text-white" />
            </div>
            <CardTitle className="text-2xl">Member Authentication</CardTitle>
            <CardDescription>
              Sign in with your Google account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Alert className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Member accounts are created through invitation only.
              </AlertDescription>
            </Alert>
            
            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            
            <div className="space-y-4">
              <p className="text-sm text-gray-600 text-center">
                Sign in with your Google account to access your organization
              </p>
              <div className="w-full">
                <SignIn 
                  appearance={{
                    elements: {
                      formButtonPrimary: 'bg-accent hover:opacity-90',
                      card: 'shadow-none border-0',
                      rootBox: 'w-full',
                      formFieldInput: 'hidden',
                      formField: 'hidden',
                      socialButtonsBlockButton: 'w-full',
                      socialButtonsBlockButtonText: 'text-sm font-medium',
                    },
                  }}
                  fallbackRedirectUrl="/member-auth"
                  forceRedirectUrl="/member-auth"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default MemberAuth;