'use client';

import React, { useState } from 'react';
import { useApp } from '@/context/AppContext';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Package, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { type DriverProfile, isDriverOffDuty } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { getDriverLastKnownLocation, formatAddressForRoute, estimateLegDistanceSync } from '@/lib/routeUtils';
import { sendDriverPushNotification } from '@/lib/pushNotification';

// UID used by review mode — avoids importing the constant directly
const MOCK_REVIEW_UID = 'admin-reviewer-uid';

interface QuickAssignModalProps {
  driver: DriverProfile;
  onClose: () => void;
}

/**
 * QuickAssignModal
 *
 * Opens inline on the Driver Fleet Status dashboard when a dispatcher clicks
 * [+ Add Load] for a "Partial Load" driver.  On Confirm it:
 *   1. Finds or auto-creates the driver's active trip.
 *   2. Calls updateLoad (which issues the Firestore write in real mode, or
 *      updates local state in review/trial mode) to set assignedDriverId + tripId.
 *   3. Calls updateTrip to append the loadId to the trip's loadIds array.
 *
 * Both writes are issued together before the modal closes, making them
 * effectively atomic from the dispatcher's perspective.
 */
export function QuickAssignModal({ driver, onClose }: QuickAssignModalProps) {
  const {
    loads, trips, addTrip, updateTrip, updateLoad, user,
  } = useApp();
  const { toast } = useToast();

  const [selectedLoadId, setSelectedLoadId] = useState<string>('');
  const [isBusy, setIsBusy] = useState(false);

  // ── Find the driver's active trip ─────────────────────────────────────────
  // Priority 1: trip explicitly assigned to this driver that isn't completed
  // Priority 2: any trip that already contains one of the driver's loads
  const activeTrip = trips.find(
    t => t.assignedDriverId === driver.uid && t.status !== 'completed',
  ) ?? trips.find(
    t => loads.some(l => l.tripId === t.id && l.assignedDriverId === driver.uid),
  );

  // ── Available loads: pending + not already on this driver's active trip ───
  const activeLoadIds = new Set(
    loads.filter(l => l.tripId === activeTrip?.id).map(l => l.id),
  );
  const availableLoads = loads.filter(
    l =>
      l.id &&
      l.status === 'pending' &&
      !activeLoadIds.has(l.id) &&
      (l.assignedDriverId === undefined ||
        l.assignedDriverId === '' ||
        l.assignedDriverId === driver.uid),
  );

  const selectedLoad = loads.find(l => l.id === selectedLoadId);

  // ── Confirm: batch-assign load to driver + trip ───────────────────────────
  const handleConfirm = async () => {
    if (!selectedLoadId || !selectedLoad) return;

    if (isDriverOffDuty(driver)) {
      toast({
        title: 'Assignment Blocked',
        description: `${driver.name} is currently Off Duty. Cannot assign freight to an off-duty driver.`,
        variant: 'destructive',
      });
      return;
    }

    setIsBusy(true);

    try {
      // 1. Resolve the trip ID — create one if none exists.
      let tripId: string;
      let currentLoadIds: string[] = [];

      if (activeTrip) {
        tripId        = activeTrip.id;
        currentLoadIds = activeTrip.loadIds ?? [];
      } else {
        const newTrip = await addTrip({
          name:            `${driver.name} — Quick Run`,
          assignedDriverId: driver.uid,
          loadIds:         [],
          startOdometer:   0,
          status:          'active',
        });
        tripId = newTrip.id;
      }

      // 2. Assign load → Firestore (real) or local state (review/trial).
      //    updateLoad already handles both modes internally.
      // Automatically pull driver's last known location and calculate deadhead miles
      let deadheadMiles = selectedLoad.deadheadMiles;
      if (!deadheadMiles || deadheadMiles === 0) {
        const driverLastLoc = getDriverLastKnownLocation(driver, loads);
        const originStr = formatAddressForRoute(selectedLoad.origin);
        if (driverLastLoc && originStr && driverLastLoc.toLowerCase().trim() !== originStr.toLowerCase().trim()) {
          const estimatedDh = estimateLegDistanceSync(driverLastLoc, originStr, 0);
          if (estimatedDh > 0) {
            deadheadMiles = estimatedDh;
          }
        }
      }

      await updateLoad(selectedLoadId, {
        assignedDriverId: driver.uid,
        tripId,
        ...(deadheadMiles && deadheadMiles > 0 ? { deadheadMiles } : {}),
      });

      // 3. Append loadId to trip's loadIds array (always local state).
      await updateTrip(tripId, {
        loadIds: [...currentLoadIds, selectedLoadId],
      });

      // 4. Trigger FCM push notification to the assigned driver
      sendDriverPushNotification({
        driver,
        originCity: selectedLoad.origin.city,
        originState: selectedLoad.origin.state,
      }).catch(err => console.warn('Failed to send push notification in QuickAssignModal:', err));

      onClose();
    } catch (err) {
      console.error('[QuickAssignModal] Assignment failed:', err);
    } finally {
      setIsBusy(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">

        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Package className="h-5 w-5 text-sky-600" />
            Quick-Assign Load to {driver.name}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Select a pending load to stack onto this driver's active run.
            The assignment writes to both the load record and the trip manifest simultaneously.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">

          {/* Active trip context */}
          {activeTrip ? (
            <div className="flex items-center gap-2 text-xs bg-slate-50 border border-slate-100 rounded-lg px-3 py-2.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              <span className="text-slate-600">
                Active trip: <strong className="text-slate-800 font-mono">{activeTrip.tripNumber ?? activeTrip.name}</strong>
                {' '}· {(activeTrip.loadIds ?? []).length} load(s) currently stacked
              </span>
            </div>
          ) : (
            <div className="flex items-start gap-2 text-xs bg-amber-50 border border-amber-100 rounded-lg px-3 py-2.5 text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              No active trip found - a new multi-stop trip will be started when you confirm.
            </div>
          )}

          {/* Load selector */}
          {availableLoads.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6 border border-dashed rounded-lg">
              No pending loads available for assignment.
            </p>
          ) : (
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                Select Load to Add
              </label>
              <Select onValueChange={setSelectedLoadId} value={selectedLoadId}>
                <SelectTrigger className="h-10 text-sm">
                  <SelectValue placeholder="Choose a pending load..." />
                </SelectTrigger>
                <SelectContent>
                  {availableLoads.map(l => (
                    <SelectItem key={l.id!} value={l.id!} className="text-sm">
                      <span className="font-mono font-bold text-slate-700">
                        #{l.loadNumber ?? (l.id ?? '').slice(0, 7)}
                      </span>
                      {' '}·{' '}
                      {l.origin.city}, {l.origin.state} → {l.destination.city}, {l.destination.state}
                      {l.cargoWeightNum
                        ? ` · ${((l.cargoWeightNum ?? 0) * (l.cargoQuantity ?? 1)).toLocaleString()} lbs`
                        : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Selected load preview */}
          {selectedLoad && (
            <div className="rounded-lg border border-sky-100 bg-sky-50/60 p-3 space-y-1.5 text-xs">
              <p className="font-bold text-sky-800 text-[11px] uppercase tracking-wide">Load Preview</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-slate-700">
                <div>
                  <span className="text-slate-400 block">Cargo</span>
                  <span className="font-medium">{selectedLoad.cargoDescription ?? 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Weight</span>
                  <span className="font-medium">
                    {((selectedLoad.cargoWeightNum ?? 0) * (selectedLoad.cargoQuantity ?? 1)).toLocaleString()} lbs
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Distance</span>
                  <span className="font-medium">{selectedLoad.distance} mi</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Agreed Rate</span>
                  <span className="font-medium text-emerald-700">
                    ${selectedLoad.totalAgreedRate?.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={isBusy} size="sm">
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!selectedLoadId || isBusy || availableLoads.length === 0}
            size="sm"
            className="bg-sky-600 hover:bg-sky-700 text-white"
          >
            {isBusy ? 'Assigning…' : 'Confirm Assignment'}
          </Button>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
}
