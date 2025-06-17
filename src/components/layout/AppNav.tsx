import React from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LayoutDashboard, Users, Cog, DollarSign, Package } from 'lucide-react'; // Changed icons

type AppNavProps = {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  tabs: { id: string; label: string; icon: React.ElementType }[];
};

export function AppNav({ activeTab, setActiveTab, tabs }: AppNavProps) {
  return (
    <nav className="bg-card shadow-sm sticky top-0 z-40">
      <div className="container mx-auto px-4 md:px-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 sm:grid-cols-5 h-auto py-1">
            {tabs.map(tab => (
              <TabsTrigger key={tab.id} value={tab.id} className="flex flex-col sm:flex-row items-center gap-2 py-2.5 data-[state=active]:shadow-md">
                <tab.icon className="h-5 w-5" />
                <span className="text-xs sm:text-sm">{tab.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
    </nav>
  );
}
