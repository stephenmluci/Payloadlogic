'use client';

import React, { useState, useMemo } from 'react';
import { useApp } from '@/context/AppContext';
import { useToast } from '@/hooks/use-toast';
import { calculateTripMetrics } from '@/lib/logisticsEngine';
import { vehicleToEngineTrailer, loadToCargoItem } from '@/lib/logisticsAdapters';
import { computeCompliance } from '@/lib/complianceEngine';
import { buildMultiStopLegs, generateGoogleMapsUrl, buildChronologicalTripGoogleMapsUrl } from '@/lib/routeUtils';
import { ComplianceBadges } from './ComplianceBadges';
import { type RouteLeg, isDriverOffDuty } from '@/types';
import {
  PlusCircle, Trash2, MapPin, ArrowDown, Package,
  User, Hash, AlertTriangle, CheckCircle2, Clock, Truck, ExternalLink,
} from 'lucide-react';

// ── Helpers ────────────────────────────────────────────────────────────────────
// Note: tripNumber is now generated sequentially by AppContext.addTrip —
// callers no longer need to provide it.

const STATUS_COLORS: Record<string, string> = {
  planned:   'bg-slate-100 text-slate-600 border-slate-200',
  active:    'bg-sky-100   text-sky-700   border-sky-200',
  completed: 'bg-green-100 text-green-700 border-green-200',
};

const LEG_ICON: Record<RouteLeg['type'], React.ReactNode> = {
  pickup:  <Package  className="h-3.5 w-3.5 text-sky-600"   />,
  dropoff: <MapPin   className="h-3.5 w-3.5 text-emerald-600" />,
};

const LEG_LABEL: Record<RouteLeg['type'], string> = {
  pickup:  'PICKUP',
  dropoff: 'DROP-OFF',
};

// ── Component ──────────────────────────────────────────────────────────────────

export function TripBuilderPanel() {
  const {
    trips, addTrip, updateTrip, handleDeleteTrip,
    loads, updateLoad,
    driverProfiles, vehicles,
    settings,
  } = useApp();

  const { toast } = useToast();
  const [isCreating, setIsCreating] = useState(false);
  const [newTripName, setNewTripName] = useState('');
  const [newOdometer, setNewOdometer] = useState('');

  // ── Create trip ─────────────────────────────────────────────────────────────
  const handleCreate = async () => {
    const name = newTripName.trim();
    const odo  = Number(newOdometer);
    if (!name || odo <= 0) {
      toast({ variant: 'destructive', title: 'Missing fields', description: 'Trip name and starting odometer are required.' });
      return;
    }
    await addTrip({
      name,
      loadIds:        [],
      startOdometer:  odo,
      status:         'planned',
    });
    setNewTripName('');
    setNewOdometer('');
    setIsCreating(false);
  };

  // ── Per-trip enrichment ──────────────────────────────────────────────────────
  const enrichedTrips = useMemo(() => {
    return trips.map(trip => {
      const tripLoads = loads.filter(l => l.tripId === trip.id && l.status !== 'delivered');

      // Trailer for deck-space calculation
      const trailerId = trip.assignedTrailerId ?? tripLoads[0]?.assignedTrailerId;
      const trailer   = trailerId ? vehicles.find(v => v.id === trailerId) : undefined;
      const engineTrailer = trailer
        ? vehicleToEngineTrailer(trailer)
        : { id: '', description: '', gvwr: 0, emptyWeight: 0, monthlyPayment: 0, maintFundMo: 0, insuranceMo: 0, deckLength: 40, deckWidth: 8.5 };

      // Engine-computed deck footprint
      const engineCargo = tripLoads.map(l => loadToCargoItem(l));

      const engineResult = engineCargo.length > 0
        ? calculateTripMetrics({
            truck: { id: '', description: '', gvwr: 0, opCostPerMile: 0, insuranceMo: 0, maxTongueWeightCapacity: 3_500, monthlyPayment: 0, maintFundMo: 0 },
            trailer: engineTrailer,
            cargo:   engineCargo,
            loadedMiles: 0, deadheadMiles: 0,
            pickupDate:   new Date().toISOString(),
            deliveryDate: new Date().toISOString(),
            projectedFuel: 0, projectedDef: 0,
            averageMonthlyMiles: 5_000,
            businessNetProfitTargetPerDay: 300,
            driverPayrollTargetPerDay:     250,
          })
        : null;

      // Capacity metrics
      const usedWeightLbs         = tripLoads.reduce((s, l) => s + (l.cargoWeightNum || 0) * (l.cargoQuantity || 1), 0);
      const usedDeckSpaceLinearFt = engineResult?.totalLinearFeetConsumed ?? 0;
      const maxWeightLbs          = trailer?.payloadCapacity ?? Math.max(0, (trailer?.gvwr ?? 0) - (trailer?.emptyWeight ?? 0));
      const maxDeckFt             = trailer?.trailerLength ?? engineTrailer.deckLength;
      const remainingDeckSpaceLinearFt = Math.max(0, maxDeckFt - usedDeckSpaceLinearFt);

      const capacityMetrics = { totalWeightLbs: usedWeightLbs, usedDeckSpaceLinearFt, remainingDeckSpaceLinearFt };

      // Route legs: LIFO pickup and dropoff sequence
      const routeLegs = buildMultiStopLegs(tripLoads);

      const truckId = trip.assignedTruckId ?? tripLoads[0]?.assignedTruckId;
      const truck   = truckId ? vehicles.find(v => v.id === truckId) : undefined;
      const driverId = trip.assignedDriverId ?? tripLoads[0]?.assignedDriverId;
      const driver = driverId ? driverProfiles.find(d => d.uid === driverId) : undefined;

      const complianceResult = computeCompliance(truck, trailer, driver, usedWeightLbs);

      // Gross revenue
      const grossRevenue = tripLoads.reduce((s, l) => s + (l.totalAgreedRate ?? 0), 0);

      return { ...trip, tripLoads, engineTrailer, capacityMetrics, routeLegs, maxWeightLbs, maxDeckFt, grossRevenue, complianceResult };
    });
  }, [trips, loads, vehicles, driverProfiles]);

  // ── Link a load to a trip (with capacity gate) ───────────────────────────────
  const handleLinkLoad = (loadId: string, tripId: string, maxW: number, usedW: number) => {
    const load = loads.find(l => l.id === loadId);
    if (!load) return;
    const addW = (load.cargoWeightNum ?? 0) * (load.cargoQuantity ?? 1);
    if (maxW > 0 && usedW + addW > maxW) {
      toast({
        variant: 'destructive',
        title: 'Capacity Gate',
        description: `Exceeds trailer weight by ${((usedW + addW) - maxW).toLocaleString()} lbs.`,
      });
      return;
    }
    updateLoad(loadId, { tripId });
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Truck className="h-5 w-5 text-sky-600" />
            Trip Manifest Builder
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Multi-stop manifest management — assign drivers, stack loads, and track deck capacity live.
          </p>
        </div>
        {!isCreating && (
          <button
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold transition-colors"
          >
            <PlusCircle className="h-4 w-4" /> New Trip
          </button>
        )}
      </div>

      {/* Create form */}
      {isCreating && (
        <div className="rounded-xl border border-sky-100 bg-sky-50/40 p-5 space-y-4">
          <p className="text-sm font-semibold text-sky-800">Create New Trip Manifest</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Trip Name</label>
              <input
                type="text"
                placeholder="e.g., WV Steel Loop — June"
                value={newTripName}
                onChange={e => setNewTripName(e.target.value)}
                className="w-full h-9 px-3 rounded-md border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Starting Odometer</label>
              <input
                type="number"
                placeholder="e.g., 150200"
                value={newOdometer}
                onChange={e => setNewOdometer(e.target.value)}
                className="w-full h-9 px-3 rounded-md border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setIsCreating(false)} className="px-4 py-2 rounded-lg border text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
            <button onClick={handleCreate} className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold">Create Manifest</button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {trips.length === 0 && !isCreating && (
        <div className="text-center py-16 border-2 border-dashed rounded-xl text-muted-foreground text-sm">
          No trip manifests yet — create one to start stacking loads.
        </div>
      )}

      {/* Trip cards */}
      <div className="space-y-6">
        {enrichedTrips.map(trip => {
          const weightPct = trip.maxWeightLbs > 0 ? Math.min(100, (trip.capacityMetrics.totalWeightLbs / trip.maxWeightLbs) * 100) : 0;
          const deckPct   = trip.maxDeckFt   > 0 ? Math.min(100, (trip.capacityMetrics.usedDeckSpaceLinearFt / trip.maxDeckFt) * 100) : 0;
          const assignedDriver = driverProfiles.find(d => d.uid === trip.assignedDriverId);

          return (
            <div key={trip.id} className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">

              {/* ── Card header ── */}
              <div className="bg-slate-800 px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  {/* Trip number */}
                  <div className="flex items-center gap-1.5">
                    <Hash className="h-4 w-4 text-slate-400" />
                    <span className="text-sm font-bold text-sky-400 font-mono tracking-wide">
                      {trip.tripNumber ?? trip.name}
                    </span>
                  </div>
                  {/* Status badge */}
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${STATUS_COLORS[trip.status]}`}>
                    {trip.status.toUpperCase()}
                  </span>
                </div>

                {/* Status controls + delete */}
                <div className="flex items-center gap-2">
                  {trip.status === 'planned' && (
                    <button onClick={() => updateTrip(trip.id, { status: 'active' })}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg bg-sky-600 hover:bg-sky-700 text-white transition-colors">
                      <Clock className="h-3 w-3" /> Start Run
                    </button>
                  )}
                  {trip.status === 'active' && (
                    <button onClick={() => updateTrip(trip.id, { status: 'completed' })}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg bg-green-600 hover:bg-green-700 text-white transition-colors">
                      <CheckCircle2 className="h-3 w-3" /> Complete
                    </button>
                  )}
                  <button onClick={() => handleDeleteTrip(trip.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-900/20 transition-colors">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="p-5 grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* ── Column 1: Driver + Capacity ── */}
                <div className="space-y-5">

                  {/* Driver assignment */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1">
                      <User className="h-3 w-3" /> Assigned Operator
                    </label>
                    <select
                      value={trip.assignedDriverId ?? ''}
                      onChange={e => updateTrip(trip.id, { assignedDriverId: e.target.value || undefined })}
                      className="w-full h-9 px-2.5 rounded-md border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-400"
                    >
                      <option value="">— Unassigned —</option>
                      {driverProfiles.map(d => {
                        const offDuty = isDriverOffDuty(d);
                        return (
                          <option key={d.uid} value={d.uid} disabled={offDuty}>
                            {d.name} ({d.cdlStatus ?? 'Non-CDL'}){offDuty ? ' — (Off Duty)' : ''}
                          </option>
                        );
                      })}
                    </select>
                    {assignedDriver && (
                      <p className="text-[11px] text-slate-500 pl-0.5">
                        Status: <span className="font-semibold">{assignedDriver.availabilityStatus ?? assignedDriver.status}</span>
                      </p>
                    )}
                  </div>

                  {/* Capacity meters */}
                  <div className="space-y-3 p-4 bg-slate-50 rounded-lg border border-slate-100">
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Deck Capacity</p>

                    {/* Weight */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500 font-medium">Weight</span>
                        <span className={`font-bold ${weightPct > 90 ? 'text-red-600' : 'text-slate-700'}`}>
                          {trip.capacityMetrics.totalWeightLbs.toLocaleString()} / {trip.maxWeightLbs > 0 ? trip.maxWeightLbs.toLocaleString() : '—'} lbs
                        </span>
                      </div>
                      {trip.maxWeightLbs > 0 && (
                        <div className="flex justify-between text-[11px] text-slate-500">
                          <span>Remaining Payload:</span>
                          <span className="font-semibold text-slate-700">{Math.max(0, trip.maxWeightLbs - trip.capacityMetrics.totalWeightLbs).toLocaleString()} lbs</span>
                        </div>
                      )}
                      <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${weightPct > 90 ? 'bg-red-500' : weightPct > 75 ? 'bg-orange-400' : 'bg-sky-500'}`}
                          style={{ width: `${weightPct}%` }}
                        />
                      </div>
                    </div>

                    {/* Deck space */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500 font-medium">Deck Space</span>
                        <span className={`font-bold ${deckPct > 90 ? 'text-red-600' : 'text-slate-700'}`}>
                          {trip.capacityMetrics.usedDeckSpaceLinearFt.toFixed(1)} / {trip.maxDeckFt > 0 ? trip.maxDeckFt : '—'} ft
                        </span>
                      </div>
                      {trip.maxDeckFt > 0 && (
                        <div className="flex justify-between text-[11px] text-slate-500">
                          <span>Remaining Deck Space:</span>
                          <span className="font-semibold text-slate-700">{Math.max(0, trip.maxDeckFt - trip.capacityMetrics.usedDeckSpaceLinearFt).toFixed(1)} ft</span>
                        </div>
                      )}
                      <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${deckPct > 90 ? 'bg-red-500' : deckPct > 75 ? 'bg-orange-400' : 'bg-emerald-500'}`}
                          style={{ width: `${deckPct}%` }}
                        />
                      </div>
                    </div>

                    {/* Remaining deck */}
                    <div className="pt-1 border-t border-slate-200 text-xs text-slate-500 flex justify-between">
                      <span>Remaining deck</span>
                      <span className="font-bold text-slate-700">{trip.capacityMetrics.remainingDeckSpaceLinearFt.toFixed(1)} ft available</span>
                    </div>

                    <div className="pt-2">
                      <ComplianceBadges result={trip.complianceResult} compact />
                    </div>
                  </div>

                  {/* Financial summary */}
                  {trip.tripLoads.length > 0 && (
                    <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-lg text-xs space-y-1">
                      <p className="font-bold text-emerald-800 uppercase tracking-wide text-[11px]">Trip Revenue</p>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Gross (agreed rates)</span>
                        <span className="font-bold text-emerald-700">${trip.grossRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Loads stacked</span>
                        <span className="font-bold">{trip.tripLoads.length}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* ── Column 2: Route leg timeline ── */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> Route Leg Sequence
                    </p>
                    {trip.tripLoads.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          // Rule: Never read stale precalculated data. Query freshest active loads directly from loads state on the fly.
                          const freshActiveLoads = loads.filter(
                            l => l.tripId === trip.id && l.status !== 'delivered' && (l.status as string) !== 'completed'
                          );
                          const loadsToMap = freshActiveLoads.length > 0 ? freshActiveLoads : trip.tripLoads;
                          const mapUrl = generateGoogleMapsUrl(loadsToMap);
                          if (mapUrl && mapUrl !== 'https://www.google.com/maps') {
                            window.open(mapUrl, '_blank');
                          }
                        }}
                        className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors"
                        title="Open consolidated route in Google Maps"
                      >
                        <span>View Route on Map</span>
                        <ExternalLink className="h-3 w-3" />
                      </button>
                    )}
                  </div>

                  {trip.routeLegs.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No loads linked yet — add one below.</p>
                  ) : (
                    <div className="relative space-y-0">
                      {trip.routeLegs.map((leg, i) => {
                        const loadRef = trip.tripLoads.find(l => l.id === leg.loadId);
                        return (
                          <div key={`${leg.loadId}-${leg.type}`} className="flex gap-3">
                            {/* Timeline spine */}
                            <div className="flex flex-col items-center">
                              <div className={`w-6 h-6 rounded-full flex items-center justify-center border-2 z-10 bg-white ${leg.type === 'pickup' ? 'border-sky-400' : 'border-emerald-400'}`}>
                                {LEG_ICON[leg.type]}
                              </div>
                              {i < trip.routeLegs.length - 1 && (
                                <div className="w-0.5 flex-1 bg-slate-200 my-0.5" style={{ minHeight: '20px' }}>
                                  <ArrowDown className="h-3 w-3 text-slate-300 -ml-1.5 mt-2" />
                                </div>
                              )}
                            </div>
                            {/* Leg detail */}
                            <div className="pb-3 flex-1 min-w-0">
                              <span className={`text-[10px] font-bold tracking-widest ${leg.type === 'pickup' ? 'text-sky-600' : 'text-emerald-600'}`}>
                                {LEG_LABEL[leg.type]}
                              </span>
                              <p className="text-sm font-semibold text-slate-800 leading-tight">{leg.location}</p>
                              {loadRef && (
                                <p className="text-[11px] text-slate-400">
                                  #{loadRef.loadNumber ?? (loadRef.id ?? '').slice(0, 8)} · {loadRef.cargoDescription ?? 'Cargo'}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* ── Column 3: Loads panel (linked + append) ── */}
                <div className="space-y-3">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1">
                    <Package className="h-3 w-3" /> Linked Loads ({trip.tripLoads.length})
                  </p>

                  {/* Linked load chips */}
                  <div className="space-y-2">
                    {trip.tripLoads.map(load => (
                      <div key={load.id} className="flex items-center justify-between px-3 py-2 bg-slate-50 border border-slate-100 rounded-lg text-xs group">
                        <div>
                          <span className="font-bold text-slate-700">#{load.loadNumber ?? (load.id ?? '').slice(0, 7)}</span>
                          <span className="ml-2 text-slate-500">{load.origin.city} → {load.destination.city}</span>
                          <span className="ml-2 text-slate-400">{((load.cargoWeightNum ?? 0) * (load.cargoQuantity ?? 1)).toLocaleString()} lbs</span>
                        </div>
                        <button
                          onClick={() => load.id && updateLoad(load.id, { tripId: undefined })}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-50 hover:text-red-500 text-slate-300"
                          title="Remove from trip"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Append load dropdown */}
                  <div className="pt-2 border-t border-slate-100 space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                      Append Load to Manifest
                    </label>
                    <select
                      defaultValue=""
                      onChange={e => {
                        if (e.target.value) {
                          handleLinkLoad(e.target.value, trip.id, trip.maxWeightLbs, trip.capacityMetrics.totalWeightLbs);
                          e.target.value = '';
                        }
                      }}
                      className="w-full h-9 px-2.5 rounded-md border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-400"
                    >
                      <option value="">Select load to append...</option>
                      {loads.filter(l => !l.tripId && l.status !== 'delivered').map(l => (
                        <option key={l.id ?? ''} value={l.id ?? ''}>
                          #{l.loadNumber ?? (l.id ?? '').slice(0,7)} · {l.origin.city} → {l.destination.city}
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-slate-400">
                      {trip.capacityMetrics.remainingDeckSpaceLinearFt.toFixed(1)} ft deck space remaining
                    </p>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
