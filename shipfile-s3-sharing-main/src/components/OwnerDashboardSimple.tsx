import React from 'react';
import { useClerk } from '@clerk/clerk-react';

export default function OwnerDashboardSimple() {
  const { user, signOut } = useClerk();

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold">Owner Dashboard</h1>
            <button 
              onClick={() => signOut()}
              className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
            >
              Sign Out
            </button>
          </div>
          
          <div className="space-y-4">
            <p>Welcome, {user?.primaryEmailAddress?.emailAddress}</p>
            <p>This is a simplified dashboard to test the routing.</p>
            
            <div className="bg-blue-50 p-4 rounded">
              <h2 className="font-semibold mb-2">Debug Info:</h2>
              <p>User loaded: {user ? 'Yes' : 'No'}</p>
              <p>Email: {user?.primaryEmailAddress?.emailAddress || 'Not available'}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}