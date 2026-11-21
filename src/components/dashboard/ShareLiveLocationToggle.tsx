'use client';

import React from 'react';
import { MapPin, Radio, ShieldAlert, Loader2 } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { useLiveLocationSharing } from '@/hooks/use-live-location';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';

type ShareLiveLocationToggleProps = {
  /** Driver profile uid the GPS fixes are written to. */
  driverUid?: string | null;
};

/**
 * Driver-facing "Share Live Location" control. Permission is requested only on tap,
 * updates are throttled (~20s / significant movement), and stopping ceases all updates.
 * Note: browsers pause GPS when a mobile tab/PWA is fully backgrounded or the screen locks;
 * sharing resumes when the app is reopened and still toggled on.
 */
export function ShareLiveLocationToggle({ driverUid }: ShareLiveLocationToggleProps) {
  const { updateDriverLiveLocation } = useApp();
  const { toast } = useToast();

  const { state, start, stop, lastSentAt, isSharing } = useLiveLocationSharing(
    (fix) => {
      if (driverUid) void updateDriverLiveLocation(driverUid, fix);
    },
    () => {
      if (driverUid) void updateDriverLiveLocation(driverUid, null);
    },
  );

  const handleToggle = () => {
    if (isSharing) {
      stop();
      toast({ title: 'Location sharing stopped', description: 'Dispatch no longer receives live updates.' });
      return;
    }
    if (!driverUid) {
      toast({ variant: 'destructive', title: 'No driver profile', description: 'Cannot share location without a driver profile.' });
      return;
    }
    start();
  };

  const lastSentText = lastSentAt
    ? `Last update ${new Date(lastSentAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
    : 'Waiting for GPS fix…';

  return (
    <div
      className={`rounded-2xl border p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs ${
        isSharing ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-white'
      }`}
    >
      <div className="flex items-start gap-3 min-w-0">
        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
            isSharing ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'
          }`}
        >
          {isSharing ? <Radio className="w-4 h-4 animate-pulse" /> : <MapPin className="w-4 h-4" />}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-900 leading-tight">
            {isSharing ? 'Sharing live location with dispatch' : 'Share Live Location'}
          </p>
          <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">
            {state === 'starting' && 'Requesting location…'}
            {state === 'sharing' && lastSentText}
            {state === 'off' && 'Let dispatch see your truck on the Live Ops map. Updates about every 20 seconds.'}
            {state === 'unsupported' && 'This browser does not support location sharing.'}
            {state === 'error' && 'Could not get a GPS fix. Check signal and try again.'}
            {state === 'denied' && (
              <span className="text-red-700 font-semibold flex items-center gap-1">
                <ShieldAlert className="w-3 h-3 shrink-0" />
                Location permission denied. Enable it in your browser/app settings, then tap Share again.
              </span>
            )}
          </p>
        </div>
      </div>

      <Button
        type="button"
        onClick={handleToggle}
        disabled={state === 'unsupported'}
        className={`h-10 px-4 font-bold shrink-0 w-full sm:w-auto ${
          isSharing ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-emerald-600 hover:bg-emerald-700 text-white'
        }`}
      >
        {state === 'starting' ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
        {isSharing ? 'Stop Sharing' : 'Share Live Location'}
      </Button>
    </div>
  );
}
