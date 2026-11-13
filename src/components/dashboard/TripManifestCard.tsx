'use client';

import React, { useState } from 'react';
import type { Trip, Load, DriverProfile, Address } from '@/types';
import { 
  buildChronologicalTripStops, 
  generateGoogleMapsUrl, 
  cleanSearchableAddress,
  getNextStopGoogleMapsUrl,
  getNextStopAppleMapsUrl,
  isIosDevice,
  type ChronologicalTripStop 
} from '@/lib/routeUtils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { 
  MapPin, 
  Package, 
  Navigation2,
  Compass, 
  CheckCircle2, 
  ChevronRight, 
  Loader2, 
  AlertTriangle, 
  MessageSquare, 
  Receipt, 
  FileText, 
  ChevronDown, 
  ChevronUp, 
  ExternalLink,
  Layers,
  Send,
  X,
  Phone
} from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { SignedBolUpload } from '@/components/loads/SignedBolUpload';

interface TripManifestCardProps {
  trip: Trip;
  loads: Load[];
  driverProfile?: DriverProfile | null;
  onUpdateLoad: (id: string, updates: Partial<Load>) => Promise<void>;
  onLogExpense: (load: Load) => void;
  onOpenEpod: (load: Load) => void;
  onViewActiveBol: (load: Load) => void;
  reportDriverException: (loadId: string, exception: any, note?: string) => Promise<void>;
  updateDriverNote: (loadId: string, note: string) => Promise<void>;
}

export function TripManifestCard({
  trip,
  loads,
  driverProfile,
  onUpdateLoad,
  onLogExpense,
  onOpenEpod,
  onViewActiveBol,
  reportDriverException,
  updateDriverNote,
}: TripManifestCardProps) {
  const [isUpdatingLeg, setIsUpdatingLeg] = useState(false);
  const [expandedLoadId, setExpandedLoadId] = useState<string | null>(null);
  const [showNoteByLoad, setShowNoteByLoad] = useState<Record<string, boolean>>({});
  const [noteByLoad, setNoteByLoad] = useState<Record<string, string>>({});
  const [showExceptionByLoad, setShowExceptionByLoad] = useState<Record<string, boolean>>({});
  const [isSubmittingNote, setIsSubmittingNote] = useState<string | null>(null);

  const [driverCoords, setDriverCoords] = useState<{ lat: number; lng: number } | null>(null);
  const isApple = React.useMemo(() => isIosDevice(), []);

  React.useEffect(() => {
    if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        pos => setDriverCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {},
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 }
      );
    }
  }, []);

  // 1. Consolidate all origins & destinations into an ordered, chronological itinerary
  const chronologicalStops: ChronologicalTripStop[] = React.useMemo(() => {
    return buildChronologicalTripStops(loads);
  }, [loads]);

  // Total Linear Feet & Weight on Trip
  const totalWeight = loads.reduce((sum, l) => sum + ((l.cargoWeightNum || 0) * (l.cargoQuantity || 1)), 0);
  const totalLinearFeet = loads.reduce((sum, l) => sum + (l.cargoLength || 0), 0);

  // 2. Determine current trip leg progress
  // A stop is completed if its corresponding load is at or past that stage
  const getStopStatus = (stop: ChronologicalTripStop) => {
    const load = loads.find(l => l.id === stop.loadId);
    if (!load) return { completed: false, active: false };

    const status = String(load.status || '').toLowerCase();
    if (status === 'delivered' || status === 'completed') {
      return { completed: true, active: false };
    }

    if (stop.type === 'pickup') {
      const pickupCompleted = [
        'loading', 'in-transit', 'arrived-destination', 'unloading', 'delivered'
      ].includes(status);
      const pickupActive = status === 'arrived-origin' || status === 'dispatched';
      return { completed: pickupCompleted, active: pickupActive };
    } else {
      // dropoff
      const dropoffActive = status === 'arrived-destination' || status === 'unloading';
      return { completed: false, active: dropoffActive };
    }
  };

  // Find the first uncompleted stop index
  const activeStopIndex = chronologicalStops.findIndex(stop => !getStopStatus(stop).completed);
  const currentLegNumber = activeStopIndex >= 0 ? activeStopIndex + 1 : chronologicalStops.length;
  const currentStop = activeStopIndex >= 0 ? chronologicalStops[activeStopIndex] : null;

  // Remaining uncompleted stops
  const remainingStops = React.useMemo(() => {
    return chronologicalStops.filter(stop => !getStopStatus(stop).completed);
  }, [chronologicalStops, loads]);

  // 3. Generate Next-Stop & Multi-Stop Google Maps Navigation URLs
  // Primary: Next Stop Navigation URL (omits origin to lock onto live GPS)
  const nextStopMapsUrl = React.useMemo(() => {
    const target = currentStop || (remainingStops.length > 0 ? remainingStops[0] : chronologicalStops[0]);
    if (!target) return 'https://www.google.com/maps';
    const dest = cleanSearchableAddress(target.rawAddress || target.location);
    return getNextStopGoogleMapsUrl(dest, driverCoords);
  }, [currentStop, remainingStops, chronologicalStops, driverCoords]);

  const nextStopAppleMapsUrl = React.useMemo(() => {
    const target = currentStop || (remainingStops.length > 0 ? remainingStops[0] : chronologicalStops[0]);
    if (!target) return 'https://maps.apple.com';
    const dest = cleanSearchableAddress(target.rawAddress || target.location);
    return getNextStopAppleMapsUrl(dest);
  }, [currentStop, remainingStops, chronologicalStops]);

  // Secondary: Remaining Stops Multi-Stop Google Maps URL
  const remainingRouteMapsUrl = React.useMemo(() => {
    const stopsToRoute = remainingStops.length > 0 ? remainingStops : chronologicalStops;
    if (stopsToRoute.length === 0) return 'https://www.google.com/maps';
    if (stopsToRoute.length === 1) {
      return getNextStopGoogleMapsUrl(cleanSearchableAddress(stopsToRoute[0].rawAddress || stopsToRoute[0].location), driverCoords);
    }
    const finalStop = cleanSearchableAddress(stopsToRoute[stopsToRoute.length - 1].rawAddress || stopsToRoute[stopsToRoute.length - 1].location);
    const waypoints = stopsToRoute
      .slice(0, -1)
      .map(s => cleanSearchableAddress(s.rawAddress || s.location))
      .filter(Boolean)
      .join('|');
    const originParam = driverCoords ? `&origin=${driverCoords.lat},${driverCoords.lng}` : '';
    const waypointsParam = waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : '';
    return `https://www.google.com/maps/dir/?api=1${originParam}&destination=${encodeURIComponent(finalStop)}${waypointsParam}&travelmode=driving`;
  }, [remainingStops, chronologicalStops, driverCoords]);

  const fullRouteMapsUrl = remainingRouteMapsUrl;

  // 4. Stop-based status advancement handler
  // Updates the corresponding load(s) in Firestore when the driver taps the Next Leg button
  const handleAdvanceCurrentLeg = async () => {
    if (!currentStop || !currentStop.loadId) return;
    const targetLoad = loads.find(l => l.id === currentStop.loadId);
    if (!targetLoad || !targetLoad.id) return;

    setIsUpdatingLeg(true);
    try {
      const currentStatus = String(targetLoad.status || '').toLowerCase();
      if (currentStop.type === 'pickup') {
        if (currentStatus === 'dispatched') {
          // Arrived at pickup
          await onUpdateLoad(targetLoad.id, { 
            status: 'arrived-origin',
            arrivedAt: new Date().toISOString()
          });
        } else {
          // Finished loading -> In Transit
          await onUpdateLoad(targetLoad.id, { 
            status: 'in-transit',
            driverPhase: 'Enroute to Destination'
          });
        }
      } else {
        // Dropoff
        if (currentStatus === 'in-transit') {
          // Arrived at destination
          await onUpdateLoad(targetLoad.id, { 
            status: 'arrived-destination',
            arrivedAt: new Date().toISOString()
          });
        } else {
          // Delivered
          const nowIso = new Date().toISOString();
          const hasBol = Boolean(targetLoad.signedBolUrl);
          await onUpdateLoad(targetLoad.id, { 
            status: 'delivered',
            driverPhase: 'Complete',
            deliveredAt: targetLoad.deliveredAt || nowIso,
            paperworkStatus: hasBol ? 'pod_uploaded' : 'pending_pod'
          });
        }
      }
    } catch (err: any) {
      console.error('Failed to advance leg:', err);
    } finally {
      setIsUpdatingLeg(false);
    }
  };

  const handleSendNote = async (load: Load) => {
    if (!load.id) return;
    const note = noteByLoad[load.id]?.trim();
    if (!note) return;
    setIsSubmittingNote(load.id);
    try {
      await updateDriverNote(load.id, note);
      setShowNoteByLoad(prev => ({ ...prev, [load.id!]: false }));
    } finally {
      setIsSubmittingNote(null);
    }
  };

  return (
    <Card className="border-0 shadow-md rounded-2xl overflow-hidden relative bg-white">
      {/* Indigo Accent Strip for Consolidated Trips */}
      <div className="absolute top-0 left-0 w-2 h-full bg-gradient-to-b from-indigo-500 to-blue-600" />

      <CardHeader className="pb-3 border-b border-slate-100 pl-6 pr-5 pt-5 bg-gradient-to-r from-indigo-50/40 via-white to-white">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <Badge className="bg-indigo-600 text-white font-extrabold flex items-center gap-1.5 shadow-xs">
              <Layers className="w-3.5 h-3.5" />
              <span>COMBINED TRIP MANIFEST</span>
            </Badge>
            <span className="text-xs font-mono font-bold text-indigo-950">
              #{trip.tripNumber || trip.id.substring(0, 8)}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
            <Badge variant="outline" className="bg-white border-slate-200">
              {loads.length} Consolidated Loads
            </Badge>
            {totalWeight > 0 && (
              <Badge variant="outline" className="bg-white border-slate-200">
                {totalWeight.toLocaleString()} lbs
              </Badge>
            )}
            {totalLinearFeet > 0 && (
              <Badge variant="outline" className="bg-white border-slate-200">
                {totalLinearFeet} ft Total Deck
              </Badge>
            )}
          </div>
        </div>

        {/* ── Stop-Based Current Leg Progress Bar ── */}
        <div className="mt-4 pt-3 border-t border-slate-100">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="font-bold text-slate-700 flex items-center gap-1.5">
              <Navigation2 className="w-4 h-4 text-indigo-600" />
              <span>Current Leg: Stop {currentLegNumber} of {chronologicalStops.length}</span>
            </span>
            <span className="text-[11px] font-semibold text-indigo-700">
              {currentStop ? `${currentStop.type === 'pickup' ? 'Pickup' : 'Dropoff'} • ${currentStop.rawAddress?.city || currentStop.location}` : 'Trip Complete'}
            </span>
          </div>

          {/* Segmented Progress Bar */}
          <div className="grid grid-cols-4 gap-1.5 mb-3">
            {chronologicalStops.map((stop, idx) => {
              const { completed, active } = getStopStatus(stop);
              return (
                <div key={`${stop.loadId}-${idx}`} className="space-y-1">
                  <div className={`h-2 rounded-full transition-all ${
                    completed 
                      ? 'bg-emerald-500' 
                      : active 
                      ? 'bg-indigo-600 animate-pulse' 
                      : 'bg-slate-200'
                  }`} />
                  <div className="text-[10px] text-center font-bold truncate text-slate-600">
                    Stop {idx + 1}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Next Leg Action Button */}
          {currentStop && (
            <button
              type="button"
              disabled={isUpdatingLeg}
              onClick={handleAdvanceCurrentLeg}
              className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
            >
              {isUpdatingLeg ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Updating Trip Leg…</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 text-indigo-200" />
                  <span>
                    Mark Stop {currentLegNumber} ({currentStop.type === 'pickup' ? 'Pickup' : 'Dropoff'}) Complete &amp; Advance Leg
                  </span>
                </>
              )}
            </button>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-5 pl-6 space-y-5">
        {/* ── Chronological Stop Sequence Itinerary ── */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-indigo-600" />
              <span>Chronological Stop Sequence</span>
            </h4>
            <span className="text-[11px] font-semibold text-slate-500">
              {chronologicalStops.length} Total Route Stops
            </span>
          </div>

          <div className="divide-y divide-slate-200">
            {chronologicalStops.map((stop, idx) => {
              const { completed, active } = getStopStatus(stop);
              const isPickup = stop.type === 'pickup';
              const matchedLoad = loads.find(l => l.id === stop.loadId);

              return (
                <div 
                  key={`${stop.loadId}-${stop.type}-${idx}`} 
                  className={`py-2.5 flex items-start justify-between gap-3 ${
                    active ? 'bg-indigo-50/60 -mx-2 px-2 rounded-lg' : ''
                  }`}
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shrink-0 mt-0.5 ${
                      completed 
                        ? 'bg-emerald-600 text-white' 
                        : active 
                        ? 'bg-indigo-600 text-white ring-2 ring-indigo-300' 
                        : 'bg-slate-200 text-slate-700'
                    }`}>
                      {completed ? '✓' : idx + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900 truncate">
                          Stop {idx + 1}: {stop.rawAddress?.city || stop.location}, {stop.rawAddress?.state || ''}
                        </span>
                        <Badge className={`text-[10px] font-extrabold px-1.5 py-0 ${
                          isPickup 
                            ? 'bg-blue-100 text-blue-800 border-blue-200' 
                            : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                        }`}>
                          {isPickup ? 'PICKUP' : 'DROPOFF'}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-slate-500 truncate">
                        {stop.searchableAddress}
                      </p>
                      {stop.rawAddress?.contactPhone && (
                        <a
                          href={`tel:${stop.rawAddress.contactPhone}`}
                          className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 font-semibold mt-0.5"
                          title="Tap to call facility"
                        >
                          <Phone className="w-2.5 h-2.5" />
                          <span>{stop.rawAddress.contactPhone}</span>
                        </a>
                      )}
                      {matchedLoad && (
                        <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1.5">
                          <span>Load #{matchedLoad.loadNumber || matchedLoad.id?.substring(0, 6)}</span>
                          {matchedLoad.cargoDescription && (
                            <>
                              <span>•</span>
                              <span className="truncate max-w-[200px]">{matchedLoad.cargoDescription}</span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    {completed ? (
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        Completed
                      </span>
                    ) : active ? (
                      <span className="text-[10px] font-bold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded border border-indigo-200 animate-pulse">
                        Current Stop
                      </span>
                    ) : (
                      <span className="text-[10px] font-medium text-slate-400">
                        Upcoming
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Practical Turn-by-Turn Multi-Stop Navigation ── */}
        <div className="space-y-2 pt-1">
          <div className="flex items-center gap-2">
            <a
              href={nextStopMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 h-12 bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white font-bold text-sm rounded-xl shadow-sm flex items-center justify-between px-3.5 transition-all"
              title={`Navigate directly to Next Stop: ${currentStop?.location || 'Next Stop'} in Google Maps`}
            >
              <div className="flex items-center gap-2.5 truncate text-left">
                <div className="w-7 h-7 rounded-lg bg-blue-500/40 flex items-center justify-center shrink-0">
                  <Navigation2 className="w-4 h-4 fill-white text-white" />
                </div>
                <div className="truncate">
                  <div className="text-xs font-black tracking-tight leading-none flex items-center gap-1.5">
                    <span>Navigate to Next Stop</span>
                    {currentStop && (
                      <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-800/60 text-blue-100">
                        Stop {currentLegNumber} • {currentStop.type === 'pickup' ? 'Pickup' : 'Delivery'}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] font-semibold text-blue-100/90 truncate mt-0.5">
                    {currentStop ? (currentStop.rawAddress?.city ? `${currentStop.rawAddress.city}, ${currentStop.rawAddress.state || ''}` : currentStop.location) : 'All Stops Completed'}
                  </div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-blue-200 shrink-0 ml-1" />
            </a>

            {isApple && (
              <a
                href={nextStopAppleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="h-12 px-3 border border-blue-200 bg-blue-50/70 hover:bg-blue-100 text-blue-900 font-bold text-xs rounded-xl shadow-xs shrink-0 flex flex-col items-center justify-center leading-none gap-1"
                title="Open turn-by-turn directions in Apple Maps"
              >
                <Compass className="w-4 h-4 text-blue-700" />
                <span className="text-[10px]">Apple</span>
              </a>
            )}
          </div>

          {/* Secondary Full Remaining Trip link */}
          <div className="flex items-center justify-between px-1 text-xs">
            <a
              href={remainingRouteMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] font-bold text-blue-700 hover:text-blue-900 hover:underline flex items-center gap-1"
              title="Open all remaining stops in Google Maps"
            >
              <Compass className="w-3.5 h-3.5 text-blue-600" />
              <span>Full Remaining Trip Route ({remainingStops.length} stops)</span>
            </a>

            {driverCoords ? (
              <span className="text-[10px] text-emerald-700 font-medium flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
                GPS Live
              </span>
            ) : (
              <span className="text-[10px] text-slate-400 font-medium">GPS Ready</span>
            )}
          </div>
        </div>

        {/* ── Consolidated Load Details Accordion ── */}
        <div className="space-y-2 pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between text-xs font-bold text-slate-600">
            <span>Consolidated Freight Documents &amp; Paperwork ({loads.length} Loads)</span>
          </div>

          <div className="space-y-2">
            {loads.map((load, idx) => {
              const isExpanded = expandedLoadId === load.id;
              const hasSignedBol = Boolean(load.signedBolUrl);

              return (
                <div key={load.id} className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                  <div 
                    onClick={() => setExpandedLoadId(isExpanded ? null : load.id!)}
                    className="p-3.5 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-indigo-600" />
                      <span className="text-xs font-bold text-slate-800">
                        Load #{load.loadNumber || load.id?.substring(0, 8)}
                      </span>
                      <span className="text-xs text-slate-500">
                        ({load.origin.city} → {load.destination.city})
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge className={`text-[10px] font-semibold ${
                        hasSignedBol 
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300' 
                          : 'bg-amber-100 text-amber-800 border-amber-300'
                      }`}>
                        {hasSignedBol ? '✓ BOL Uploaded' : 'Awaiting Paperwork'}
                      </Badge>
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="p-4 bg-slate-50/70 border-t border-slate-200 space-y-3">
                      <div className="text-xs text-slate-600">
                        <p className="font-semibold text-slate-700 mb-1">Cargo:</p>
                        <p>{load.cargoDescription || 'No description provided'}</p>
                      </div>

                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onViewActiveBol(load)}
                          className="h-8 text-xs font-semibold"
                        >
                          <FileText className="w-3.5 h-3.5 mr-1 text-indigo-600" />
                          <span>View BOL</span>
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onLogExpense(load)}
                          className="h-8 text-xs font-semibold bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100"
                        >
                          <Receipt className="w-3.5 h-3.5 mr-1 text-amber-700" />
                          <span>Log Expense</span>
                        </Button>

                        {!hasSignedBol && (
                          <Button
                            size="sm"
                            onClick={() => onOpenEpod(load)}
                            className="h-8 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
                          >
                            <span>Complete e-POD</span>
                          </Button>
                        )}
                      </div>

                      {/* Paperwork Upload Component */}
                      <div className="pt-2">
                        <SignedBolUpload load={load} updateLoad={onUpdateLoad} label="Upload Signed BOL for this load" compact={true} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
