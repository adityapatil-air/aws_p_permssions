import React from 'react';
import { SignIn, SignUp, useUser, useClerk } from '@clerk/clerk-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, User, Mail, AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Alert, AlertDescription } from '@/components/ui/alert';

const MemberAuth = () => {
  const { isSignedIn, user } = useUser();
  const { signOut } = useClerk();

  if (isSignedIn) {
    return (
      <div className="min-h-screen bg-gradient-secondary flex items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 p-4 bg-accent rounded-full w-fit">
              <User className="h-8 w-8 text-white" />
            </div>
            <CardTitle className="text-2xl">Welcome, {user.firstName || 'Member'}!</CardTitle>
            <CardDescription>
              You're logged in as {user.primaryEmailAddress?.emailAddress}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                You're logged in as a team member. Your access is managed by the owner.
              </AlertDescription>
            </Alert>
            <div className="space-y-3">
              <Button variant="hero" className="w-full">
                Access Dashboard
              </Button>
              <Button 
                onClick={() => signOut()}
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
            <Tabs defaultValue="signin" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Sign In</TabsTrigger>
                <TabsTrigger value="signup">Sign Up</TabsTrigger>
              </TabsList>
              <TabsContent value="signin" className="mt-4">
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
              <TabsContent value="signup" className="mt-4">
                <Alert className="mb-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Member accounts require invitation from the owner.
                  </AlertDescription>
                </Alert>
                <SignUp 
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
            </Tabs>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default MemberAuth;