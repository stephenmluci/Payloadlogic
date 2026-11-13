
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
import { DriverFleetPage } from '@/components/fleet/DriverFleetPage';
import dynamic from 'next/dynamic';
import { LayoutDashboard, Package, DollarSign, Users, Cog, Truck, Radar, CreditCard } from 'lucide-react';
import { BillingPage } from '@/components/billing/BillingPage';
import { FleetFinancialSetupModal } from '@/components/onboarding/FleetFinancialSetupModal';
import { HelpGuidesDrawer } from '@/components/help/HelpGuidesDrawer';
import { TrialBanner, TrialExpiredNotice } from '@/components/billing/TrialStatus';

const LiveCommandCenter = dynamic(
  () => import('@/components/dashboard/LiveOperationsCommandCenter').then(m => m.LiveOperationsCommandCenter),
  { ssr: false }
);

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



export function AdminDashboard() {
    const { 
        user, 
        handleSignOut, 
        activeTab, 
        setActiveTab,
        isFinancialProfileComplete,
        isFleetFinancialModalOpen,
        setIsFleetFinancialModalOpen,
        isFleetSetupUserOpened,
        isHelpOpen,
        setIsHelpOpen,
        activeHelpTopic,
        trial,
        isOwnerOrAdmin,
    } = useApp();

    // The login-time setup prompt is only forced while setup is incomplete. Once complete it stays out of
    // the way (the dashboard shows a dismissible banner instead); users can still reopen it on purpose.
    // A short settle delay avoids a flash before fleet data has finished loading after login.
    const [gateReady, setGateReady] = React.useState(false);
    React.useEffect(() => {
        const t = setTimeout(() => setGateReady(true), 2000);
        return () => clearTimeout(t);
    }, []);
    const showSetupModal = isFleetFinancialModalOpen && (isFleetSetupUserOpened || (gateReady && !isFinancialProfileComplete));
    React.useEffect(() => {
        if (gateReady && isFleetFinancialModalOpen && isFinancialProfileComplete && !isFleetSetupUserOpened) {
            setIsFleetFinancialModalOpen(false);
        }
    }, [gateReady, isFleetFinancialModalOpen, isFinancialProfileComplete, isFleetSetupUserOpened, setIsFleetFinancialModalOpen]);

    return (
        <div className="min-h-screen flex flex-col bg-[#f8fafc] w-full max-w-[100vw] overflow-x-clip">
            <AppHeader userEmail={user?.email} onSignOut={handleSignOut} />
            {!isOwnerOrAdmin && <TrialBanner />}
            <div className="flex flex-1 relative w-full max-w-full overflow-x-clip">
                <AppNav activeTab={activeTab} setActiveTab={setActiveTab} tabs={navTabs} />
                <main className="flex-1 w-full max-w-full min-w-0 px-3.5 py-4 sm:px-6 sm:py-6 md:p-8 lg:p-12 pb-32 sm:pb-28 md:pb-12 overflow-x-clip">
                    <div className="max-w-7xl mx-auto w-full min-w-0">
                        {/* Trial ended with no plan chosen: only Billing & Plan stays usable. Data is untouched. */}
                        {!isOwnerOrAdmin && trial.isRestricted && activeTab !== 'billing' ? (
                            <TrialExpiredNotice />
                        ) : (
                        <>
                        {activeTab === 'dashboard'  && <DashboardPage />}
                        {activeTab === 'loads'      && <LoadsPage />}
                        {activeTab === 'expenses'   && <ExpensesPage />}
                        {activeTab === 'clients'    && <ClientsPage />}
                        {activeTab === 'drivers'    && <DriverFleetPage />}
                        {activeTab === 'settings'   && <SettingsPage />}
                        {activeTab === 'operations' && <LiveCommandCenter />}
                        {activeTab === 'billing'    && <BillingPage />}
                        </>
                        )}
                    </div>
                </main>
            </div>
            <AppFooter />

            {/* Mandatory Fleet Financial Setup Interceptor / Management Modal */}
            <FleetFinancialSetupModal
                isOpen={showSetupModal}
                isMandatory={!isFinancialProfileComplete}
                onClose={() => setIsFleetFinancialModalOpen(false)}
            />

            {/* In-App Help & Quick Guides Slide-Over Drawer */}
            <HelpGuidesDrawer
                isOpen={isHelpOpen}
                onClose={() => setIsHelpOpen(false)}
                initialTopic={activeHelpTopic}
            />
        </div>
    );
}
