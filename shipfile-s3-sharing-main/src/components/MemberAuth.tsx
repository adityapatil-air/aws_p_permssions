import React, { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, User, Mail, AlertCircle, Moon, Sun } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SignIn, useUser, useClerk } from '@clerk/clerk-react';
import { useDarkMode } from '../hooks/use-dark-mode';
import { API_BASE_URL } from '../config';

const MemberAuth = () => {
  const navigate = useNavigate();
  const { isDarkMode, toggleDarkMode } = useDarkMode();

  const { isSignedIn, user } = useUser();
  const { signOut } = useClerk();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [member, setMember] = useState(null);



  const handleEmailLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/member/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      // Handle multiple buckets
      if (data.buckets && data.buckets.length > 0) {
        const memberData = {
          email: data.email,
          buckets: data.buckets
        };
        setMember(memberData);
        localStorage.setItem('currentMember', JSON.stringify(memberData));
        // If only one bucket, go directly to it
        if (data.buckets.length === 1) {
          navigate(`/file-manager?bucket=${data.buckets[0].bucketName}`);
        }
        // If multiple buckets, stay on this page to show bucket selection
      } else {
        throw new Error('No buckets found for this member');
      }

    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (isSignedIn && user?.primaryEmailAddress?.emailAddress) {
      try {
        const response = await fetch(`${API_BASE_URL}/api/member/google-login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: user.primaryEmailAddress.emailAddress })
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
            buckets: data.buckets
          };
          setMember(memberData);
          localStorage.setItem('currentMember', JSON.stringify(memberData));
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

  React.useEffect(() => {
    if (isSignedIn && !error) {
      handleGoogleLogin();
    }
  }, [isSignedIn]);

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
                className="w-full hover:bg-red-50 hover:border-red-300 hover:text-red-600"
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
              Sign in with your email or Google account
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
            
            <Tabs defaultValue="google" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="google">Google</TabsTrigger>
                <TabsTrigger value="email">Email</TabsTrigger>
              </TabsList>
              <TabsContent value="google" className="mt-4">
                <SignIn 
                  appearance={{
                    elements: {
                      formButtonPrimary: 'bg-accent hover:opacity-90',
                      card: 'shadow-none',
                    },
                  }}
                  fallbackRedirectUrl="/member-auth"
                  forceRedirectUrl="/member-auth"
                />
              </TabsContent>
              <TabsContent value="email" className="mt-4">
                <form onSubmit={handleEmailLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input
                      type="email"
                      placeholder="Enter your email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Password</Label>
                    <Input
                      type="password"
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                  
                  <Button 
                    type="submit" 
                    disabled={loading || !email || !password}
                    className="w-full"
                  >
                    {loading ? 'Signing In...' : 'Sign In'}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default MemberAuth;