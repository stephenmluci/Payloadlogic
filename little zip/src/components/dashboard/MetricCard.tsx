import React from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, ArrowRight } from 'lucide-react';

type MetricCardProps = {
  title: string;
  value: string | number;
  icon?: React.ReactNode;
  className?: string;
  valueClassName?: string;
  changeText?: string;
  isPositive?: boolean | null;
  variant?: 'revenue' | 'expenses' | 'profit' | 'loads';
  /** Makes the whole card a button that navigates somewhere useful. */
  onClick?: () => void;
  /** Short hint shown on hover/focus, e.g. "View loads". */
  actionLabel?: string;
  /** When true, the raw value is replaced with a muted placeholder and `emptyHint` guides the next step. */
  isEmpty?: boolean;
  emptyHint?: string;
  /** Gives the number extra visual weight (used for the headline metrics). */
  emphasis?: boolean;
};

export function MetricCard({
  title,
  value,
  icon,
  className,
  valueClassName,
  changeText,
  isPositive = true,
  variant = 'revenue',
  onClick,
  actionLabel,
  isEmpty = false,
  emptyHint,
  emphasis = false,
}: MetricCardProps) {

  const variantStyles = {
    revenue: "bg-blue-100 text-blue-600",
    expenses: "bg-red-100 text-red-600",
    profit: "bg-emerald-100 text-emerald-600",
    loads: "bg-amber-100 text-amber-600"
  };

  const interactive = typeof onClick === 'function';

  const body = (
    <>
      <div className="flex justify-between items-start mb-2 sm:mb-4 gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] sm:text-sm font-semibold text-slate-400 uppercase tracking-wider truncate">{title}</div>
          <div
            className={cn(
              "font-bold mt-1 sm:mt-2 truncate",
              emphasis ? "text-2xl sm:text-4xl tracking-tight" : "text-lg sm:text-3xl",
              isEmpty ? "text-slate-400 font-semibold" : "text-slate-800",
              !isEmpty && valueClassName
            )}
          >
            {isEmpty && (value === undefined || value === null || value === '') ? '$0' : value}
          </div>
        </div>
        {icon && (
          <div className={cn("w-8 h-8 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center text-sm sm:text-xl shrink-0 mt-0.5", variantStyles[variant])}>
            {icon}
          </div>
        )}
      </div>

      {isEmpty && emptyHint ? (
        <p className="text-[11px] sm:text-sm font-medium text-slate-500 leading-snug">{emptyHint}</p>
      ) : changeText && (
        <div className={cn(
          "flex items-center gap-1 text-[11px] sm:text-sm font-medium mt-1 truncate",
          isPositive === null ? "text-slate-400" : (isPositive ? "text-emerald-500" : "text-red-500")
        )}>
          {isPositive !== null && (
            isPositive
              ? <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4 shrink-0" />
              : <TrendingDown className="h-3 w-3 sm:h-4 sm:w-4 shrink-0" />
          )}
          <span className="truncate">{changeText}</span>
        </div>
      )}

      {interactive && actionLabel && (
        <div className="mt-3 flex items-center gap-1 text-[11px] sm:text-xs font-semibold text-blue-600 opacity-70 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          {actionLabel} <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
        </div>
      )}
    </>
  );

  const baseClasses = "p-4 sm:p-6 rounded-2xl shadow-sm border-none transition-all bg-white flex flex-col justify-between";

  if (interactive) {
    return (
      <Card
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(); }
        }}
        className={cn(baseClasses, "group cursor-pointer hover:-translate-y-1 hover:shadow-md outline-none focus-visible:ring-2 focus-visible:ring-blue-400", className)}
      >
        {body}
      </Card>
    );
  }

  return <Card className={cn(baseClasses, "hover:-translate-y-1", className)}>{body}</Card>;
}
