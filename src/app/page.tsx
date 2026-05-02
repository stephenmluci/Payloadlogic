
'use client';
import React from 'react';
import dynamic from 'next/dynamic';
import { useApp } from '@/context/AppContext';
import { Loader2 } from 'lucide-react';

// Dynamically import heavy page components to speed up initial compilation and prevent health check timeouts
const AuthPage = dynamic(() => import('@/components/auth/AuthPage').then(mod => mod.AuthPage), { 
  loading: () => <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>,
  ssr: false 
});

const SubscriptionPage = dynamic(() => import('@/components/subscription/SubscriptionPage').then(mod => mod.SubscriptionPage), { 
  loading: () => <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>,
  ssr: false 
});

const ClientPortalPage = dynamic(() => import('@/app/client-portal/page'), { 
  loading: () => <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>,
  ssr: false 
});

const AdminDashboard = dynamic(() => import('@/components/layout/AdminDashboard').then(mod => mod.AdminDashboard), { 
  loading: () => <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>,
  ssr: false 
});

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
    handleStartTrial,
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
    return (
      <AuthPage
        email={email}
        setEmail={setEmail}
        password={password}
        setPassword={setPassword}
        handleSignIn={handleSignIn}
        handleSignUp={handleSignUp}
      />
    );
  }
  
  if (appDisplayState === 'subscription_choice' && user) {
      return (
        <SubscriptionPage 
          userDisplayName={user.displayName || user.email || "New User"}
          onStartTrial={handleStartTrial} 
        />
      );
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
