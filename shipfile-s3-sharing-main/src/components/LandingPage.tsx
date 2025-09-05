import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, Users, Clock, ArrowRight, Cloud, Lock, Share } from 'lucide-react';
import { Link } from 'react-router-dom';

const LandingPage = () => {
  const features = [
    {
      icon: Shield,
      title: "Secure S3-based Storage",
      description: "Your files are stored directly in your own AWS S3 buckets with enterprise-grade security and encryption."
    },
    {
      icon: Users,
      title: "Folder-level Permissions",
      description: "Granular access control and delegation system lets you manage who can access what, when."
    },
    {
      icon: Clock,
      title: "Time-limited Sharing",
      description: "Share files securely with automatic expiration dates and revokable access links."
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Cloud className="h-8 w-8 text-primary" />
            <h1 className="text-2xl font-bold text-foreground">ShipFile</h1>
          </div>
          <nav className="hidden md:flex items-center space-x-6">
            <Link to="/docs" className="text-muted-foreground hover:text-foreground transition-smooth">
              Docs
            </Link>
            <Link to="/about" className="text-muted-foreground hover:text-foreground transition-smooth">
              About
            </Link>
            <Button variant="outline" size="sm" asChild>
              <Link to="/login">Login</Link>
            </Button>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-hero opacity-5"></div>
        <div className="container mx-auto px-4 py-24 md:py-32 text-center relative">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-4xl md:text-6xl font-bold text-foreground mb-6 leading-tight">
              Secure team file storage on your 
              <span className="bg-gradient-primary bg-clip-text text-transparent"> AWS S3</span>
            </h1>
            <p className="text-xl md:text-2xl text-muted-foreground mb-8 max-w-2xl mx-auto leading-relaxed">
              Take control of your file sharing with enterprise-grade security, 
              granular permissions, and seamless AWS integration.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Button size="lg" variant="hero" className="text-lg px-8 py-4" asChild>
                <Link to="/login">
                  Get Started
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" className="text-lg px-8 py-4" asChild>
                <Link to="/login">
                  Login
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-gradient-secondary">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Why teams choose ShipFile
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Built for security-conscious teams who need complete control over their file storage infrastructure.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {features.map((feature, index) => (
              <Card key={index} className="group hover:shadow-card transition-smooth border-border/50 bg-card/50 backdrop-blur-sm">
                <CardHeader className="text-center pb-4">
                  <div className="mx-auto mb-4 p-3 bg-gradient-primary rounded-full w-fit group-hover:scale-110 transition-bounce">
                    <feature.icon className="h-8 w-8 text-white" />
                  </div>
                  <CardTitle className="text-xl text-foreground">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-center text-muted-foreground leading-relaxed">
                    {feature.description}
                  </CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-hero relative">
        <div className="absolute inset-0 bg-foreground/5"></div>
        <div className="container mx-auto px-4 text-center relative">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Ready to secure your file sharing?
            </h2>
            <p className="text-lg text-muted-foreground mb-8">
              Get started with ShipFile today and take control of your team's file storage.
            </p>
            <Button size="lg" variant="hero" className="text-lg px-10 py-4" asChild>
              <Link to="/login">
                Start Free Trial
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-foreground/5 border-t border-border py-12">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center space-x-2 mb-4 md:mb-0">
              <Cloud className="h-6 w-6 text-primary" />
              <span className="text-lg font-semibold text-foreground">ShipFile</span>
            </div>
            <nav className="flex space-x-6">
              <Link to="/about" className="text-muted-foreground hover:text-foreground transition-smooth">
                About
              </Link>
              <Link to="/docs" className="text-muted-foreground hover:text-foreground transition-smooth">
                Docs
              </Link>
              <Link to="/contact" className="text-muted-foreground hover:text-foreground transition-smooth">
                Contact
              </Link>
            </nav>
          </div>
          <div className="mt-8 pt-8 border-t border-border text-center">
            <p className="text-muted-foreground">
              © 2024 ShipFile. Secure file storage on your AWS infrastructure.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;