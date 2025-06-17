import React from 'react';
import { Button } from '@/components/ui/button';
import { LogOut, Truck } from 'lucide-react';

type AppHeaderProps = {
  userEmail: string | null | undefined;
  onSignOut: () => void;
};

export function AppHeader({ userEmail, onSignOut }: AppHeaderProps) {
  return (
    <header className="bg-primary text-primary-foreground shadow-md">
      <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-2">
          <Truck className="h-8 w-8" />
          <h1 className="text-2xl font-bold font-headline">Truckin' Smart Assist</h1>
        </div>
        {userEmail && (
          <div className="flex items-center space-x-4">
            <span className="text-sm hidden md:inline">Welcome, {userEmail}</span>
            <Button variant="ghost" size="icon" onClick={onSignOut} aria-label="Sign Out">
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
