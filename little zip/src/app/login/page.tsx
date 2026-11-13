'use client';

import React, { useEffect, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useApp } from '@/context/AppContext';
import { Loader2 } from 'lucide-react';
import { useSearchParams, useRouter } from 'next/navigation';
import { BrandSplashScreen } from '@/components/brand/BrandSplashScreen';

// Dynamically import heavy page components to prevent build bloat
const AuthPage = dynamic(() => import('@/components/auth/AuthPage').then(mod => mod.AuthPage), { 
  loading: () => <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>,
  ssr: false 
});

const SubscriptionPage = dynamic(() => import('@/components/subscription/SubscriptionPage').then(mod => mod.SubscriptionPage), { 
  loading: () => <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>,
  ssr: false 
});

const OnboardingWizard = dynamic(() => import('@/components/onboarding/OnboardingWizard').then(mod => mod.OnboardingWizard), { 
  loading: () => <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>,
  ssr: false 
});

const ClientPortalPage = dynamic(() => import('@/app/client-portal/page'), { 
  loading: () => <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>,
  ssr: false 
});

const AdminDashboard = dynamic(() => import('@/components/layout/AdminDashboard').then(mod => mod.AdminDashboard), { 
  loading: () => <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>,
  ssr: false 
});

const DriverDashboard = dynamic(() => import('@/components/dashboard/DriverDashboard').then(mod => mod.DriverDashboard), { 
  loading: () => <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>,
  ssr: false 
});

function LoginPageContent() {
  const {
    appDisplayState,
    isLoading,
    initializationError,
    user,
    email,
    setEmail,
    password,
    setPassword,
    handleSignIn,
    handleSignUp,
    handleStartTrial,
    setActiveTab,
    setPreviewRole,
  } = useApp();

  const searchParams = useSearchParams();
  const router = useRouter();

  // If already authenticated and not in an auth state, redirect to /dashboard
  useEffect(() => {
    if (!isLoading && appDisplayState !== 'auth' && appDisplayState !== 'loading' && user) {
      router.replace('/dashboard');
    }
  }, [appDisplayState, isLoading, user, router]);

  useEffect(() => {
    const queryTab = searchParams.get('tab');
    const viewParam = searchParams.get('view') || searchParams.get('role');
    if (viewParam === 'driver') {
      setPreviewRole('driver');
    } else if (viewParam === 'admin' || viewParam === 'owner' || viewParam === 'exit') {
      setPreviewRole(null);
    }

    if (queryTab) {
      setActiveTab(queryTab);
    }
  }, [searchParams, setActiveTab, setPreviewRole]);

  if (appDisplayState === 'loading' || isLoading) {
    return <BrandSplashScreen message="Loading PayloadLogic..." error={initializationError} />;
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

  if (appDisplayState === 'onboarding' && user) {
    return <OnboardingWizard />;
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

  if (appDisplayState === 'admin_dashboard' && user && ['admin', 'owner', 'company_admin'].includes(user.role ?? '')) {
    return <AdminDashboard />;
  }

  if (appDisplayState === 'driver_dashboard' && user && user.role === 'driver') {
    return <DriverDashboard />;
  }

  return <BrandSplashScreen message="Accessing dashboard..." />;
}

export default function LoginPage() {
  return (
    <Suspense fallback={<BrandSplashScreen message="Loading..." />}>
      <LoginPageContent />
    </Suspense>
  );
}
