
'use client';
import React from 'react';
import { useApp } from '@/context/AppContext';

// Page Components
import { AuthPage } from '@/components/auth/AuthPage';
import { SubscriptionPage } from '@/components/subscription/SubscriptionPage';
import ClientPortalPage from '@/app/client-portal/page';
import { AdminDashboard } from '@/components/layout/AdminDashboard';
import { Loader2 } from 'lucide-react';

export default function DashDispatchProApp() {
  const {
    appDisplayState,
    user,
    email,
    setEmail,
    password,
    setPassword,
    handleSignIn,
    handleSignUp,
    handleSignOut,
    handleStartTrial,
    isTrialSession
  } = useApp();

  if (appDisplayState === 'loading') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Loading Dash Dispatch Pro...</p>
      </div>
    );
  }

  if (appDisplayState === 'auth') {
    return <AuthPage
              email={email}
              setEmail={setEmail}
              password={password}
              setPassword={setPassword}
              handleSignIn={handleSignIn}
              handleSignUp={handleSignUp}
            />;
  }
  
  if (appDisplayState === 'subscription_choice' && user) {
      return <SubscriptionPage 
                userDisplayName={user.displayName || user.email || "New User"}
                onStartTrial={handleStartTrial} 
             />;
  }

  if (appDisplayState === 'client_portal' && user && user.role === 'client') {
    return <ClientPortalPage />;
  }

  if (appDisplayState === 'admin_dashboard' && user && user.role === 'admin') {
    return <AdminDashboard />;
  }

  return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Initializing...</p>
      </div>
    );
}
