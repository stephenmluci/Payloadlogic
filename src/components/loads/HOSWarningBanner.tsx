'use client';

import React from 'react';
import { AlertTriangle, Clock, ArrowRight } from 'lucide-react';
import { format as formatDate } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { HOSResult } from '@/lib/hosEngine';
import { toDateTimeLocal } from '@/lib/hosEngine';

type HOSWarningBannerProps = {
  hosResult: HOSResult | null;
  /**
   * When provided the "Update to Best Delivery Date" button is rendered.
   * Receives a datetime-local string ("YYYY-MM-DDTHH:MM") for the form input
   * or an ISO string for a Firestore updateDoc call, depending on context.
   */
  onUpdateDelivery?: (dateTimeLocalString: string) => void;
};

/**
 * Renders an amber HOS estimate banner + teal "Est. Best Delivery" pill when
 * the requested delivery date conflicts with the driver's available HOS hours
 * or would require a 72-hour reset.
 * Returns null when hosResult is null or no HOS schedule conflict is detected.
 */
export function HOSWarningBanner({ hosResult, onUpdateDelivery }: HOSWarningBannerProps) {
  if (!hosResult || hosResult.isFeasible) return null;

  const {
    totalTransitHours,
    totalDriveHours,
    averageSpeedMph,
    availableHosHours,
    exceedsAvailableHours,
    requiresReset,
    resetHours,
    restBreaksNeeded,
    totalRestHours,
    earliestDelivery,
    isInverted,
    pickupDate,
    requestedDeliveryDate,
    totalMiles,
  } = hosResult;

  const handleUpdate = () => {
    onUpdateDelivery?.(toDateTimeLocal(earliestDelivery));
  };

  const headline = requiresReset
    ? 'Estimated HOS Check: Trip may require a 72-hour reset.'
    : exceedsAvailableHours
      ? `Estimated HOS Check: Drive time (${totalDriveHours.toFixed(1)} hrs) exceeds available hours (${availableHosHours.toFixed(1)} hrs).`
      : `Estimated HOS Check: Estimated transit time is ${totalTransitHours.toFixed(1)} hours.`;

  return (
    <div className="space-y-2 my-3">
      {/* ── HOS Estimate Warning Banner ──────────────────────────────────── */}
      <div className="flex items-start gap-2.5 sm:gap-3 rounded-lg border-2 border-amber-400 bg-amber-50 px-3 py-2.5 sm:px-4 sm:py-3 shadow-sm">
        <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1 break-words">
          {isInverted ? (
            <>
              <p className="font-bold text-amber-800 text-xs sm:text-sm leading-snug">
                Invalid Schedule: Delivery time is set before pickup time.
              </p>
              <p className="text-amber-700 text-xs mt-1 leading-snug">
                Pickup is {formatDate(pickupDate, 'MMM d')} at {formatDate(pickupDate, 'h:mm a')},
                but Delivery is set to {formatDate(requestedDeliveryDate, 'MMM d')} at {formatDate(requestedDeliveryDate, 'h:mm a')}.
              </p>
            </>
          ) : (
            <>
              <p className="font-bold text-amber-800 text-xs sm:text-sm leading-snug">
                {headline}
              </p>
              <ul className="text-amber-700 text-xs mt-2 space-y-1 list-disc list-inside">
                <li>
                  <span className="font-semibold">Estimated Driving Time:</span>{' '}
                  {totalDriveHours.toFixed(1)} hrs ({totalMiles.toLocaleString()} mi &divide; {averageSpeedMph} mph)
                </li>
                <li>
                  <span className="font-semibold">Driver Available HOS:</span>{' '}
                  {availableHosHours.toFixed(1)} hrs
                  {exceedsAvailableHours
                    ? ` (exceeded by ${(totalDriveHours - availableHosHours).toFixed(1)} hrs)`
                    : ''}
                </li>
                {restBreaksNeeded > 0 && (
                  <li>
                    <span className="font-semibold">Estimated Rest Breaks:</span>{' '}
                    {totalRestHours} hrs ({restBreaksNeeded} &times; 10-hr rest)
                  </li>
                )}
                {requiresReset && (
                  <li>
                    <span className="font-semibold">Estimated 72-Hour Reset:</span>{' '}
                    {resetHours} hrs (trip exceeds 70-hr cycle)
                  </li>
                )}
              </ul>
              <p className="text-amber-800 text-xs mt-2 font-semibold leading-snug">
                Estimated Earliest Delivery: {formatDate(earliestDelivery, 'MMM d, yyyy, h:mm a')} ({totalTransitHours.toFixed(1)} hrs est. total).
              </p>
              <p className="text-amber-700/90 text-[11px] mt-1 leading-snug">
                Estimate only — verify on your certified ELD. Detention and facility free-time are separate and not included.
              </p>
            </>
          )}
        </div>
      </div>

      {/* ── Estimated Best Delivery pill + optional update button ─────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
        <Badge className="bg-teal-100 text-teal-800 border border-teal-300 hover:bg-teal-100 px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 rounded-lg sm:rounded-full pointer-events-none w-fit max-w-full whitespace-normal text-left">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          <span>
            Est. Delivery:&nbsp;
            <span className="font-bold">{formatDate(earliestDelivery, 'PPp')}</span>
          </span>
        </Badge>

        {onUpdateDelivery && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 sm:h-7 px-3 text-xs border-teal-400 text-teal-700 hover:bg-teal-50 hover:border-teal-500 w-full sm:w-auto justify-center"
            onClick={handleUpdate}
          >
            Update to Est. Delivery Date
            <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
