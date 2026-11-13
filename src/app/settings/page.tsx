'use client';

import React, { useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import { AppHeader } from '@/components/layout/AppHeader';
import { AppNav } from '@/components/layout/AppNav';
import { AppFooter } from '@/components/layout/AppFooter';
import { SettingsPage } from '@/components/settings/SettingsPage';
import { LayoutDashboard, Package, DollarSign, Users, Cog, Loader2, Truck, Radar, CreditCard } from 'lucide-react';
import { useRouter } from 'next/navigation';

const navTabs = [
    { id: 'dashboard',  label: 'Dashboard',             icon: LayoutDashboard },
    { id: 'operations', label: 'Driver Command Center', icon: Radar },
    { id: 'loads',      label: 'Load Management',       icon: Package },
    { id: 'drivers',    label: 'Drivers & Fleet',       icon: Truck },
    { id: 'expenses',   label: 'Expense Tracking',      icon: DollarSign },
    { id: 'clients',    label: 'Client Management',     icon: Users },
    { id: 'settings',   label: 'System Settings',       icon: Cog },
    { id: 'billing',    label: 'Billing & Plan',        icon: CreditCard },
];

export default function SettingsRoute() {
  const { user, handleSignOut, setActiveTab, appDisplayState } = useApp();
  const router = useRouter();

  // Force the active tab state to 'settings' when on this route
  useEffect(() => {
    setActiveTab('settings');
  }, [setActiveTab]);

  useEffect(() => {
    if (appDisplayState === 'auth') {
      router.push('/login');
    }
  }, [appDisplayState, router]);

  if (appDisplayState === 'loading') {
    return (
        <div className="min-h-screen flex items-center justify-center bg-[#f8fafc]">
            <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
        </div>
    );
  }

  if (appDisplayState === 'auth') {
    return (
        <div className="min-h-screen flex items-center justify-center bg-[#f8fafc]">
            <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
        </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#f8fafc]">
        <AppHeader userEmail={user?.email} onSignOut={handleSignOut} />
        <div className="flex flex-1 relative">
            <AppNav 
                activeTab="settings" 
                setActiveTab={(tab) => {
                    if (tab === 'settings') return;
                    // Navigate back to main dashboard with the selected tab
                    router.push(`/?tab=${tab}`);
                }} 
                tabs={navTabs} 
            />
            <main className="flex-1 p-4 md:p-8 lg:p-12">
                <div className="max-w-7xl mx-auto">
                    <SettingsPage />
                </div>
            </main>
        </div>
        <AppFooter />
    </div>
  );
}
