'use client';

import React from 'react';
import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LocationDisclaimerNoticeProps {
  className?: string;
  variant?: 'banner' | 'badge' | 'inline' | 'overlay';
}

/**
 * Compliance Disclaimer Notice:
 * Informs dispatchers and drivers that displayed positions are calculated approximations
 * rather than live hardware GPS broadcasts.
 */
export function LocationDisclaimerNotice({
  className,
  variant = 'banner',
}: LocationDisclaimerNoticeProps) {
  const text = 'Approximate location only — not live GPS. Position is estimated from vehicle speed and mileage.';

  if (variant === 'badge') {
    return (
      <span
        role="note"
        aria-label="Location tracking disclaimer"
        className={cn(
          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium leading-tight',
          'bg-amber-500/15 text-amber-200 border border-amber-500/30 backdrop-blur-xs',
          className
        )}
      >
        <Info className="h-3.5 w-3.5 text-amber-400 shrink-0" aria-hidden="true" />
        <span>{text}</span>
      </span>
    );
  }

  if (variant === 'overlay') {
    return (
      <div
        role="note"
        aria-label="Location tracking disclaimer"
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-medium leading-snug',
          'bg-slate-950/85 text-amber-200 border border-amber-500/30 shadow-md backdrop-blur-md',
          className
        )}
      >
        <Info className="h-3.5 w-3.5 text-amber-400 shrink-0" aria-hidden="true" />
        <span>{text}</span>
      </div>
    );
  }

  if (variant === 'inline') {
    return (
      <p
        role="note"
        aria-label="Location tracking disclaimer"
        className={cn(
          'text-xs text-amber-700 dark:text-amber-300 flex items-center gap-1.5 font-medium',
          className
        )}
      >
        <Info className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" aria-hidden="true" />
        <span>{text}</span>
      </p>
    );
  }

  // Default 'banner' variant: clean, professional, non-intrusive alert banner
  return (
    <div
      role="note"
      aria-label="Location tracking disclaimer"
      className={cn(
        'flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium leading-snug',
        'bg-amber-50/90 text-amber-900 border border-amber-200/90 shadow-2xs dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-500/30',
        className
      )}
    >
      <div className="h-5 w-5 rounded-md bg-amber-500/20 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
      </div>
      <p className="flex-1 text-[11px] sm:text-xs text-amber-900 dark:text-amber-200">
        <span className="font-semibold text-amber-950 dark:text-amber-100">Notice:</span>{' '}
        {text}
      </p>
    </div>
  );
}
