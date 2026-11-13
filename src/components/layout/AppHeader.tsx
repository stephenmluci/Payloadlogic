import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Bell, Package, Info, ChevronRight, HelpCircle, LogOut, User as UserIcon, Cog, Truck, Eye, EyeOff, Sparkles } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useApp } from '@/context/AppContext';
import { RoleToggle } from '@/components/layout/RoleToggle';
import { PayloadLogicLogo } from '@/components/brand/PayloadLogicLogo';



type AppHeaderProps = {
  userEmail: string | null | undefined;
  onSignOut: () => void;
};

export function AppHeader({ userEmail, onSignOut }: AppHeaderProps) {
  const userInitials = userEmail ? userEmail.substring(0, 2).toUpperCase() : 'JD';
  const userName = userEmail ? userEmail.split('@')[0] : 'User';

  const { clientLoadRequests, setActiveTab, activeTab, goBackInApp, setViewClientRequestId, user, openHelpTopic, previewRole, setPreviewRole } = useApp();

  // Role-aware subtitle shown next to the avatar
  const roleLabel =
    !user ? 'Guest' :
    (user.role === 'owner' || user.role === 'admin' || user.role === 'company_admin') ? 'Owner · Dispatcher' :
    user.role === 'client' ? 'Client' :
    user.role === 'driver' ? 'Driver' : 'Owner · Dispatcher';

  const pendingRequests = clientLoadRequests.filter(req => req.status === 'new' || req.status === 'in_review');
  const notificationCount = pendingRequests.length;

  return (
    <header className="w-full bg-[#0c141f] border-b border-white/10 text-white shadow-md sticky top-0 z-[100] px-3 sm:px-6 md:px-8 py-2.5 sm:py-3 flex items-center justify-between">
      <div className="flex items-center gap-1 min-w-0">
        {activeTab !== 'dashboard' && (<button type="button" onClick={goBackInApp} aria-label="Back" title="Back" className="h-9 w-9 shrink-0 inline-flex items-center justify-center rounded-full hover:bg-white/10 text-white"><ArrowLeft className="h-5 w-5" /></button>)}
        <PayloadLogicLogo variant="compact" iconSize={32} />
      </div>

      <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
        {/* Help & Guides Center Button (Desktop / Tablet) */}
        <Link
          href="/help"
          className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 sm:px-3 h-9 rounded-xl border border-white/20 hover:border-[#ffbe24]/50 bg-white/5 hover:bg-[#ffbe24]/10 text-white hover:text-[#ffbe24] transition-all shadow-xs"
          title="Open Help & Guides Center"
        >
          <HelpCircle className="h-4 w-4 text-[#ffbe24]" />
          <span>Help &amp; Guides</span>
        </Link>

        <Popover>
          <PopoverTrigger asChild>
            <div className="relative cursor-pointer hover:bg-white/10 p-1.5 sm:p-2 rounded-full transition-all group">
              <Bell className="h-5 w-5 sm:h-6 sm:w-6 transition-transform group-hover:rotate-12" />
              {notificationCount > 0 && (
                <span className="absolute top-0.5 right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center border-2 border-[#0c141f] animate-pulse">
                  {notificationCount}
                </span>
              )}
            </div>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0 overflow-hidden border-blue-100 z-[150]" align="end">
            <div className="bg-blue-50 px-4 py-3 border-b border-blue-100 flex items-center justify-between">
              <span className="font-bold text-sm text-blue-900">Notifications</span>
              <span className="text-[10px] bg-blue-200 text-blue-800 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                {notificationCount} Pending
              </span>
            </div>
            <div className="max-h-[300px] overflow-y-auto">
              {pendingRequests.length > 0 ? (
                <div className="divide-y divide-slate-50">
                  {pendingRequests.map(req => (
                    <div 
                      key={req.id} 
                      className="p-4 hover:bg-slate-50 cursor-pointer transition-colors group"
                      onClick={() => {
                        setViewClientRequestId(req.id!);
                        setActiveTab('loads');
                      }}
                    >
                      <div className="flex gap-3">
                        <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center shrink-0">
                          <Package className="h-4 w-4 text-blue-600" />
                        </div>
                        <div className="flex-1">
                          <div className="text-[11px] font-bold text-slate-900 flex items-center justify-between">
                            <span className="flex items-center gap-1.5">
                              {req.status === 'in_review' ? 'In Review' : 'New Load Request'}
                              {req.status === 'in_review' && (
                                <span className="bg-amber-100 text-amber-800 text-[9px] px-1 py-0.5 rounded font-semibold">
                                  Reviewing
                                </span>
                              )}
                            </span>
                            <span className="font-normal text-slate-400">#{req.id ? req.id.substring(0, 5) : ''}</span>
                          </div>
                          <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                            {req.requestedByClientName || req.requestContactName || (req as any).clientEmail || 'Client'} wants to ship cargo.
                          </p>
                          <div className="flex items-center text-[10px] text-blue-600 font-bold mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            View Details <ChevronRight className="h-3 w-3 ml-0.5" />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center">
                  <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Bell className="h-6 w-6 text-slate-300" />
                  </div>
                  <p className="text-xs text-slate-500">No pending notifications</p>
                </div>
              )}
            </div>
            <div 
              className="bg-slate-50 p-3 text-center border-t border-slate-100 hover:bg-slate-100 cursor-pointer transition-colors"
              onClick={() => {
                setViewClientRequestId('all');
                setActiveTab('loads');
              }}
            >
              <span className="text-[11px] font-bold text-blue-700">View All Client Requests</span>
            </div>
          </PopoverContent>
        </Popover>

        {/* Driver View preview toggle — admin only, visible on sm and up */}
        <div className="hidden sm:block">
          <RoleToggle />
        </div>

        {userEmail && (
          <div className="flex items-center gap-1.5 sm:gap-3">
            {/* Desktop user text label */}
            <div className="flex-col items-end hidden md:flex leading-tight">
              <div className="text-sm font-semibold text-white truncate max-w-[140px]">{userName}</div>
              <div className="text-[11px] text-slate-400">{roleLabel}</div>
            </div>

            {/* Always-accessible Mobile & Desktop Direct Sign Out Button */}
            <Button 
              variant="ghost" 
              size="sm"
              onClick={onSignOut} 
              className="text-red-400 hover:text-red-300 hover:bg-red-500/15 border border-red-500/30 rounded-xl h-8 sm:h-9 px-2 sm:px-3 flex items-center gap-1 font-bold text-xs transition-all shadow-xs"
              title="Sign Out of PayloadLogic"
              aria-label="Sign Out"
            >
              <LogOut className="h-3.5 w-3.5 shrink-0 text-red-400" />
              <span className="inline text-xs font-bold">Sign Out</span>
            </Button>

            {/* User Profile Avatar with Dropdown Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-emerald-400 to-blue-500 flex items-center justify-center font-bold text-xs sm:text-sm border-2 border-white/20 hover:border-[#ffbe24] transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-[#ffbe24]"
                  title={`User Menu (${userName})`}
                  aria-label="User profile menu"
                >
                  {userInitials}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64 bg-[#111d2e] border border-white/15 text-white shadow-2xl p-2 rounded-2xl z-[150]">
                <div className="px-3 py-2.5 border-b border-white/10">
                  <p className="font-bold text-sm text-white truncate">{userName}</p>
                  <p className="text-xs text-slate-400 truncate">{userEmail}</p>
                  <span className="inline-block mt-1.5 text-[10px] uppercase font-extrabold tracking-wider bg-blue-500/20 text-blue-300 border border-blue-400/30 px-2 py-0.5 rounded-full">
                    {roleLabel}
                  </span>
                </div>

                <div className="py-1">
                  {/* Mobile Driver View Toggle */}
                  {['admin', 'owner', 'company_admin'].includes(user?.role ?? '') && (
                    <DropdownMenuItem
                      onClick={() => setPreviewRole(previewRole === 'driver' ? null : 'driver')}
                      className="flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-200 hover:text-white hover:bg-white/10 rounded-xl cursor-pointer"
                    >
                      {previewRole === 'driver' ? (
                        <><EyeOff className="h-4 w-4 text-amber-400" /> Exit Driver View Preview</>
                      ) : (
                        <><Truck className="h-4 w-4 text-blue-400" /> Switch to Driver View</>
                      )}
                    </DropdownMenuItem>
                  )}

                  <DropdownMenuItem
                    onClick={() => setActiveTab('settings')}
                    className="flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-200 hover:text-white hover:bg-white/10 rounded-xl cursor-pointer"
                  >
                    <Cog className="h-4 w-4 text-slate-400" /> System Settings
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    asChild
                    className="flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-200 hover:text-white hover:bg-white/10 rounded-xl cursor-pointer"
                  >
                    <Link href="/help">
                      <HelpCircle className="h-4 w-4 text-[#ffbe24]" /> Help &amp; Guides Center
                    </Link>
                  </DropdownMenuItem>
                </div>

                <DropdownMenuSeparator className="bg-white/10 my-1" />

                <DropdownMenuItem
                  onClick={onSignOut}
                  className="flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-red-400 hover:text-red-300 hover:bg-red-500/20 rounded-xl cursor-pointer"
                >
                  <LogOut className="h-4 w-4 text-red-400" /> Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
    </header>
  );
}

