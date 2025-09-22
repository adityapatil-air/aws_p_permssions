import React from 'react';
import { SignIn, SignUp, useUser, useClerk } from '@clerk/clerk-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Crown, Shield, Key } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

const OwnerAuth = () => {
  const { isSignedIn, user } = useUser();
  const { signOut } = useClerk();
  const navigate = useNavigate();

  if (isSignedIn) {
    return (
      <div className="min-h-screen bg-gradient-secondary flex items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 p-4 bg-gradient-primary rounded-full w-fit">
              <Crown className="h-8 w-8 text-white" />
            </div>
            <CardTitle className="text-2xl">Welcome, Owner!</CardTitle>
            <CardDescription>
              You're logged in as {user.primaryEmailAddress?.emailAddress}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center p-4 bg-primary/10 rounded-lg border border-primary/20">
              <Shield className="h-6 w-6 text-primary mx-auto mb-2" />
              <p className="text-sm text-foreground">
                You have owner access to ShipFile
              </p>
            </div>
            <Button 
              onClick={() => navigate('/owner-dashboard')}
              className="w-full mb-2"
            >
              Go to Dashboard
            </Button>
            <Button 
              onClick={() => signOut()}
              variant="outline" 
              className="w-full hover:bg-red-50 hover:border-red-300 hover:text-red-600"
            >
              Sign Out
            </Button>
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
            <div className="mx-auto mb-4 p-4 bg-gradient-primary rounded-full w-fit">
              <Key className="h-8 w-8 text-white" />
            </div>
            <CardTitle className="text-2xl">Owner Authentication</CardTitle>
            <CardDescription>
              Sign in with your Google account to access owner privileges
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="signin" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Sign In</TabsTrigger>
                <TabsTrigger value="signup">Sign Up</TabsTrigger>
              </TabsList>
              <TabsContent value="signin" className="mt-4">
                <SignIn 
                  appearance={{
                    elements: {
                      formButtonPrimary: 'bg-gradient-primary hover:opacity-90',
                      card: 'shadow-none',
                    },
                  }}
                  fallbackRedirectUrl="/owner-auth"
                  forceRedirectUrl="/owner-auth"
                />
              </TabsContent>
              <TabsContent value="signup" className="mt-4">
                <SignUp 
                  appearance={{
                    elements: {
                      formButtonPrimary: 'bg-gradient-primary hover:opacity-90',
                      card: 'shadow-none',
                    },
                  }}
                  fallbackRedirectUrl="/owner-auth"
                  forceRedirectUrl="/owner-auth"
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default OwnerAuth;