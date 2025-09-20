import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, User, Mail, AlertCircle } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SignIn, useUser, useClerk } from '@clerk/clerk-react';

const MemberAuth = () => {
  const navigate = useNavigate();
  const { isSignedIn, user } = useUser();
  const { signOut } = useClerk();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [member, setMember] = useState(null);
  const [showEmailLogin, setShowEmailLogin] = useState(false);

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('http://localhost:3001/api/member/login', {
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
        const response = await fetch('http://localhost:3001/api/member/google-login', {
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
      <div className="min-h-screen bg-gradient-secondary flex items-center justify-center px-4">
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
              <h3 className="text-lg font-semibold mb-2">Your Buckets:</h3>
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
    <div className="min-h-screen bg-gradient-secondary flex flex-col">
      <header className="border-b border-border bg-white/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/login" className="flex items-center space-x-2">
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Login</span>
            </Link>
          </Button>
          <span className="text-lg font-semibold text-foreground">ShipFile</span>
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
            
            {!showEmailLogin ? (
              <div className="space-y-4">
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
                
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <Separator className="w-full" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white px-2 text-muted-foreground">Or</span>
                  </div>
                </div>
                
                <Button 
                  onClick={() => setShowEmailLogin(true)}
                  variant="outline" 
                  className="w-full"
                >
                  Sign in with Email & Password
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
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
                  
                  {error && (
                    <Alert variant="destructive">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}
                  
                  <Button 
                    type="submit" 
                    disabled={loading || !email || !password}
                    className="w-full"
                  >
                    {loading ? 'Signing In...' : 'Sign In'}
                  </Button>
                </form>
                
                <Button 
                  onClick={() => setShowEmailLogin(false)}
                  variant="ghost" 
                  className="w-full"
                >
                  Back to Google Login
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default MemberAuth;