'use client';

import React from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

export interface PayloadLogicLogoProps {
  variant?: 'full' | 'horizontal' | 'icon' | 'compact';
  showTagline?: boolean;
  className?: string;
  iconSize?: number;
  priority?: boolean;
}

export function PayloadLogicLogo({
  variant = 'compact',
  showTagline = false,
  className,
  iconSize = 36,
  priority = false,
}: PayloadLogicLogoProps) {
  if (variant === 'full') {
    return (
      <div className={cn("inline-flex items-center gap-3 select-none", className)}>
        <div 
          className="relative rounded-2xl overflow-hidden shadow-xl shadow-black/40 shrink-0 border border-white/10"
          style={{ width: iconSize * 1.5, height: iconSize * 1.5 }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/app-icon.png"
            alt="PayloadLogic Truck Icon"
            width={iconSize * 3}
            height={iconSize * 3}
            className="w-full h-full object-cover"
            onError={(e) => {
              // Graceful fallback to icons/icon-192x192.png if needed
              (e.currentTarget as HTMLImageElement).src = '/icons/icon-192x192.png';
            }}
          />
        </div>
        <div className="flex flex-col text-left leading-none">
          <span className="font-extrabold tracking-tight text-white flex items-center text-2xl sm:text-3xl font-headline">
            Payload<span className="text-[#ffbe24]">Logic</span>
          </span>
          <span className="text-[10px] sm:text-xs uppercase tracking-wider font-semibold text-slate-400 mt-1">
            Dispatch Software for Hotshot Trucking
          </span>
        </div>
      </div>
    );
  }

  if (variant === 'horizontal') {
    return (
      <div className={cn("inline-flex items-center gap-2.5 select-none", className)}>
        <div 
          className="relative rounded-xl overflow-hidden shadow-md shadow-black/40 shrink-0 border border-white/10"
          style={{ width: iconSize, height: iconSize }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/app-icon.png"
            alt="PayloadLogic Truck Icon"
            width={iconSize * 2}
            height={iconSize * 2}
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = '/icons/icon-192x192.png';
            }}
          />
        </div>
        <div className="flex flex-col text-left leading-none">
          <span className="font-extrabold tracking-tight text-white flex items-center text-xl sm:text-2xl font-headline">
            Payload<span className="text-[#ffbe24]">Logic</span>
          </span>
          <span className="text-[9px] uppercase tracking-wider font-semibold text-slate-400 mt-0.5">
            Hotshot Trucking TMS
          </span>
        </div>
      </div>
    );
  }

  if (variant === 'icon') {
    return (
      <div 
        className={cn("relative rounded-xl overflow-hidden shadow-lg select-none shrink-0 border border-white/10", className)}
        style={{ width: iconSize, height: iconSize }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/app-icon.png"
          alt="PayloadLogic Truck Icon"
          width={iconSize * 2}
          height={iconSize * 2}
          className="w-full h-full object-cover"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src = '/icons/icon-192x192.png';
          }}
        />
      </div>
    );
  }

  // 'compact' variant: app icon + white 'Payload' + yellow 'Logic'
  return (
    <div className={cn("inline-flex items-center gap-2.5 select-none", className)}>
      <div 
        className="relative rounded-xl overflow-hidden shadow-md shadow-black/40 shrink-0 border border-white/10"
        style={{ width: iconSize, height: iconSize }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/app-icon.png"
          alt="PayloadLogic Truck Icon"
          width={iconSize * 2}
          height={iconSize * 2}
          className="w-full h-full object-cover"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src = '/icons/icon-192x192.png';
          }}
        />
      </div>
      <div className="flex flex-col leading-none text-left">
        <span className="font-extrabold tracking-tight text-white flex items-center text-lg sm:text-xl font-headline">
          Payload<span className="text-[#ffbe24]">Logic</span>
        </span>
        {showTagline && (
          <span className="text-[9px] uppercase tracking-wider font-semibold text-slate-400 mt-0.5">
            Dispatch Software
          </span>
        )}
      </div>
    </div>
  );
}
