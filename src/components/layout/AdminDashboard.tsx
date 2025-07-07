
'use client';
import React from 'react';
import { useApp } from '@/context/AppContext';
import { AppHeader } from '@/components/layout/AppHeader';
import { AppNav } from '@/components/layout/AppNav';
import { AppFooter } from '@/components/layout/AppFooter';
import { DashboardPage } from '@/components/dashboard/DashboardPage';
import { LoadsPage } from '@/components/loads/LoadsPage';
import { ExpensesPage } from '@/components/expenses/ExpensesPage';
import { ClientsPage } from '@/components/clients/ClientsPage';
import { SettingsPage } from '@/components/settings/SettingsPage';
import { LayoutDashboard, Package, DollarSign, Users, Cog } from 'lucide-react';

const navTabs = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'loads', label: 'Loads', icon: Package },
    { id: 'expenses', label: 'Expenses', icon: DollarSign },
    { id: 'clients', label: 'Clients', icon: Users },
    { id: 'settings', label: 'Settings', icon: Cog },
];

export function AdminDashboard() {
    const { user, handleSignOut, activeTab, setActiveTab } = useApp();

    return (
        <div className="min-h-screen flex flex-col bg-background">
            <AppHeader userEmail={user?.email} onSignOut={handleSignOut} />
            <AppNav activeTab={activeTab} setActiveTab={setActiveTab} tabs={navTabs} />
            <main className="flex-grow container mx-auto py-6 px-4 md:px-0">
                {activeTab === 'dashboard' && <DashboardPage />}
                {activeTab === 'loads' && <LoadsPage />}
                {activeTab === 'expenses' && <ExpensesPage />}
                {activeTab === 'clients' && <ClientsPage />}
                {activeTab === 'settings' && <SettingsPage />}
            </main>
            <AppFooter />
        </div>
    );
}
