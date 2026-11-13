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
 * Renders an amber conflict banner + teal "Estimated Best Delivery" pill when
 * the requested delivery date is not achievable under FMCSA HOS limits.
 * Returns null when hosResult is null or the schedule is already feasible.
 */
export function HOSWarningBanner({ hosResult, onUpdateDelivery }: HOSWarningBannerProps) {
  if (!hosResult || hosResult.isFeasible) return null;

  const {
    totalTransitHours,
    totalDriveHours,
    restBreaksNeeded,
    dwellHours,
    earliestDelivery,
    hoursShort,
    isInverted,
    pickupDate,
    requestedDeliveryDate,
    totalMiles,
  } = hosResult;

  const handleUpdate = () => {
    onUpdateDelivery?.(toDateTimeLocal(earliestDelivery));
  };

  return (
    <div className="space-y-2 my-3">
      {/* ── Conflict Banner ───────────────────────────────────────────────── */}
      <div className="flex items-start gap-3 rounded-lg border-2 border-amber-400 bg-amber-50 px-4 py-3 shadow-sm">
        <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          {isInverted ? (
            <>
              <p className="font-bold text-amber-800 text-sm">
                ⚠ Invalid Schedule: Delivery time is set BEFORE pickup time.
              </p>
              <p className="text-amber-700 text-xs mt-1 leading-snug">
                Pickup is {formatDate(pickupDate, 'MMM d')} at {formatDate(pickupDate, 'h:mm a')}, 
                but Delivery is set to {formatDate(requestedDeliveryDate, 'MMM d')} at {formatDate(requestedDeliveryDate, 'h:mm a')}.
              </p>
            </>
          ) : (
            <>
              <p className="font-bold text-amber-800 text-sm">
                ⚠ Schedule Conflict: Minimum legal transit time is {totalTransitHours.toFixed(1)} hours.
              </p>
              <ul className="text-amber-700 text-xs mt-2 space-y-1 list-disc list-inside">
                <li>
                  <span className="font-semibold">Driving:</span> {totalDriveHours.toFixed(1)} hrs ({totalMiles.toLocaleString()} mi @ 55 mph)
                </li>
                {restBreaksNeeded > 0 && (
                  <li>
                    <span className="font-semibold">Mandatory HOS Sleeper Rest:</span> {restBreaksNeeded * 10} hrs (required after 11 hrs driving)
                  </li>
                )}
                <li>
                  <span className="font-semibold">Shipper/Receiver Dwell:</span> {dwellHours.toFixed(1)} hrs (1.5 hrs pickup + 1.5 hrs delivery)
                </li>
              </ul>
              <p className="text-amber-800 text-xs mt-2 font-bold">
                Verdict: Delivery deadline must be set at or after {formatDate(earliestDelivery, 'MMM d, yyyy, h:mm a')}.
              </p>
            </>
          )}
        </div>
      </div>

      {/* ── Estimated Best Delivery pill + optional update button ─────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <Badge className="bg-teal-100 text-teal-800 border border-teal-300 hover:bg-teal-100 px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 rounded-full pointer-events-none">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          Est. Best Delivery:&nbsp;
          <span className="font-bold">{formatDate(earliestDelivery, 'PPp')}</span>
        </Badge>

        {onUpdateDelivery && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-3 text-xs border-teal-400 text-teal-700 hover:bg-teal-50 hover:border-teal-500"
            onClick={handleUpdate}
          >
            Update to Best Delivery Date
            <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
