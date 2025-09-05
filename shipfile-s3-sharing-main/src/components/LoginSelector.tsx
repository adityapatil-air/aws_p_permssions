import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Crown, User, ArrowLeft, HelpCircle, Key, Mail } from 'lucide-react';
import { Link } from 'react-router-dom';

const LoginSelector = () => {
  const [selectedMode, setSelectedMode] = useState<'owner' | 'member' | null>(null);

  const handleModeSelect = (mode: 'owner' | 'member') => {
    setSelectedMode(mode);
    // Navigate to appropriate auth flow
    if (mode === 'owner') {
      window.location.href = '/owner-auth';
    } else {
      window.location.href = '/member-auth';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-secondary flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-white/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/" className="flex items-center space-x-2">
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Home</span>
            </Link>
          </Button>
          <div className="flex items-center space-x-2">
            <span className="text-lg font-semibold text-foreground">ShipFile</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-4xl">
          <div className="text-center mb-12">
            <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Choose your login type
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Select how you'd like to access ShipFile based on your role and permissions.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto">
            {/* Owner Card */}
            <Card 
              className={`group cursor-pointer transition-all duration-300 hover:shadow-lg hover:scale-105 border-2 ${
                selectedMode === 'owner' 
                  ? 'border-primary bg-primary/5 shadow-lg' 
                  : 'border-border hover:border-primary/50'
              }`}
              onClick={() => handleModeSelect('owner')}
            >
              <CardHeader className="text-center pb-4">
                <div className="mx-auto mb-4 p-4 bg-gradient-primary rounded-full w-fit group-hover:scale-110 transition-bounce">
                  <Crown className="h-8 w-8 text-white" />
                </div>
                <div className="flex items-center justify-center space-x-2">
                  <CardTitle className="text-2xl text-foreground">Owner (root)</CardTitle>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <HelpCircle className="h-5 w-5 text-muted-foreground hover:text-foreground transition-smooth" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>Root access with full administrative privileges. Can manage all users, folders, and system settings.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </CardHeader>
              <CardContent className="text-center space-y-4">
                <div className="p-4 bg-muted/50 rounded-lg">
                  <Key className="h-6 w-6 text-primary mx-auto mb-2" />
                  <CardDescription className="text-foreground font-medium mb-2">
                    Prove ownership with AWS credentials
                  </CardDescription>
                  <p className="text-sm text-muted-foreground">
                    Access Key + Secret + Region
                  </p>
                </div>
                <Button 
                  variant={selectedMode === 'owner' ? 'hero' : 'outline'} 
                  className="w-full"
                  size="lg"
                >
                  Continue as Owner
                </Button>
              </CardContent>
            </Card>

            {/* Member Card */}
            <Card 
              className={`group cursor-pointer transition-all duration-300 hover:shadow-lg hover:scale-105 border-2 ${
                selectedMode === 'member' 
                  ? 'border-accent bg-accent/5 shadow-lg' 
                  : 'border-border hover:border-accent/50'
              }`}
              onClick={() => handleModeSelect('member')}
            >
              <CardHeader className="text-center pb-4">
                <div className="mx-auto mb-4 p-4 bg-accent rounded-full w-fit group-hover:scale-110 transition-bounce">
                  <User className="h-8 w-8 text-white" />
                </div>
                <div className="flex items-center justify-center space-x-2">
                  <CardTitle className="text-2xl text-foreground">Member (user)</CardTitle>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <HelpCircle className="h-5 w-5 text-muted-foreground hover:text-foreground transition-smooth" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>Standard user access with permissions assigned by the owner. Requires an invitation to join.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </CardHeader>
              <CardContent className="text-center space-y-4">
                <div className="p-4 bg-muted/50 rounded-lg">
                  <Mail className="h-6 w-6 text-accent mx-auto mb-2" />
                  <CardDescription className="text-foreground font-medium mb-2">
                    Sign in with email
                  </CardDescription>
                  <p className="text-sm text-muted-foreground">
                    (invitations required)
                  </p>
                </div>
                <Button 
                  variant={selectedMode === 'member' ? 'cta' : 'outline'} 
                  className="w-full"
                  size="lg"
                >
                  Continue as Member
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Secondary Links */}
          <div className="flex flex-col sm:flex-row justify-center items-center space-y-4 sm:space-y-0 sm:space-x-8 mt-12">
            <Button variant="link" className="text-muted-foreground hover:text-foreground">
              Forgot password?
            </Button>
            <Button variant="link" className="text-muted-foreground hover:text-foreground">
              Need invite? Contact admin
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default LoginSelector;