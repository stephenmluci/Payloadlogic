'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { useApp } from '@/context/AppContext';
import { HelpCircle, Lock, Menu, X, LogOut, ChevronRight, Layers } from 'lucide-react';

interface Tab {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface AppNavProps {
  activeTab: string;
  setActiveTab: (tabId: string) => void;
  tabs: Tab[];
}

export function AppNav({ activeTab, setActiveTab, tabs }: AppNavProps) {
  const { subscriptionTier, openHelpTopic, trial, handleSignOut } = useApp();
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const isStarter = subscriptionTier === 'starter';
  const isTrialRestricted = trial?.isRestricted;

  // Primary mobile tabs (first 4 daily operations)
  const primaryTabIds = ['dashboard', 'operations', 'loads', 'expenses'];
  const primaryTabs = tabs.filter(t => primaryTabIds.includes(t.id));
  const moreTabs = tabs.filter(t => !primaryTabIds.includes(t.id));
  const isMoreActive = moreTabs.some(t => t.id === activeTab);
  const activeMoreTab = moreTabs.find(t => t.id === activeTab);

  const handleTabClick = (tabId: string) => {
    setActiveTab(tabId);
    setIsMoreOpen(false);
  };

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-white border-r border-slate-200 shrink-0 py-6 px-4 select-none min-h-[calc(100vh-73px)] sticky top-[73px]">
        <div className="flex-1 space-y-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const isProGated = tab.id === 'operations' && isStarter;
            const isTabRestricted = isTrialRestricted && tab.id !== 'billing';

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 group relative overflow-hidden",
                  isActive 
                    ? "bg-blue-50 text-blue-700 shadow-sm border-l-4 border-blue-600 animate-fade-in" 
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-50 border-l-4 border-transparent",
                  isTabRestricted && !isActive && "text-slate-400 hover:text-slate-600"
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Icon 
                    className={cn(
                      "h-5 w-5 transition-transform duration-200 shrink-0",
                      isActive 
                        ? "text-blue-600" 
                        : isTabRestricted
                        ? "text-slate-300"
                        : "text-slate-400 group-hover:text-slate-600 group-hover:scale-105"
                    )} 
                  />
                  <span className="truncate">{tab.label}</span>
                </div>
                {isProGated && !isTrialRestricted && (
                  <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 border border-amber-200/80 shrink-0 ml-1.5">
                    PRO
                  </span>
                )}
                {isTabRestricted && (
                  <Lock className="h-3.5 w-3.5 text-amber-500/80 shrink-0 ml-1.5" />
                )}
                {isTrialRestricted && tab.id === 'billing' && (
                  <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded-md bg-blue-100 text-blue-800 border border-blue-200/80 shrink-0 ml-1.5 animate-pulse">
                    PICK PLAN
                  </span>
                )}
                {isActive && (
                  <div className="absolute right-0 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-500 to-blue-700 rounded-l-md" />
                )}
              </button>
            );
          })}
        </div>

        {/* In-App Help Trigger */}
        <div className="pt-3 mt-auto border-t border-slate-100">
          <button
            type="button"
            onClick={() => openHelpTopic('setup')}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-blue-700 hover:bg-blue-50/70 transition-all group"
          >
            <HelpCircle className="h-4 w-4 text-slate-400 group-hover:text-blue-600 transition-colors" />
            <span>Help &amp; Quick Guides</span>
          </button>
        </div>
      </aside>

      {/* Mobile Bottom Navigation Bar (4 Core Ops + More Drawer) */}
      <nav 
        className="md:hidden fixed bottom-0 left-0 right-0 w-full bg-white/95 backdrop-blur-md border-t border-slate-200 flex items-center justify-between px-2 py-1.5 z-40 shadow-xl" 
        style={{ paddingBottom: 'max(0.6rem, env(safe-area-inset-bottom))' }}
      >
        {primaryTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const shortLabel = 
            tab.id === 'dashboard' ? 'Overview' :
            tab.id === 'operations' ? 'Live Ops' :
            tab.id === 'loads' ? 'Loads' :
            tab.id === 'expenses' ? 'Expenses' : tab.label.split(' ')[0];

          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              title={tab.label}
              className={cn(
                "flex-1 flex flex-col items-center justify-center min-h-[50px] py-1 px-1 rounded-xl transition-all duration-150 text-[11px] font-bold relative active:scale-95",
                isActive 
                  ? "text-blue-700 bg-blue-50/90 shadow-xs" 
                  : "text-slate-500 hover:text-slate-800 hover:bg-slate-50/80"
              )}
            >
              <Icon 
                className={cn(
                  "h-5 w-5 shrink-0 transition-transform duration-150",
                  isActive ? "text-blue-600 scale-110" : "text-slate-400"
                )} 
              />
              <span className="text-[10px] leading-tight mt-1 font-semibold truncate max-w-[62px]">
                {shortLabel}
              </span>
              {isActive && (
                <span className="absolute top-1 right-2 w-1.5 h-1.5 rounded-full bg-blue-600" />
              )}
            </button>
          );
        })}

        {/* 5th Tab: More Button that toggles the Bottom Sheet */}
        <button
          onClick={() => setIsMoreOpen(prev => !prev)}
          title="More Navigation Options"
          aria-label="More navigation options"
          className={cn(
            "flex-1 flex flex-col items-center justify-center min-h-[50px] py-1 px-1 rounded-xl transition-all duration-150 text-[11px] font-bold relative active:scale-95",
            isMoreActive || isMoreOpen
              ? "text-blue-700 bg-blue-50/90 shadow-xs" 
              : "text-slate-500 hover:text-slate-800 hover:bg-slate-50/80"
          )}
        >
          {isMoreOpen ? (
            <X className="h-5 w-5 shrink-0 text-blue-600" />
          ) : (
            <Menu className={cn("h-5 w-5 shrink-0 transition-transform duration-150", isMoreActive ? "text-blue-600 scale-110" : "text-slate-400")} />
          )}
          <span className="text-[10px] leading-tight mt-1 font-semibold truncate max-w-[62px]">
            {isMoreActive && activeMoreTab ? activeMoreTab.label.split(' ')[0] : 'More'}
          </span>
          {isMoreActive && (
            <span className="absolute top-1 right-2 w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
          )}
        </button>
      </nav>

      {/* Mobile "More" Drawer / Bottom Sheet */}
      {isMoreOpen && (
        <div 
          className="md:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex flex-col justify-end animate-in fade-in duration-200"
          onClick={() => setIsMoreOpen(false)}
        >
          <div 
            className="w-full bg-white rounded-t-3xl border-t border-slate-200 shadow-2xl p-4 sm:p-6 space-y-4 max-h-[80vh] overflow-y-auto animate-in slide-in-from-bottom duration-250"
            onClick={(e) => e.stopPropagation()}
            style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
          >
            {/* Sheet Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-base text-slate-900">Fleet Navigation &amp; Tools</h3>
                <p className="text-xs text-slate-500">Access all management features</p>
              </div>
              <button
                onClick={() => setIsMoreOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Menu items */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {moreTabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                const isTabRestricted = isTrialRestricted && tab.id !== 'billing';

                return (
                  <button
                    key={tab.id}
                    onClick={() => handleTabClick(tab.id)}
                    className={cn(
                      "w-full flex items-center justify-between p-3.5 rounded-2xl border transition-all text-left",
                      isActive
                        ? "bg-blue-50/80 border-blue-300 text-blue-700 font-bold shadow-xs"
                        : "bg-slate-50/70 hover:bg-slate-100/80 border-slate-200 text-slate-700 font-medium"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
                        isActive ? "bg-blue-600 text-white" : "bg-white text-slate-600 border border-slate-200"
                      )}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <span className="text-sm font-semibold">{tab.label}</span>
                    </div>
                    {isTabRestricted ? (
                      <Lock className="h-4 w-4 text-amber-500/80 shrink-0" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* In-Drawer Quick Actions */}
            <div className="pt-2 border-t border-slate-100 space-y-2">
              <button
                type="button"
                onClick={() => {
                  setIsMoreOpen(false);
                  openHelpTopic('setup');
                }}
                className="w-full flex items-center justify-between p-3 rounded-2xl bg-amber-50/60 border border-amber-200/80 text-amber-900 font-semibold text-xs"
              >
                <div className="flex items-center gap-2.5">
                  <HelpCircle className="h-4 w-4 text-amber-600 shrink-0" />
                  <span>Help &amp; Quick Guides</span>
                </div>
                <ChevronRight className="h-4 w-4 text-amber-500 shrink-0" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsMoreOpen(false);
                  handleSignOut();
                }}
                className="w-full flex items-center justify-center gap-2 p-3.5 rounded-2xl bg-red-50 hover:bg-red-100 text-red-600 hover:text-red-700 border border-red-200 font-bold text-sm transition-all"
              >
                <LogOut className="h-4 w-4" />
                <span>Sign Out of PayloadLogic</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}