'use client';

import React, { useState } from 'react';
import { useApp } from '@/context/AppContext';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MapPin, User, ArrowRight, PlusCircle, AlertTriangle, MessageSquare, RotateCcw, Clock } from 'lucide-react';
import { type DriverProfile, isDriverOffDuty } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { QuickAssignModal } from './QuickAssignModal';
import { buildDriverProgressLegs, calculateLegProgress } from '@/lib/routeUtils';
import { isLoadAssignedToDriver } from '@/lib/driverAssignment';

export const DriverAvailability = () => {
  const { toast } = useToast();
  const { driverProfiles, loads, vehicles, settings, trips, currentTime, updateDriverProfile } = useApp();

  /** Driver whose [+ Add Load] button was clicked; null when modal is closed. */
  const [assigningDriver, setAssigningDriver] = useState<DriverProfile | null>(null);
  const [editingHosDriverUid, setEditingHosDriverUid] = useState<string | null>(null);
  const [editingHosValue, setEditingHosValue] = useState<string>('');

  const activeDrivers = driverProfiles.filter(p => p.status !== 'terminated');

  return (
    <>
      <Card className="shadow-lg border-slate-200">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div className="flex items-center gap-2">
            <div className="bg-blue-100 p-2 rounded-full">
              <User className="h-5 w-5 text-blue-600" />
            </div>
            <CardTitle className="text-xl">Driver Fleet Status</CardTitle>
          </div>
          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
            {activeDrivers.length} Active
          </Badge>
        </CardHeader>

        <CardContent>
          {activeDrivers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground bg-slate-50 rounded-lg border border-dashed">
              <User className="h-8 w-8 mx-auto mb-2 opacity-20" />
              <p>No drivers currently active.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50">
                  <TableHead>Driver &amp; Capacity</TableHead>
                  <TableHead>Current Route / Location</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeDrivers.map((driver) => {
                  // ── Status derivation ────────────────────────────────────
                  // Match by unified load-to-driver assignment (ID, name, equipment, or trip)
                  const driverLoads = loads.filter(
                    l => l.status !== 'delivered' && isLoadAssignedToDriver(l, driver, trips, vehicles),
                  );

                  const inProgressLoads = driverLoads.filter(l =>
                    ['in-transit', 'loading', 'waiting', 'unloading', 'on-break'].includes(l.status),
                  );
                  const pendingLoads = driverLoads.filter(l =>
                    ['pending', 'client-request-approved', 'idle'].includes(l.status),
                  );

                  const activeLoads = inProgressLoads.length > 0 ? inProgressLoads : pendingLoads;
                  const primaryLoad = inProgressLoads[inProgressLoads.length - 1] || driverLoads[0];

                  const isEnRoute = inProgressLoads.some(l => l.status === 'in-transit');
                  const isLoading = inProgressLoads.some(l => l.status === 'loading');

                  // ── Capacity calculation ─────────────────────────────────────────────
                  const truck   = vehicles.find(v => v.id === driver.assignedTruckId);
                  const trailer = vehicles.find(v => v.id === driver.assignedTrailerId);

                  const trailerPayload = trailer
                    ? trailer.payloadCapacity ??
                      Math.max(0, (trailer.gvwr ?? 0) - (trailer.emptyWeight ?? 0))
                    : 0;

                  const currentWeight = driverLoads.reduce(
                    (sum, l) => sum + (l.cargoWeightNum ?? 0) * (l.cargoQuantity ?? 1),
                    0,
                  );
                  const remainingWeight = Math.max(0, trailerPayload - currentWeight);

                  const safetyBuffer  = settings?.CARGO_SAFETY_BUFFER ?? (settings as any)?.cargoSafetyBuffer ?? 0.33;
                  const trailerWidth  = trailer?.trailerWidth ?? 8.5;

                  const currentLength = driverLoads.reduce((sum, l) => {
                    if (l.placementMode === 'stacked') return sum;
                    const qty         = l.cargoQuantity ?? 1;
                    const effWidth    = (l.cargoWidth ?? 0) + safetyBuffer;
                    const effLength   = (l.cargoLength ?? 0) + safetyBuffer;
                    const itemsPerRow = effWidth > 0
                      ? Math.max(1, Math.floor(trailerWidth / effWidth))
                      : 1;
                    return sum + Math.ceil(qty / itemsPerRow) * effLength;
                  }, 0);

                  const remainingSpace = Math.max(0, (trailer?.trailerLength ?? 0) - currentLength);
                  const displayWidth   = parseFloat(trailerWidth.toFixed(1));
                  const displayLength  = parseFloat(remainingSpace.toFixed(1));

                  const isPartial = driverLoads.length > 0 && remainingSpace >= 5 && remainingWeight >= 500;

                  // ── Badge status and color ──────────────────────────────────────────
                  const isOffDuty = isDriverOffDuty(driver);
                  let badgeStatus = 'Ready';
                  let badgeColor  = 'bg-green-100 text-green-700 border-green-200';

                  if (isOffDuty) {
                    badgeStatus = 'Off Duty';
                    badgeColor  = 'bg-slate-200 text-slate-700 border-slate-300';
                  } else if (primaryLoad) {
                    if (primaryLoad.status === 'arrived' || (primaryLoad as any).status === 'Arrived' || primaryLoad.driverPhase === 'Arrived') {
                      badgeStatus = 'Arrived (At Facility)';
                    } else if (primaryLoad.driverPhase) {
                      badgeStatus = primaryLoad.driverPhase as string;
                    } else if (primaryLoad.status === 'loading') {
                      badgeStatus = 'Loading';
                    } else if (primaryLoad.status === 'in-transit') {
                      badgeStatus = 'In Transit';
                    } else if (primaryLoad.status === 'waiting') {
                      badgeStatus = 'Waiting (Detention)';
                    } else if (primaryLoad.status === 'unloading') {
                      badgeStatus = 'Unloading';
                    } else if (primaryLoad.status === 'on-break') {
                      badgeStatus = 'On Break';
                    } else if (primaryLoad.status === 'client-request-approved') {
                      badgeStatus = 'Dispatched';
                    } else if (primaryLoad.status === 'pending') {
                      badgeStatus = isPartial ? 'Partial Load' : 'Assigned (Pending)';
                    } else if (primaryLoad.status === 'idle') {
                      badgeStatus = 'Idle / Staged';
                    } else {
                      badgeStatus = primaryLoad.status;
                    }

                    if (primaryLoad.status === 'arrived' || (primaryLoad as any).status === 'Arrived' || primaryLoad.driverPhase === 'Arrived') {
                      badgeColor = 'bg-teal-100 text-teal-800 border-teal-300';
                    } else if (primaryLoad.status === 'loading' || primaryLoad.driverPhase === 'Getting Loaded') {
                      badgeColor = 'bg-blue-100 text-blue-800 border-blue-200';
                    } else if (primaryLoad.status === 'in-transit' || isEnRoute) {
                      badgeColor = 'bg-emerald-100 text-emerald-800 border-emerald-200';
                    } else if (primaryLoad.status === 'waiting') {
                      badgeColor = 'bg-orange-100 text-orange-800 border-orange-200';
                    } else if (primaryLoad.status === 'unloading' || primaryLoad.driverPhase === 'Getting Unloaded') {
                      badgeColor = 'bg-amber-100 text-amber-800 border-amber-200';
                    } else if (primaryLoad.status === 'on-break') {
                      badgeColor = 'bg-slate-100 text-slate-700 border-slate-200';
                    } else if (primaryLoad.status === 'pending' && isPartial) {
                      badgeColor = 'bg-yellow-100 text-yellow-800 border-yellow-200';
                    } else {
                      badgeColor = 'bg-sky-100 text-sky-800 border-sky-200';
                    }
                  } else {
                    badgeStatus = driver.availabilityStatus && (driver.availabilityStatus as string) !== 'Idle'
                      ? driver.availabilityStatus
                      : 'Ready';
                    badgeColor  = 'bg-green-100 text-green-700 border-green-200';
                  }

                  // ── Route display ────────────────────────────────────────
                  let routeOrigin: { city: string; state: string } | null = null;
                  let routeDestination: { city: string; state: string } | null = null;
                  let routeStatusLabel = 'Current Route';

                  if (primaryLoad) {
                    // Tap into the same state machine used by the live tracker
                    const legProgress = calculateLegProgress(
                      primaryLoad,
                      loads,
                      primaryLoad.distance || 0,
                      0, // Overall fraction approximation handled natively in calculateLegProgress via time
                      settings.truckAverageSpeed || 55,
                      currentTime,
                      driver
                    );
                    
                    const fromParts = legProgress.fromLocation.split(',');
                    const toParts = legProgress.toLocation.split(',');
                    
                    routeOrigin = { city: fromParts[0]?.trim() || 'Unknown', state: fromParts[1]?.trim() || '' };
                    routeDestination = { city: toParts[0]?.trim() || 'Unknown', state: toParts[1]?.trim() || '' };
                    routeStatusLabel = legProgress.activeLegTitle;
                  }

                  const completedLoads = loads
                    .filter(
                      l => isLoadAssignedToDriver(l, driver, trips, vehicles) && l.status === 'delivered',
                    )
                    .sort(
                      (a, b) =>
                        new Date(b.deliveryDateTime || 0).getTime() -
                        new Date(a.deliveryDateTime || 0).getTime(),
                    );
                  const lastLocation =
                    completedLoads.length > 0 ? completedLoads[0].destination : null;

                  // ── Row ──────────────────────────────────────────────────
                  return (
                    <TableRow key={driver.uid} className="hover:bg-slate-50 transition-colors">

                      {/* Driver & Capacity */}
                      <TableCell>
                        <div className="flex flex-col">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-slate-900">{driver.name}</span>
                            {/* HOS Badge with Click-to-Edit and Reset */}
                            {(() => {
                              const hos = driver.estimatedHosRemaining ?? 11.0;
                              const isEditing = editingHosDriverUid === driver.uid;
                              const colorClass = hos > 5
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                : hos >= 2
                                ? 'bg-amber-100 text-amber-800 border-amber-300'
                                : 'bg-red-100 text-red-800 border-red-300';

                              if (isEditing) {
                                return (
                                  <div className="inline-flex items-center gap-1">
                                    <input
                                      type="number"
                                      step="0.1"
                                      min="0"
                                      max="11"
                                      autoFocus
                                      value={editingHosValue}
                                      onChange={(e) => setEditingHosValue(e.target.value)}
                                      onKeyDown={async (e) => {
                                        if (e.key === 'Enter') {
                                          const val = parseFloat(editingHosValue);
                                          if (!isNaN(val)) {
                                            const clamped = Math.max(0, Math.min(11, Math.round(val * 10) / 10));
                                            await updateDriverProfile(driver.uid, { estimatedHosRemaining: clamped });
                                            toast({ title: 'HOS Updated', description: `${driver.name}'s HOS set to ${clamped.toFixed(1)} hrs.` });
                                          }
                                          setEditingHosDriverUid(null);
                                        } else if (e.key === 'Escape') {
                                          setEditingHosDriverUid(null);
                                        }
                                      }}
                                      onBlur={async () => {
                                        const val = parseFloat(editingHosValue);
                                        if (!isNaN(val)) {
                                          const clamped = Math.max(0, Math.min(11, Math.round(val * 10) / 10));
                                          await updateDriverProfile(driver.uid, { estimatedHosRemaining: clamped });
                                          toast({ title: 'HOS Updated', description: `${driver.name}'s HOS set to ${clamped.toFixed(1)} hrs.` });
                                        }
                                        setEditingHosDriverUid(null);
                                      }}
                                      className="h-5 w-14 px-1 text-[11px] font-bold border rounded bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-sky-500"
                                    />
                                    <span className="text-[10px] text-slate-400 font-bold">hrs</span>
                                  </div>
                                );
                              }

                              return (
                                <div className="inline-flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingHosDriverUid(driver.uid);
                                      setEditingHosValue(hos.toFixed(1));
                                    }}
                                    title="Click to manually edit remaining HOS hours"
                                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border cursor-pointer hover:opacity-85 transition-opacity ${colorClass}`}
                                  >
                                    <Clock className="h-2.5 w-2.5" />
                                    HOS: {hos.toFixed(1)} hrs
                                  </button>
                                  <button
                                    type="button"
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      await updateDriverProfile(driver.uid, { estimatedHosRemaining: 11.0 });
                                      toast({ title: 'HOS Reset', description: `${driver.name}'s HOS reset to 11.0 hrs.` });
                                    }}
                                    title="Reset HOS to 11.0 hrs"
                                    className="p-0.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors"
                                  >
                                    <RotateCcw className="h-3 w-3" />
                                  </button>
                                </div>
                              );
                            })()}
                          </div>
                          <span className="text-[10px] text-slate-500 uppercase tracking-tight mb-1">
                            {driver.idNumber ?? 'No ID'}
                          </span>
                          {trailer && (
                            <div className="flex flex-col text-xs text-slate-600 gap-0.5">
                              <span>
                                <strong className="text-slate-800">Rem. Weight:</strong>{' '}
                                {remainingWeight.toLocaleString()} lbs
                              </span>
                              <span>
                                <strong className="text-slate-800">Rem. Space:</strong>{' '}
                                {displayWidth}&apos; × {displayLength}&apos; available
                              </span>
                            </div>
                          )}
                        </div>
                      </TableCell>

                      {/* Route */}
                      <TableCell>
                        {routeOrigin && routeDestination ? (
                          <div className="flex flex-col gap-0.5 text-slate-600">
                            <span className="text-[10px] uppercase font-bold text-slate-400">
                              {routeStatusLabel}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-semibold text-slate-800 truncate max-w-[130px]" title={`${routeOrigin.city}, ${routeOrigin.state}`}>
                                {routeOrigin.city}, {routeOrigin.state}
                              </span>
                              <ArrowRight className="h-3 w-3 text-blue-500 shrink-0" />
                              <span className="text-sm font-semibold text-blue-700 truncate max-w-[130px]" title={`${routeDestination.city}, ${routeDestination.state}`}>
                                {routeDestination.city}, {routeDestination.state}
                              </span>
                            </div>
                            {driver.currentLat && driver.currentLng && (
                              <div className="text-[10px] text-slate-400 font-mono mt-0.5 flex items-center">
                                <MapPin className="h-3 w-3 mr-1" />
                                GPS: {driver.currentLat.toFixed(4)}, {driver.currentLng.toFixed(4)}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-slate-600">
                            <MapPin className="h-3.5 w-3.5 text-slate-400" />
                            <span className="text-sm">
                              {driver.currentStaging
                                ? `Staged at ${driver.currentStaging}`
                                : driver.lastLocationCity && driver.lastLocationState
                                  ? `Idle at ${driver.lastLocationCity}, ${driver.lastLocationState}`
                                  : lastLocation
                                    ? `Idle at ${lastLocation.city}, ${lastLocation.state}`
                                    : 'Available (No Active Load)'}
                            </span>
                          </div>
                        )}
                      </TableCell>

                      {/* Status + Quick-Assign button */}
                      <TableCell>
                        <div className="flex flex-col gap-1 items-start">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge className={`${badgeColor} shadow-none px-2 py-0.5 whitespace-nowrap overflow-hidden text-ellipsis max-w-[150px]`} title={routeStatusLabel || badgeStatus}>
                              {routeStatusLabel !== 'Current Route' ? routeStatusLabel : badgeStatus}
                            </Badge>

                            {/* ── [+ Add Load] shows when trailer has available capacity and driver is on duty ── */}
                            {isPartial && !isOffDuty && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 px-2 text-[11px] font-bold text-sky-700 border-sky-200 hover:bg-sky-50 hover:border-sky-400 transition-colors"
                                onClick={() => setAssigningDriver(driver)}
                              >
                                <PlusCircle className="h-3 w-3 mr-1" />
                                Add Load
                              </Button>
                            )}
                          </div>

                          {/* Exception flag banner on driver row */}
                          {activeLoads.some(l => l.driverExceptionFlag) && (
                            <Badge className="bg-red-100 text-red-700 border-red-200 text-[10px] font-bold flex items-center gap-1 mt-0.5">
                              <AlertTriangle className="h-2.5 w-2.5" />
                              {activeLoads.find(l => l.driverExceptionFlag)?.driverExceptionFlag}
                            </Badge>
                          )}

                          {/* Driver note snippet */}
                          {activeLoads.find(l => l.driverNote && !l.driverExceptionFlag) && (
                            <span className="text-[10px] text-slate-500 italic flex items-center gap-1 max-w-[150px] truncate" title={activeLoads.find(l => l.driverNote)?.driverNote}>
                              <MessageSquare className="h-2.5 w-2.5 text-blue-500 shrink-0" />
                              &ldquo;{activeLoads.find(l => l.driverNote)?.driverNote}&rdquo;
                            </span>
                          )}
                        </div>
                      </TableCell>

                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Quick-Assign modal — rendered outside the card to avoid z-index issues */}
      {assigningDriver && (
        <QuickAssignModal
          driver={assigningDriver}
          onClose={() => setAssigningDriver(null)}
        />
      )}
    </>
  );
};
