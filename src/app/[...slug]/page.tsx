'use client';

import React, { useEffect, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useApp } from '@/context/AppContext';
import { Loader2 } from 'lucide-react';
import { useSearchParams, useParams, useRouter } from 'next/navigation';
import { BrandSplashScreen } from '@/components/brand/BrandSplashScreen';

const SubscriptionPage = dynamic(() => import('@/components/subscription/SubscriptionPage').then(mod => mod.SubscriptionPage), { 
  loading: () => <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>,
  ssr: false 
});

const OnboardingWizard = dynamic(() => import('@/components/onboarding/OnboardingWizard').then(mod => mod.OnboardingWizard), { 
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

const DriverDashboard = dynamic(() => import('@/components/dashboard/DriverDashboard').then(mod => mod.DriverDashboard), { 
  loading: () => <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>,
  ssr: false 
});

function DashboardSlugContent() {
  const {
    appDisplayState,
    isLoading,
    initializationError,
    user,
    handleStartTrial,
    setActiveTab,
    setPreviewRole,
  } = useApp();

  const searchParams = useSearchParams();
  const params = useParams();
  const router = useRouter();

  // Redirect unauthenticated users to saved Driver View magic link (if driver) or /login
  useEffect(() => {
    if (!isLoading && appDisplayState === 'auth') {
      if (typeof window !== 'undefined') {
        try {
          const savedRole = localStorage.getItem('payloadlogic_pwa_role');
          const savedToken = localStorage.getItem('payloadlogic_driver_portal_token');
          if (savedRole === 'driver' && savedToken) {
            router.replace(`/driver-portal/${encodeURIComponent(savedToken)}`);
            return;
          }
        } catch {
          // Non-fatal
        }
      }
      router.replace('/login');
    }
  }, [appDisplayState, isLoading, router]);

  // Depend on stable string keys, not the searchParams/params object identities.
  // history.pushState (used for in-app back-button support) makes Next.js hand out
  // fresh objects, which would otherwise re-run this effect and force the tab back.
  const searchKey = searchParams.toString();
  const slugKey = JSON.stringify(params?.slug ?? '');

  useEffect(() => {
    const queryTab = searchParams.get('tab');
    
    // 2. Check for tab in URL slug
    const slug = params?.slug;
    const pathSlug = Array.isArray(slug) ? slug[0] : slug;

    // Ignore static file extensions if matched by catch-all
    if (typeof pathSlug === 'string' && /\.[a-z0-9]+$/i.test(pathSlug)) {
      return;
    }

    const slugToTabMap: Record<string, string> = {
      'dashboard': 'dashboard',
      'operations': 'operations',
      'command-center': 'operations',
      'load-management': 'loads',
      'drivers-fleet': 'drivers',
      'expense-tracking': 'expenses',
      'client-portal': 'clients',
      'client-management': 'clients',
      'settings': 'settings'
    };

    const viewParam = searchParams.get('view') || searchParams.get('role');
    if (viewParam === 'driver' || pathSlug === 'driver' || pathSlug === 'driver-view') {
      setPreviewRole('driver');
    } else if (viewParam === 'admin' || viewParam === 'owner' || viewParam === 'exit') {
      setPreviewRole(null);
    }

    const targetTab = queryTab || slugToTabMap[pathSlug as string] || (appDisplayState === 'admin_dashboard' ? 'dashboard' : null);

    if (targetTab) {
      setActiveTab(targetTab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchKey, slugKey, setActiveTab, setPreviewRole, appDisplayState]);

  if (appDisplayState === 'loading' || isLoading) {
    return <BrandSplashScreen message="Loading PayloadLogic..." error={initializationError} />;
  }

  if (appDisplayState === 'auth') {
    return <BrandSplashScreen message="Redirecting to login..." />;
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

  return <BrandSplashScreen message="Initializing..." />;
}

export default function DashboardSlugPage() {
  return (
    <Suspense fallback={<BrandSplashScreen message="Loading..." />}>
      <DashboardSlugContent />
    </Suspense>
  );
}
