'use client';

import React, { useState } from 'react';
import type { Trip, Load, DriverProfile, Vehicle } from '@/types';
import {
  buildChronologicalTripStops,
  computeDeckPositions,
  formatDeckPositionBadge,
  getCombinedTripGoogleMapsUrl,
  getTripStopProgressState,
  cleanSearchableAddress,
  getNextStopGoogleMapsUrl,
  getNextStopAppleMapsUrl,
  isIosDevice,
  type ChronologicalTripStop,
} from '@/lib/routeUtils';
import { hasLoadPod } from '@/lib/loadStatus';
import { isLoadDetentionActive } from '@/lib/detention';
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
  Layers,
  Send,
  X,
  Phone,
  Truck,
  Route,
  PenLine,
  Settings,
} from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { SignedBolUpload } from '@/components/loads/SignedBolUpload';

const MANUAL_PHASES: { value: Load['status']; label: string }[] = [
  { value: 'dispatched', label: 'Dispatched / En Route to Pickup' },
  { value: 'arrived-origin', label: 'Arrived at Origin (At pickup facility)' },
  { value: 'loading', label: 'Loading (Freight being loaded)' },
  { value: 'in-transit', label: 'In Transit (Loaded — En route to delivery)' },
  { value: 'arrived-destination', label: 'Arrived at Destination (At drop-off facility)' },
  { value: 'unloading', label: 'Unloading (Freight being unloaded)' },
  { value: 'delivered', label: 'Delivered / Completed' },
  { value: 'waiting', label: 'Waiting / Detention' },
  { value: 'on-break', label: 'On Break' },
];

const EXCEPTION_FLAGS = [
  { key: 'Mechanical Issue', emoji: '🔧', color: 'bg-red-100 text-red-700 border-red-300 hover:bg-red-200' },
  { key: 'Health / Medical', emoji: '🏥', color: 'bg-rose-100 text-rose-700 border-rose-300 hover:bg-rose-200' },
  { key: 'DOT Break / Rest', emoji: '💤', color: 'bg-blue-100 text-blue-700 border-blue-300 hover:bg-blue-200' },
  { key: 'Weather / Traffic', emoji: '🌧️', color: 'bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-200' },
] as const;

interface TripManifestCardProps {
  trip: Trip;
  loads: Load[];
  driverProfile?: DriverProfile | null;
  assignedTruck?: Vehicle | null;
  assignedTrailer?: Vehicle | null;
  onUpdateLoad: (id: string, updates: Partial<Load>) => Promise<void>;
  onAcceptLoad?: (load: Load) => Promise<void>;
  onDeclineLoad?: (load: Load) => void;
  onLogExpense?: (load: Load) => void;
  onOpenEpod?: (load: Load) => void;
  onViewActiveBol?: (load: Load) => void;
  reportDriverException?: (loadId: string, exception: any, note?: string) => Promise<void>;
  updateDriverNote?: (loadId: string, note: string) => Promise<void>;
}

function getStopActionDetails(stop: ChronologicalTripStop, load?: Load): {
  nextStatus: Load['status'];
  buttonLabel: string;
  sublabel: string;
  extraUpdates?: Partial<Load>;
} {
  const s = String(load?.status || '').toLowerCase().trim();
  const nowIso = new Date().toISOString();
  const loadLabel = load?.loadNumber ? `#${load.loadNumber}` : `#${(load?.id || '').substring(0, 6)}`;

  if (stop.type === 'pickup') {
    if (['pending', 'pending_approval', 'approved', 'client-request-approved', 'idle'].includes(s)) {
      return {
        nextStatus: 'dispatched',
        buttonLabel: `Start En Route to Pickup (${loadLabel})`,
        sublabel: `${stop.deckLabel ? `${stop.deckLabel} • ` : ''}${stop.rawAddress?.city || stop.location}`,
      };
    }
    if (s === 'dispatched' || s === 'deadheading') {
      return {
        nextStatus: 'arrived-origin',
        buttonLabel: `Mark Arrived at Pickup (${loadLabel})`,
        sublabel: `At shipper in ${stop.rawAddress?.city || stop.location} — ready to stage & load`,
        extraUpdates: {
          arrivedAt: load?.arrivedAt || nowIso,
          detentionActive: true,
        },
      };
    }
    if (s === 'arrived-origin') {
      return {
        nextStatus: 'loading',
        buttonLabel: `Confirm Loading onto Deck (${loadLabel})`,
        sublabel: stop.deckLabel ? `Securing ${stop.deckLabel} onto trailer` : 'Securing cargo onto trailer deck',
        extraUpdates: { detentionActive: false },
      };
    }
    return {
      nextStatus: 'in-transit',
      buttonLabel: `Loaded — Depart Pickup (${loadLabel})`,
      sublabel: 'Freight strapped & secured — advance to next trip stop',
      extraUpdates: {
        driverPhase: 'Enroute to Destination',
        detentionActive: false,
      },
    };
  }

  // Delivery / dropoff stop
  if (s === 'in-transit' || ['pending', 'approved', 'dispatched', 'arrived-origin', 'loading'].includes(s)) {
    return {
      nextStatus: 'arrived-destination',
      buttonLabel: `Mark Arrived at Delivery (${loadLabel})`,
      sublabel: `${stop.deckLabel ? `${stop.deckLabel} • ` : ''}At receiver in ${stop.rawAddress?.city || stop.location}`,
      extraUpdates: {
        arrivedAt: nowIso,
        detentionActive: true,
      },
    };
  }
  if (s === 'arrived' || s === 'arrived-destination' || s === 'waiting') {
    return {
      nextStatus: 'unloading',
      buttonLabel: `Confirm Unloading Started (${loadLabel})`,
      sublabel: stop.deckLabel ? `Unloading ${stop.deckLabel} from trailer` : 'Receiver unloading cargo',
      extraUpdates: { detentionActive: false },
    };
  }
  const hasBol = Boolean(load && hasLoadPod(load));
  return {
    nextStatus: 'delivered',
    buttonLabel: `Complete Delivery (${loadLabel})`,
    sublabel: 'Unload finished — record drop-off timestamp',
    extraUpdates: {
      driverPhase: 'Complete',
      deliveredAt: load?.deliveredAt || nowIso,
      paperworkStatus: hasBol ? 'pod_uploaded' : 'pending_pod',
      detentionActive: false,
    },
  };
}

export function TripManifestCard({
  trip,
  loads,
  driverProfile,
  assignedTruck,
  assignedTrailer,
  onUpdateLoad,
  onAcceptLoad,
  onDeclineLoad,
  onLogExpense,
  onOpenEpod,
  onViewActiveBol,
  reportDriverException,
  updateDriverNote,
}: TripManifestCardProps) {
  const [isUpdatingLeg, setIsUpdatingLeg] = useState(false);
  const [busyLoadId, setBusyLoadId] = useState<string | null>(null);
  const [isAcceptingAll, setIsAcceptingAll] = useState(false);
  const [expandedStopId, setExpandedStopId] = useState<string | null>(null);
  const [expandedLoadId, setExpandedLoadId] = useState<string | null>(null);
  const [noteByLoad, setNoteByLoad] = useState<Record<string, string>>({});
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

  // Deck positions (1 = First Off, N = Last Off)
  const deckPositions = React.useMemo(() => computeDeckPositions(loads), [loads]);
  const getDeckForLoad = (loadId?: string) => deckPositions.find(d => d.loadId === loadId);

  // Ordered trip stops respecting Deck Order (Pickups: Last Off -> First Off; Deliveries: First Off -> Last Off)
  const chronologicalStops: ChronologicalTripStop[] = React.useMemo(() => {
    return buildChronologicalTripStops(loads);
  }, [loads]);

  // Totals across trip loads
  const totalWeight = loads.reduce((sum, l) => sum + ((l.cargoWeightNum || 0) * (l.cargoQuantity || 1)), 0);
  const totalLinearFeet = loads.reduce((sum, l) => sum + ((l.cargoLength || 0) * (l.cargoQuantity || 1)), 0);
  const totalLoadedMiles = loads.reduce((sum, l) => sum + (Number(l.distance) || 0), 0);

  const getStopStatus = (stop: ChronologicalTripStop) => {
    const load = loads.find(l => l.id === stop.loadId);
    return getTripStopProgressState(stop, load);
  };

  // First uncompleted stop in sequence
  const activeStopIndex = chronologicalStops.findIndex(stop => !getStopStatus(stop).completed);
  const currentLegNumber = activeStopIndex >= 0 ? activeStopIndex + 1 : chronologicalStops.length;
  const currentStop = activeStopIndex >= 0 ? chronologicalStops[activeStopIndex] : null;
  const currentStopLoad = currentStop ? loads.find(l => l.id === currentStop.loadId) : undefined;

  const remainingStops = React.useMemo(() => {
    return chronologicalStops.filter(stop => !getStopStatus(stop).completed);
  }, [chronologicalStops, loads]);

  // Navigation URLs
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

  // Combined multi-stop route for all remaining stops in exact trip sequence
  const combinedRemainingMapsUrl = React.useMemo(() => {
    return getCombinedTripGoogleMapsUrl(loads, driverCoords, true);
  }, [loads, driverCoords]);

  // Full start-to-finish route across all stops in exact sequence
  const fullAllStopsMapsUrl = React.useMemo(() => {
    return getCombinedTripGoogleMapsUrl(loads, driverCoords, false);
  }, [loads, driverCoords]);

  // Unique city-state chain for the Combined Route visual banner
  const routeCorridorChain = React.useMemo(() => {
    const labels: { label: string; type: 'pickup' | 'dropoff'; deckOrder?: number }[] = [];
    for (const s of chronologicalStops) {
      const citySt = [s.rawAddress?.city, s.rawAddress?.state].filter(Boolean).join(', ') || s.location;
      const prev = labels[labels.length - 1];
      if (prev && prev.label.toLowerCase() === citySt.toLowerCase() && prev.type === s.type) {
        continue;
      }
      labels.push({ label: citySt, type: s.type, deckOrder: s.deckOrder });
    }
    return labels;
  }, [chronologicalStops]);

  const unacceptedLoads = loads.filter(
    l =>
      l.driverAcceptedStatus !== 'accepted' &&
      ['pending', 'pending_approval', 'approved', 'client-request-approved', 'dispatched'].includes(
        String(l.status || '').toLowerCase()
      )
  );

  const handleAcceptAllTripLoads = async () => {
    if (!onAcceptLoad || unacceptedLoads.length === 0) return;
    setIsAcceptingAll(true);
    try {
      for (const l of unacceptedLoads) {
        await onAcceptLoad(l);
      }
    } finally {
      setIsAcceptingAll(false);
    }
  };

  const handleAdvanceCurrentLeg = async () => {
    if (!currentStop || !currentStop.loadId) return;
    const targetLoad = loads.find(l => l.id === currentStop.loadId);
    if (!targetLoad?.id) return;

    const action = getStopActionDetails(currentStop, targetLoad);
    setIsUpdatingLeg(true);
    try {
      await onUpdateLoad(targetLoad.id, {
        status: action.nextStatus,
        ...(action.extraUpdates || {}),
      });
    } catch (err) {
      console.error('Failed to advance trip stop:', err);
    } finally {
      setIsUpdatingLeg(false);
    }
  };

  const handleManualPhaseUpdate = async (load: Load, nextPhase: Load['status']) => {
    if (!load.id) return;
    const nowIso = new Date().toISOString();
    const hasBol = hasLoadPod(load);
    setBusyLoadId(load.id);
    try {
      await onUpdateLoad(load.id, {
        status: nextPhase,
        ...(nextPhase === 'arrived-origin' || nextPhase === 'arrived-destination'
          ? { arrivedAt: load.arrivedAt || nowIso, detentionActive: true }
          : { detentionActive: false }),
        ...(nextPhase === 'delivered'
          ? {
              driverPhase: 'Complete',
              deliveredAt: load.deliveredAt || nowIso,
              paperworkStatus: hasBol ? 'pod_uploaded' : 'pending_pod',
            }
          : {}),
      });
    } finally {
      setBusyLoadId(null);
    }
  };

  const handleToggleException = async (load: Load, flagKey: string) => {
    if (!load.id || !reportDriverException) return;
    const isActive = load.driverExceptionFlag === flagKey;
    const note = noteByLoad[load.id]?.trim() || undefined;
    setBusyLoadId(load.id);
    try {
      await reportDriverException(load.id, isActive ? null : flagKey, note);
      if (!isActive) {
        setNoteByLoad(prev => ({ ...prev, [load.id!]: '' }));
      }
    } finally {
      setBusyLoadId(null);
    }
  };

  const handleSendNote = async (load: Load) => {
    if (!load.id) return;
    const note = noteByLoad[load.id]?.trim();
    if (!note) return;
    setIsSubmittingNote(load.id);
    try {
      if (updateDriverNote) {
        await updateDriverNote(load.id, note);
      } else {
        await onUpdateLoad(load.id, {
          driverNote: note,
          driverNoteUpdatedAt: new Date().toISOString(),
        });
      }
      setNoteByLoad(prev => ({ ...prev, [load.id!]: '' }));
    } finally {
      setIsSubmittingNote(null);
    }
  };

  const equipmentSummary = [
    assignedTruck?.unitNumber ? `Trk #${assignedTruck.unitNumber}` : null,
    assignedTrailer?.unitNumber ? `Trl #${assignedTrailer.unitNumber}` : null,
  ].filter(Boolean).join(' • ');

  const currentAction = currentStop ? getStopActionDetails(currentStop, currentStopLoad) : null;

  return (
    <Card className="border-0 shadow-md rounded-2xl overflow-hidden relative bg-white ring-2 ring-indigo-500/40">
      {/* Indigo Accent Strip for Sequenced Multi-Load Vehicle Trips */}
      <div className="absolute top-0 left-0 w-2 h-full bg-gradient-to-b from-indigo-600 via-blue-600 to-emerald-500" />

      {/* Exception Banners across any load in trip */}
      {loads.filter(l => l.driverExceptionFlag).map(flaggedLoad => (
        <div
          key={`flag-${flaggedLoad.id}`}
          className="ml-2 bg-red-50 border-b border-red-200 px-4 py-2 flex items-center gap-2"
        >
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
          <div className="flex-1 min-w-0 text-xs">
            <span className="font-bold text-red-700">
              Load #{flaggedLoad.loadNumber || flaggedLoad.id?.substring(0, 6)}: {flaggedLoad.driverExceptionFlag}
            </span>
            {flaggedLoad.driverNote && (
              <span className="text-red-600 ml-1.5">— {flaggedLoad.driverNote}</span>
            )}
          </div>
        </div>
      ))}

      <CardHeader className="pb-4 border-b border-slate-100 pl-5 pr-4 pt-4 bg-gradient-to-r from-indigo-50/50 via-white to-white">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className="bg-indigo-600 hover:bg-indigo-600 text-white font-extrabold flex items-center gap-1.5 text-[11px] px-2.5 py-0.5 shadow-xs">
              <Layers className="w-3.5 h-3.5" />
              <span>COMBINED VEHICLE TRIP</span>
            </Badge>
            {trip.tripNumber && (
              <span className="text-xs font-mono font-bold text-indigo-950">
                #{trip.tripNumber}
              </span>
            )}
            {equipmentSummary && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                <Truck className="w-3 h-3 text-indigo-600" />
                {equipmentSummary}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 flex-wrap text-xs font-semibold text-slate-600">
            <Badge variant="outline" className="bg-white border-indigo-200 text-indigo-900 font-bold text-[10px]">
              {loads.length} Loads • {chronologicalStops.length} Stops
            </Badge>
            {totalWeight > 0 && (
              <Badge variant="outline" className="bg-white border-slate-200 text-[10px]">
                {totalWeight.toLocaleString()} lbs
              </Badge>
            )}
            {totalLinearFeet > 0 && (
              <Badge variant="outline" className="bg-white border-slate-200 text-[10px]">
                {totalLinearFeet} ft Deck
              </Badge>
            )}
          </div>
        </div>

        {/* Deck Stack Summary Pills (First Off -> Last Off) */}
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mr-0.5">
            Deck Sequence:
          </span>
          {[...loads]
            .sort((a, b) => (getDeckForLoad(a.id)?.deckOrder ?? 99) - (getDeckForLoad(b.id)?.deckOrder ?? 99))
            .map(l => {
              const deck = getDeckForLoad(l.id);
              const badgeText = formatDeckPositionBadge(deck, loads.length);
              return (
                <Badge
                  key={l.id}
                  className={`text-[10px] font-bold px-2 py-0.5 ${
                    deck?.isTopLoad
                      ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                      : 'bg-amber-100 text-amber-900 border border-amber-300'
                  }`}
                >
                  #{l.loadNumber || l.id?.substring(0, 6)} • {badgeText}
                </Badge>
              );
            })}
        </div>

        {/* Combined Route Corridor Overview */}
        {routeCorridorChain.length > 0 && (
          <div className="mt-3 rounded-xl bg-slate-900 text-white p-3 space-y-2 shadow-xs">
            <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wider font-bold text-indigo-300">
              <span className="flex items-center gap-1.5">
                <Route className="w-3.5 h-3.5 text-indigo-400" />
                <span>Combined Sequenced Trip Route</span>
              </span>
              {totalLoadedMiles > 0 && (
                <span className="text-slate-300">{totalLoadedMiles.toLocaleString()} loaded mi</span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold">
              {routeCorridorChain.map((node, i) => (
                <React.Fragment key={`${node.label}-${i}`}>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] ${
                      node.type === 'pickup'
                        ? 'bg-blue-500/20 text-blue-200 border border-blue-400/30'
                        : 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/30'
                    }`}
                  >
                    <span className="text-[9px] uppercase opacity-80">{node.type === 'pickup' ? 'PU' : 'DEL'}</span>
                    <span>{node.label}</span>
                  </span>
                  {i < routeCorridorChain.length - 1 && (
                    <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        )}

        {/* Unaccepted Loads Confirmation Banner */}
        {onAcceptLoad && unacceptedLoads.length > 0 && (
          <div className="mt-3 rounded-xl bg-amber-50 border border-amber-300 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-extrabold text-amber-950 uppercase tracking-wide">
                Confirm Assigned Trip ({unacceptedLoads.length} {unacceptedLoads.length === 1 ? 'load' : 'loads'} pending acceptance)
              </span>
              <Badge className="bg-amber-200 text-amber-950 text-[10px] font-bold">Action Required</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                disabled={isAcceptingAll}
                onClick={handleAcceptAllTripLoads}
                className="h-9 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg shadow-xs cursor-pointer"
              >
                {isAcceptingAll ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                )}
                Accept All {unacceptedLoads.length > 1 ? `${unacceptedLoads.length} Trip Loads` : 'Load'}
              </Button>
              <span className="text-[11px] text-amber-900">
                Or expand any stop below to accept or decline individual loads.
              </span>
            </div>
          </div>
        )}

        {/* ── Combined Trip Navigation (Whole Trip + Next Stop) ── */}
        <div className="mt-3.5 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {/* Whole Trip Combined Multi-Stop Navigation */}
            <a
              href={combinedRemainingMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="h-12 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] text-white font-bold text-xs rounded-xl shadow-sm flex items-center justify-between px-3.5 transition-all"
              title="Open single combined Google Maps route with all remaining pickups and deliveries in sequence"
            >
              <div className="flex items-center gap-2.5 min-w-0 text-left">
                <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
                  <Route className="w-4 h-4 text-white" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-black tracking-tight leading-none truncate">
                    Navigate Whole Trip ({remainingStops.length || chronologicalStops.length} Stops)
                  </div>
                  <div className="text-[10px] font-semibold text-indigo-100 truncate mt-0.5">
                    All pickups &amp; deliveries in deck order
                  </div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-indigo-200 shrink-0 ml-1" />
            </a>

            {/* Immediate Next Stop Turn-by-Turn */}
            <div className="flex items-center gap-1.5">
              <a
                href={nextStopMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 h-12 bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white font-bold text-xs rounded-xl shadow-sm flex items-center justify-between px-3.5 transition-all"
                title={`Navigate directly to Stop ${currentLegNumber}`}
              >
                <div className="flex items-center gap-2 min-w-0 text-left">
                  <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
                    <Navigation2 className="w-4 h-4 fill-white text-white" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-black tracking-tight leading-none truncate">
                      Next: Stop {currentLegNumber} ({currentStop?.type === 'pickup' ? 'Pickup' : 'Delivery'})
                    </div>
                    <div className="text-[10px] font-semibold text-blue-100 truncate mt-0.5">
                      {currentStop
                        ? [currentStop.rawAddress?.city, currentStop.rawAddress?.state].filter(Boolean).join(', ') || currentStop.location
                        : 'All Stops Completed'}
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
                  className="h-12 px-2.5 border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-900 font-bold text-xs rounded-xl shadow-xs shrink-0 flex flex-col items-center justify-center leading-none gap-1"
                  title="Open next stop in Apple Maps"
                >
                  <Compass className="w-4 h-4 text-blue-700" />
                  <span className="text-[10px]">Apple</span>
                </a>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between px-1 text-[11px]">
            <a
              href={fullAllStopsMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-indigo-700 hover:text-indigo-900 hover:underline flex items-center gap-1"
            >
              <Compass className="w-3.5 h-3.5 text-indigo-600" />
              <span>Preview Complete {chronologicalStops.length}-Stop Trip Map</span>
            </a>
            {driverCoords ? (
              <span className="text-[10px] text-emerald-700 font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                GPS Live
              </span>
            ) : (
              <span className="text-[10px] text-slate-400 font-medium">GPS Ready</span>
            )}
          </div>
        </div>

        {/* ── Current Stop Progress & Primary Action Button ── */}
        <div className="mt-3.5 pt-3 border-t border-slate-200/80 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-800 flex items-center gap-1.5">
              <Navigation2 className="w-3.5 h-3.5 text-indigo-600" />
              <span>Trip Progress: Stop {currentLegNumber} of {chronologicalStops.length}</span>
            </span>
            {currentStop?.deckLabel && (
              <Badge className="bg-indigo-100 text-indigo-900 border-indigo-200 text-[10px] font-bold">
                {currentStop.deckLabel}
              </Badge>
            )}
          </div>

          {/* Segmented Stop Progress Bar */}
          <div
            className="grid gap-1.5"
            style={{ gridTemplateColumns: `repeat(${Math.max(1, chronologicalStops.length)}, minmax(0, 1fr))` }}
          >
            {chronologicalStops.map((stop, idx) => {
              const { completed } = getStopStatus(stop);
              const isCurrent = idx === activeStopIndex;
              return (
                <div key={stop.id || `${stop.loadId}-${idx}`} className="space-y-1">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      completed
                        ? 'bg-emerald-500'
                        : isCurrent
                        ? 'bg-indigo-600 animate-pulse'
                        : 'bg-slate-200'
                    }`}
                  />
                  <div className="text-[9px] text-center font-bold truncate text-slate-600">
                    {idx + 1}. {stop.type === 'pickup' ? 'PU' : 'DEL'}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Facility Detention Banner if Current Stop Load has Active Detention */}
          {currentStopLoad && isLoadDetentionActive(currentStopLoad) && (
            <div className="bg-teal-50 border border-teal-200 rounded-xl p-2.5 flex items-center justify-between text-xs text-teal-900">
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2 rounded-full bg-teal-500 animate-ping shrink-0" />
                <span className="font-bold">Arrived at Facility • Detention Clock Active</span>
              </div>
              {currentStopLoad.arrivedAt && (
                <span className="text-[10px] font-semibold text-teal-700">
                  {new Date(currentStopLoad.arrivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
          )}

          {/* Primary Next Step Button for Current Stop */}
          {currentStop && currentAction && (
            <button
              type="button"
              disabled={isUpdatingLeg}
              onClick={handleAdvanceCurrentLeg}
              className="w-full min-h-[50px] py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-white font-black rounded-xl text-left flex items-center justify-between shadow-md transition-all cursor-pointer"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
                  {isUpdatingLeg ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-white" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-xs sm:text-sm font-black leading-tight flex items-center gap-1.5 truncate">
                    <span>Stop {currentLegNumber}: {currentAction.buttonLabel}</span>
                  </div>
                  <div className="text-[11px] font-medium text-emerald-50 truncate mt-0.5">
                    {currentAction.sublabel}
                  </div>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 opacity-90 shrink-0 ml-2" />
            </button>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-4 pl-5 space-y-4">
        {/* ── Sequenced Trip Stops (Pickups & Deliveries with Individual Load Details) ── */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between px-0.5">
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-indigo-600" />
              <span>Trip Stops in Deck Order ({chronologicalStops.length})</span>
            </h4>
            <span className="text-[10px] font-semibold text-slate-500">
              Tap any stop for load details &amp; BOL
            </span>
          </div>

          <div className="space-y-2.5">
            {chronologicalStops.map((stop, idx) => {
              const { completed } = getStopStatus(stop);
              const isCurrent = idx === activeStopIndex;
              const isPickup = stop.type === 'pickup';
              const matchedLoad = loads.find(l => l.id === stop.loadId);
              const stopKey = stop.id || `${stop.loadId}-${stop.type}-${idx}`;
              const isStopExpanded = expandedStopId === stopKey;
              const stopNavUrl = getNextStopGoogleMapsUrl(
                cleanSearchableAddress(stop.rawAddress || stop.location),
                driverCoords
              );
              const hasBolUploaded = Boolean(matchedLoad && hasLoadPod(matchedLoad));

              return (
                <div
                  key={stopKey}
                  id={idx === 0 && matchedLoad?.id ? `driver-load-${matchedLoad.id}` : undefined}
                  className={`rounded-xl border transition-all overflow-hidden ${
                    isCurrent
                      ? 'border-indigo-400 bg-indigo-50/40 ring-1 ring-indigo-300 shadow-xs'
                      : completed
                      ? 'border-emerald-200 bg-emerald-50/20'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5 min-w-0 flex-1">
                        <span
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shrink-0 mt-0.5 ${
                            completed
                              ? 'bg-emerald-600 text-white'
                              : isCurrent
                              ? 'bg-indigo-600 text-white'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {completed ? '✓' : idx + 1}
                        </span>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Badge
                              className={`text-[10px] font-extrabold px-1.5 py-0 ${
                                isPickup
                                  ? 'bg-blue-100 text-blue-800 border-blue-200'
                                  : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                              }`}
                            >
                              {isPickup
                                ? 'PICKUP'
                                : stop.multiDropTotalStops && stop.multiDropTotalStops > 1
                                ? `DELIVERY (${stop.multiDropStopNumber}/${stop.multiDropTotalStops})`
                                : 'DELIVERY'}
                            </Badge>

                            {stop.deckLabel && (
                              <Badge
                                className={`text-[10px] font-bold px-1.5 py-0 ${
                                  stop.isTopLoad
                                    ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                                    : 'bg-amber-100 text-amber-900 border-amber-300'
                                }`}
                              >
                                {stop.deckLabel}
                                {isPickup
                                  ? stop.isBottomLoad
                                    ? ' (Load 1st)'
                                    : stop.isTopLoad
                                    ? ' (Load Last)'
                                    : ''
                                  : ''}
                              </Badge>
                            )}

                            {matchedLoad && (
                              <span className="text-[11px] font-mono font-bold text-slate-600">
                                Load #{matchedLoad.loadNumber || matchedLoad.id?.substring(0, 6)}
                              </span>
                            )}

                            {stop.sameFacilityAsPrevious && (
                              <Badge variant="outline" className="text-[9px] bg-white border-slate-300 text-slate-600 py-0">
                                Same Facility
                              </Badge>
                            )}
                          </div>

                          <div className="font-extrabold text-xs sm:text-sm text-slate-900 mt-1">
                            {stop.rawAddress?.companyName ? `${stop.rawAddress.companyName} — ` : ''}
                            {[stop.rawAddress?.city, stop.rawAddress?.state].filter(Boolean).join(', ') || stop.location}
                          </div>
                          <p className="text-[11px] text-slate-600 break-words">
                            {stop.searchableAddress}
                          </p>

                          {(stop.rawAddress?.contactName || stop.rawAddress?.contactPhone) && (
                            <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-600 flex-wrap">
                              {stop.rawAddress.contactName && (
                                <span className="font-medium">{stop.rawAddress.contactName}</span>
                              )}
                              {stop.rawAddress.contactPhone && (
                                <a
                                  href={`tel:${stop.rawAddress.contactPhone}`}
                                  className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-semibold"
                                >
                                  <Phone className="w-2.5 h-2.5" />
                                  <span>{stop.rawAddress.contactPhone}</span>
                                </a>
                              )}
                            </div>
                          )}

                          {/* Cargo summary line */}
                          {matchedLoad && (
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-600">
                              <span className="font-semibold text-slate-800">
                                {stop.cargoDescription || matchedLoad.cargoDescription || 'Freight'}
                              </span>
                              {matchedLoad.cargoWeightNum ? (
                                <span className="text-slate-500">• {matchedLoad.cargoWeightNum.toLocaleString()} lbs</span>
                              ) : null}
                              {matchedLoad.cargoLength ? (
                                <span className="text-slate-500">• {matchedLoad.cargoLength} ft</span>
                              ) : null}
                              {matchedLoad.requiresTarping && (
                                <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-[9px] py-0 font-bold">
                                  Tarp
                                </Badge>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        {completed ? (
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200">
                            Completed
                          </span>
                        ) : isCurrent ? (
                          <span className="text-[10px] font-bold text-indigo-800 bg-indigo-100 px-2 py-0.5 rounded border border-indigo-300">
                            Current Stop
                          </span>
                        ) : (
                          <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                            Stop {idx + 1}
                          </span>
                        )}

                        <a
                          href={stopNavUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold shadow-2xs"
                          title={`Navigate to Stop ${idx + 1}`}
                        >
                          <Navigation2 className="w-3 h-3" />
                          <span>Navigate</span>
                        </a>
                      </div>
                    </div>

                    {/* Toggle Individual Load Details right inside this stop */}
                    {matchedLoad && (
                      <div className="pt-1.5 border-t border-slate-200/60 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge
                            className={`text-[10px] font-semibold px-1.5 py-0 ${
                              hasBolUploaded
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                : 'bg-amber-100 text-amber-900 border-amber-300'
                            }`}
                          >
                            {hasBolUploaded ? '✓ BOL Uploaded' : 'Pending BOL / POD'}
                          </Badge>
                          <span className="text-[10px] text-slate-500 capitalize">
                            Status: <strong className="text-slate-700">{matchedLoad.status}</strong>
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => setExpandedStopId(isStopExpanded ? null : stopKey)}
                          className="text-[11px] font-bold text-indigo-700 hover:text-indigo-900 inline-flex items-center gap-1 cursor-pointer"
                        >
                          <span>{isStopExpanded ? 'Hide Load Details' : 'Load Details & Actions'}</span>
                          {isStopExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Expanded Per-Stop Individual Load Details & Controls */}
                  {isStopExpanded && matchedLoad && (
                    <div className="p-3.5 bg-slate-50 border-t border-slate-200 space-y-3 text-xs">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                          <div className="text-[10px] font-bold uppercase text-slate-400">Load Pickup</div>
                          <div className="font-bold text-slate-900 mt-0.5">
                            {matchedLoad.origin?.city}, {matchedLoad.origin?.state} {matchedLoad.origin?.zip}
                          </div>
                          {matchedLoad.origin?.street && (
                            <div className="text-[11px] text-slate-600">{matchedLoad.origin.street}</div>
                          )}
                          {matchedLoad.pickupDateTime && (
                            <div className="text-[10px] text-slate-500 mt-0.5">
                              {new Date(matchedLoad.pickupDateTime).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                            </div>
                          )}
                        </div>
                        <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                          <div className="text-[10px] font-bold uppercase text-slate-400">Load Delivery</div>
                          <div className="font-bold text-slate-900 mt-0.5">
                            {matchedLoad.destination?.city}, {matchedLoad.destination?.state} {matchedLoad.destination?.zip}
                          </div>
                          {matchedLoad.destination?.street && (
                            <div className="text-[11px] text-slate-600">{matchedLoad.destination.street}</div>
                          )}
                          {matchedLoad.deliveryDateTime && (
                            <div className="text-[10px] text-slate-500 mt-0.5">
                              {new Date(matchedLoad.deliveryDateTime).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                            </div>
                          )}
                        </div>
                      </div>

                      {matchedLoad.specialTerms && (
                        <div className="p-2.5 rounded-lg bg-amber-50/70 border border-amber-200 text-[11px] text-amber-950">
                          <strong className="font-bold">Special Instructions: </strong>
                          {matchedLoad.specialTerms}
                        </div>
                      )}

                      {/* Individual Accept / Decline if pending */}
                      {matchedLoad.driverAcceptedStatus !== 'accepted' && (onAcceptLoad || onDeclineLoad) && (
                        <div className="flex items-center gap-2">
                          {onAcceptLoad && (
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => onAcceptLoad(matchedLoad)}
                              className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                              Accept Load #{matchedLoad.loadNumber || matchedLoad.id?.substring(0, 6)}
                            </Button>
                          )}
                          {onDeclineLoad && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => onDeclineLoad(matchedLoad)}
                              className="h-8 border-red-200 bg-white hover:bg-red-50 text-red-700 font-bold text-xs"
                            >
                              <X className="w-3.5 h-3.5 mr-1" />
                              Decline Load
                            </Button>
                          )}
                        </div>
                      )}

                      {/* Quick Action Buttons for this Load */}
                      <div className="flex flex-wrap gap-2">
                        {onViewActiveBol && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => onViewActiveBol(matchedLoad)}
                            className="h-8 text-xs font-bold border-indigo-200 bg-indigo-50/70 text-indigo-900 hover:bg-indigo-100"
                          >
                            <FileText className="w-3.5 h-3.5 mr-1 text-indigo-600" />
                            <span>{matchedLoad.bolSource === 'broker' ? 'Broker BOL' : 'View BOL'}</span>
                          </Button>
                        )}

                        {onLogExpense && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => onLogExpense(matchedLoad)}
                            className="h-8 text-xs font-bold bg-amber-50 text-amber-950 border-amber-300 hover:bg-amber-100"
                          >
                            <Receipt className="w-3.5 h-3.5 mr-1 text-amber-700" />
                            <span>Expense</span>
                            {matchedLoad.actualExpenses && matchedLoad.actualExpenses.length > 0 && (
                              <span className="ml-1 px-1.5 bg-amber-600 text-white rounded-full text-[9px] font-black">
                                {matchedLoad.actualExpenses.length}
                              </span>
                            )}
                          </Button>
                        )}

                        {onOpenEpod && !hasBolUploaded && (
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => onOpenEpod(matchedLoad)}
                            className="h-8 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
                          >
                            <PenLine className="w-3.5 h-3.5 mr-1" />
                            <span>Sign e-POD</span>
                          </Button>
                        )}
                      </div>

                      {/* Signed BOL / POD Upload */}
                      <SignedBolUpload
                        load={matchedLoad}
                        updateLoad={onUpdateLoad}
                        variant="driver"
                        label={`Upload Signed BOL / POD (Load #${matchedLoad.loadNumber || matchedLoad.id?.substring(0, 6)})`}
                      />

                      {/* Manual Status Override for this specific Load */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                          <Settings className="w-3 h-3" />
                          <span>Load Status Override</span>
                        </label>
                        <select
                          value={matchedLoad.status}
                          disabled={busyLoadId === matchedLoad.id}
                          onChange={e => handleManualPhaseUpdate(matchedLoad, e.target.value as Load['status'])}
                          className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-900"
                        >
                          {MANUAL_PHASES.map(p => (
                            <option key={p.value} value={p.value}>
                              {p.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Exception Flags */}
                      {reportDriverException && (
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 text-amber-500" />
                            <span>Report Delay or Exception</span>
                          </span>
                          <div className="grid grid-cols-2 gap-1.5">
                            {EXCEPTION_FLAGS.map(({ key, emoji, color }) => {
                              const isActive = matchedLoad.driverExceptionFlag === key;
                              return (
                                <button
                                  key={key}
                                  type="button"
                                  disabled={busyLoadId === matchedLoad.id}
                                  onClick={() => handleToggleException(matchedLoad, key)}
                                  className={`flex items-center gap-1.5 text-[11px] font-bold border rounded-lg px-2 py-1.5 transition-all text-left cursor-pointer ${
                                    isActive ? `ring-2 ring-red-400 ${color}` : color
                                  }`}
                                >
                                  <span>{emoji}</span>
                                  <span className="truncate flex-1">{key}</span>
                                  {isActive && <X className="w-3 h-3 shrink-0" />}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Note to Dispatcher */}
                      <div className="space-y-1.5">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                          <MessageSquare className="w-3 h-3 text-blue-500" />
                          <span>Note to Dispatcher</span>
                        </span>
                        <div className="flex gap-2">
                          <Textarea
                            rows={2}
                            placeholder="Gate code, dock update, detention note..."
                            value={noteByLoad[matchedLoad.id!] || ''}
                            onChange={e =>
                              setNoteByLoad(prev => ({ ...prev, [matchedLoad.id!]: e.target.value }))
                            }
                            className="text-xs resize-none bg-white border-slate-200"
                          />
                          <Button
                            type="button"
                            size="sm"
                            disabled={
                              !(noteByLoad[matchedLoad.id!] || '').trim() ||
                              isSubmittingNote === matchedLoad.id
                            }
                            onClick={() => handleSendNote(matchedLoad)}
                            className="h-9 px-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold self-end shrink-0"
                          >
                            {isSubmittingNote === matchedLoad.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Send className="w-3.5 h-3.5" />
                            )}
                          </Button>
                        </div>
                        {matchedLoad.driverNote && (
                          <div className="text-[11px] bg-white p-2 rounded-lg border border-slate-200 text-slate-600">
                            <strong className="text-slate-700">Last note: </strong>
                            &ldquo;{matchedLoad.driverNote}&rdquo;
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Individual Loads Summary & Paperwork Bar (Quick Access per Load) ── */}
        <div className="space-y-2 pt-3 border-t border-slate-100">
          <div className="flex items-center justify-between text-xs font-bold text-slate-600">
            <span>Individual Trip Loads &amp; Paperwork ({loads.length})</span>
          </div>

          <div className="space-y-2">
            {[...loads]
              .sort((a, b) => (getDeckForLoad(a.id)?.deckOrder ?? 99) - (getDeckForLoad(b.id)?.deckOrder ?? 99))
              .map(load => {
                const isExpanded = expandedLoadId === load.id;
                const hasSignedBol = hasLoadPod(load);
                const deck = getDeckForLoad(load.id);
                const deckBadge = formatDeckPositionBadge(deck, loads.length);

                return (
                  <div
                    key={load.id}
                    id={`driver-load-${load.id}`}
                    className="border border-slate-200 rounded-xl overflow-hidden bg-white"
                  >
                    <div
                      onClick={() => setExpandedLoadId(isExpanded ? null : load.id!)}
                      className="p-3 flex items-center justify-between gap-2 cursor-pointer hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
                        <Package className="w-4 h-4 text-indigo-600 shrink-0" />
                        <span className="text-xs font-bold text-slate-900 shrink-0">
                          Load #{load.loadNumber || load.id?.substring(0, 8)}
                        </span>
                        {deckBadge && (
                          <Badge
                            className={`text-[10px] font-bold px-1.5 py-0 ${
                              deck?.isTopLoad
                                ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                                : 'bg-amber-100 text-amber-900 border-amber-300'
                            }`}
                          >
                            {deckBadge}
                          </Badge>
                        )}
                        <span className="text-xs text-slate-500 truncate">
                          {load.origin?.city} → {load.destination?.city}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge
                          className={`text-[10px] font-semibold ${
                            hasSignedBol
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                              : 'bg-amber-100 text-amber-900 border-amber-300'
                          }`}
                        >
                          {hasSignedBol ? '✓ BOL' : 'Need BOL'}
                        </Badge>
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-slate-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-slate-400" />
                        )}
                      </div>
                    </div>

                    <div className="px-3 pb-2.5 pt-1 border-t border-slate-100 bg-white">
                      <SignedBolUpload
                        load={load}
                        updateLoad={onUpdateLoad}
                        variant="driver"
                        label="Upload Signed BOL / POD"
                      />
                    </div>

                    {isExpanded && (
                      <div className="p-3.5 bg-slate-50/70 border-t border-slate-200 space-y-2.5 text-xs">
                        <div className="text-slate-600 space-y-1">
                          <div>
                            <strong className="text-slate-800">Cargo: </strong>
                            {load.cargoDescription || 'Freight'}
                            {load.cargoWeightNum ? ` • ${load.cargoWeightNum.toLocaleString()} lbs` : ''}
                            {load.cargoLength ? ` • ${load.cargoLength} ft` : ''}
                          </div>
                          <div>
                            <strong className="text-slate-800">Pickup: </strong>
                            {[load.origin?.street, load.origin?.city, load.origin?.state, load.origin?.zip]
                              .filter(Boolean)
                              .join(', ')}
                          </div>
                          <div>
                            <strong className="text-slate-800">Delivery: </strong>
                            {[load.destination?.street, load.destination?.city, load.destination?.state, load.destination?.zip]
                              .filter(Boolean)
                              .join(', ')}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2 pt-1">
                          {onViewActiveBol && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => onViewActiveBol(load)}
                              className="h-8 text-xs font-semibold"
                            >
                              <FileText className="w-3.5 h-3.5 mr-1 text-indigo-600" />
                              <span>View BOL</span>
                            </Button>
                          )}

                          {onLogExpense && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => onLogExpense(load)}
                              className="h-8 text-xs font-semibold bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100"
                            >
                              <Receipt className="w-3.5 h-3.5 mr-1 text-amber-700" />
                              <span>Log Expense</span>
                            </Button>
                          )}

                          {onOpenEpod && !hasSignedBol && (
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => onOpenEpod(load)}
                              className="h-8 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
                            >
                              <PenLine className="w-3.5 h-3.5 mr-1" />
                              <span>Complete e-POD</span>
                            </Button>
                          )}
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
