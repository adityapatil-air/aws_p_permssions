import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, Users, Clock, ArrowRight, Cloud, Lock, Share } from 'lucide-react';
import { Link } from 'react-router-dom';

const LandingPage = () => {
  // Redirect to the new landing page
  React.useEffect(() => {
    window.location.href = '/landing.html';
  }, []);

  return null; // This component will redirect immediately
  // Features moved to static landing page

  // This will never render due to the redirect above
  return <div>Redirecting...</div>;
};

export default LandingPage;