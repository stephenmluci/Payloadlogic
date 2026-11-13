'use client';

import React from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PayloadLogicLogo } from './PayloadLogicLogo';

interface BrandSplashScreenProps {
  message?: string;
  error?: string | null;
  className?: string;
}

export function BrandSplashScreen({
  message = "Loading PayloadLogic...",
  error,
  className,
}: BrandSplashScreenProps) {
  return (
    <div 
      className={cn(
        "min-h-screen w-full flex flex-col items-center justify-center p-6 text-center select-none bg-[#0c141f] text-white relative overflow-hidden",
        className
      )}
    >
      {/* Background ambient radial glow */}
      <div 
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-blue-600/10 rounded-full blur-[140px] pointer-events-none" 
        aria-hidden="true" 
      />
      <div 
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[200px] bg-[#ffbe24]/5 rounded-full blur-[90px] pointer-events-none" 
        aria-hidden="true" 
      />

      <div className="relative z-10 flex flex-col items-center max-w-md w-full animate-fade-in">
        {/* Full official brand logo */}
        <div className="mb-8 flex justify-center">
          <PayloadLogicLogo variant="full" iconSize={44} priority />
        </div>

        {/* Loading indicator */}
        <div className="flex items-center gap-3 px-5 py-2.5 rounded-full bg-white/[0.04] border border-white/10 shadow-lg backdrop-blur-md">
          <Loader2 className="h-4 w-4 animate-spin text-[#ffbe24]" />
          <span className="text-xs sm:text-sm font-medium tracking-wide text-slate-300">
            {message}
          </span>
        </div>

        {/* Error message if any */}
        {error && (
          <div className="mt-6 max-w-sm w-full p-4 bg-red-950/60 border border-red-500/40 rounded-2xl text-xs text-red-200 text-left flex items-start gap-3 shadow-xl backdrop-blur-md">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-bold block text-red-300 mb-0.5">Initialization Error</span>
              <span className="leading-relaxed">{error}</span>
            </div>
          </div>
        )}
      </div>

      {/* Footer domain tag */}
      <div className="absolute bottom-6 text-[11px] font-semibold tracking-wider text-[#ffbe24]/60 uppercase">
        PayloadLogic.app
      </div>
    </div>
  );
}
