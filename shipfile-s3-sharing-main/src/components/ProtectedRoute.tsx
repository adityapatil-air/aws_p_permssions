import React from 'react';
import { useUser } from '@clerk/clerk-react';
import { Navigate } from 'react-router-dom';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAuth?: boolean;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, requireAuth = true }) => {
  const { isSignedIn, isLoaded, user } = useUser();

  // Show loading while Clerk is initializing
  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-gradient-secondary flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // For file manager, check if user has valid session (owner or member)
  if (!requireAuth) {
    const memberData = localStorage.getItem('currentMember');
    const ownerData = localStorage.getItem('currentOwner');
    
    // If no valid session and not signed in, redirect to login
    if (!memberData && !ownerData && !isSignedIn) {
      return <Navigate to="/login" replace />;
    }
    
    return <>{children}</>;
  }

  // Redirect to auth if authentication is required but user is not properly signed in
  if (requireAuth && (!isSignedIn || !user?.primaryEmailAddress?.emailAddress)) {
    return <Navigate to="/owner-auth" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;