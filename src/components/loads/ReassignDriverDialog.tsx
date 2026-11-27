'use client';

import React, { useEffect, useState } from 'react';
import { isDriverOffDuty, type DriverProfile, type ReassignmentLogEntry, type Vehicle } from '@/types';
import { getDriverProfileId } from '@/lib/driverAssignment';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { History, Loader2, Truck as TruckIcon, UserCog } from 'lucide-react';
import { format as formatDate } from 'date-fns';

interface ReassignDriverDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  currentDriverId?: string;
  currentDriverName?: string;
  currentTruckId?: string;
  driverProfiles: DriverProfile[];
  vehicles: Vehicle[];
  reassignmentHistory?: ReassignmentLogEntry[];
  onConfirm: (selection: { driverId: string; driverName: string; truckId?: string }) => Promise<void>;
}

export function ReassignDriverDialog({
  open,
  onOpenChange,
  title,
  subtitle,
  currentDriverId,
  currentDriverName,
  currentTruckId,
  driverProfiles,
  vehicles,
  reassignmentHistory,
  onConfirm,
}: ReassignDriverDialogProps) {
  const [selectedDriverId, setSelectedDriverId] = useState<string>('');
  const [selectedTruckId, setSelectedTruckId] = useState<string>(currentTruckId || 'keep');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const trucks = React.useMemo(
    () => vehicles.filter((v) => v.type === 'truck'),
    [vehicles],
  );

  useEffect(() => {
    if (open) {
      setSelectedDriverId('');
      setSelectedTruckId(currentTruckId || 'keep');
    }
  }, [open, currentTruckId]);

  const handleDriverSelect = (driverId: string) => {
    setSelectedDriverId(driverId);
    const matched = driverProfiles.find((d) => getDriverProfileId(d) === driverId);
    if (matched?.assignedTruckId) {
      setSelectedTruckId(matched.assignedTruckId);
    }
  };

  const selectedDriver = driverProfiles.find((d) => getDriverProfileId(d) === selectedDriverId);

  const handleConfirm = async () => {
    if (!selectedDriver || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onConfirm({
        driverId: getDriverProfileId(selectedDriver),
        driverName: selectedDriver.name,
        truckId:
          selectedTruckId && selectedTruckId !== 'keep' && selectedTruckId !== 'none'
            ? selectedTruckId
            : undefined,
      });
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-900">
            <UserCog className="h-5 w-5 text-blue-600" />
            {title}
          </DialogTitle>
          {subtitle && (
            <DialogDescription className="text-xs text-slate-500">
              {subtitle}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Currently assigned:{' '}
            <strong className="text-slate-900">
              {currentDriverName || 'Unassigned'}
            </strong>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-700">
              Select Available Driver
            </Label>
            <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
              {driverProfiles.length === 0 ? (
                <p className="text-xs text-slate-500 py-2">No drivers found in your fleet.</p>
              ) : (
                driverProfiles.map((driver) => {
                  const dId = getDriverProfileId(driver);
                  const offDuty = isDriverOffDuty(driver);
                  const isCurrent = Boolean(currentDriverId && dId === currentDriverId);
                  const isSelected = selectedDriverId === dId;
                  const assignedTruck = driver.assignedTruckId
                    ? trucks.find((t) => t.id === driver.assignedTruckId)
                    : undefined;

                  return (
                    <button
                      key={dId}
                      type="button"
                      disabled={offDuty || isCurrent}
                      onClick={() => handleDriverSelect(dId)}
                      className={`w-full flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                        isSelected
                          ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-500'
                          : offDuty || isCurrent
                          ? 'border-slate-200 bg-slate-100/70 opacity-60 cursor-not-allowed'
                          : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 truncate">{driver.name}</p>
                        <p className="text-[11px] text-slate-500 truncate flex items-center gap-1.5 mt-0.5">
                          {assignedTruck ? (
                            <span className="inline-flex items-center gap-1">
                              <TruckIcon className="h-3 w-3 text-slate-400" />
                              #{assignedTruck.unitNumber} {assignedTruck.name}
                            </span>
                          ) : (
                            <span>No default truck</span>
                          )}
                          {typeof driver.estimatedHosRemaining === 'number' && (
                            <span>· {driver.estimatedHosRemaining.toFixed(1)}h HOS</span>
                          )}
                        </p>
                      </div>
                      <div className="shrink-0 flex items-center gap-1">
                        {isCurrent && (
                          <Badge variant="outline" className="text-[10px] bg-slate-200 text-slate-700 border-none">
                            Current
                          </Badge>
                        )}
                        {offDuty && (
                          <Badge variant="outline" className="text-[10px] bg-red-100 text-red-700 border-none">
                            Off Duty
                          </Badge>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reassign-truck" className="text-xs font-semibold text-slate-700">
              Vehicle / Power Unit
            </Label>
            <Select value={selectedTruckId} onValueChange={setSelectedTruckId}>
              <SelectTrigger id="reassign-truck" className="bg-white text-xs">
                <SelectValue placeholder="Keep current vehicle" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="keep">Keep existing vehicle</SelectItem>
                {trucks.map((truck) => (
                  <SelectItem key={truck.id} value={truck.id!}>
                    #{truck.unitNumber} {truck.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {reassignmentHistory && reassignmentHistory.length > 0 && (
            <div className="space-y-1.5 pt-2 border-t border-slate-100">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                <History className="h-3 w-3" />
                Reassignment Log
              </p>
              <div className="max-h-24 overflow-y-auto space-y-1 text-[11px] text-slate-600">
                {[...reassignmentHistory].reverse().slice(0, 5).map((entry, idx) => (
                  <div key={`${entry.reassignedAt}-${idx}`} className="rounded bg-slate-50 px-2 py-1 border border-slate-100">
                    <span className="font-semibold text-slate-800">{entry.fromDriverName}</span>
                    {' → '}
                    <span className="font-semibold text-blue-700">{entry.toDriverName}</span>
                    <span className="text-slate-400">
                      {' · '}
                      {entry.reassignedBy} · {formatDate(new Date(entry.reassignedAt), 'MMM d, h:mm a')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!selectedDriver || isSubmitting}
            onClick={handleConfirm}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Reassigning…
              </>
            ) : (
              'Confirm Reassignment'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
