'use client';

import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useApp } from '@/context/AppContext';
import { vehicleToEngineTruck, vehicleToEngineTrailer, loadToCargoItem } from '@/lib/logisticsAdapters';
import { calculateTripMetrics, computeCargoLinearFootprint } from '@/lib/logisticsEngine';
import {
  buildDriverProgressLegs,
  calculateLegProgress,
  calculateEstimatedDriverLocation,
  resolveCoordinates,
} from '@/lib/routeUtils';
import {
  Truck,
  Package,
  AlertTriangle,
  ShieldCheck,
  Navigation,
  Clock,
  MapPin,
  Gauge,
  Compass,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Phone,
  MessageSquare,
  DollarSign,
  Sparkles,
  ExternalLink,
  Layers,
  ArrowRight,
  Maximize2,
  FileCheck,
  Share2,
  Radar,
  Users,
  Activity,
  UserCheck,
  UserX,
  Lock,
} from 'lucide-react';
import { TransitMapModal } from './TransitMapModal';
import { ShareLoadPacketModal } from '@/components/loads/ShareLoadPacketModal';
import { SignedBolUpload } from '@/components/loads/SignedBolUpload';
import { DriverFleetMap, type DriverFleetMapItem, type DriverFleetStatus } from './DriverFleetMap';
import { LocationDisclaimerNotice } from '@/components/common/LocationDisclaimerNotice';
import { findCandidateNextLoads, type NextLoadCandidate } from '@/lib/dispatchSuggestions';
import { geocodePhysicalAddress } from '@/lib/geocoding';
import { useToast } from '@/hooks/use-toast';
import { type Load, isDriverOffDuty } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { cn } from '@/lib/utils';

// ─── Phase label + indicator colour ──────────────────────────────────────────
function phaseDisplay(status?: string, exceptionFlag?: string | null): { label: string; color: string } {
  if (exceptionFlag) return { label: `⚠ ${exceptionFlag}`, color: '#ef4444' };
  if (!status)       return { label: 'En Route', color: '#10b981' };
  const lower = status.toLowerCase();
  if (lower === 'arrived') {
    return { label: '📍 Arrived', color: '#0d9488' };
  }
  const emoji: Record<string, string> = {
    'pending':                 '🕒',
    'client-request-approved': '👍',
    'loading':                 '📦',
    'in-transit':              '🚛',
    'arrived':                 '📍',
    'waiting':                 '⏳',
    'on-break':                '💤',
    'idle':                    '☕',
    'unloading':               '🏁',
    'delivered':               '✅',
  };
  const title = status.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase());
  return { label: `${emoji[lower] ?? ''} ${title}`, color: '#10b981' };
}

export function LiveOperationsCommandCenter() {
  const { 
    loads, 
    vehicles, 
    driverProfiles, 
    settings, 
    clients, 
    trips, 
    updateLoad, 
    updateDriverProfile, 
    currentTime,
    setActiveTab,
    subscriptionTier,
  } = useApp();
  const { toast } = useToast();

  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [selectedMapLoadId, setSelectedMapLoadId] = useState<string | null>(null);
  const [isCargoOpen, setIsCargoOpen] = useState(false);
  const [isFinanceOpen, setIsFinanceOpen] = useState(false);
  const [showFullFleetTable, setShowFullFleetTable] = useState(false);
  const [assigningLoadId, setAssigningLoadId] = useState<string | null>(null);
  const [sharePacketLoad, setSharePacketLoad] = useState<Load | null>(null);

  // ── Gated Feature Gate for Starter Plan ─────────────────────────────────────
  if (subscriptionTier === 'starter') {
    return (
      <div className="max-w-4xl mx-auto py-8 px-2 sm:px-4 space-y-6">
        <Card className="border border-slate-200/90 shadow-md bg-white rounded-2xl overflow-hidden">
          {/* Header Banner */}
          <div className="p-6 sm:p-8 bg-gradient-to-r from-slate-900 via-slate-800 to-blue-950 text-white">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-12 w-12 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-400/30 flex items-center justify-center">
                <Radar className="h-6 w-6 text-blue-400 animate-pulse" />
              </div>
              <Badge className="bg-amber-500/20 text-amber-300 border border-amber-400/30 text-xs font-bold px-2.5 py-1">
                Fleet Pro Feature
              </Badge>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold font-headline tracking-tight">
              Driver Command Center
            </h2>
            <p className="text-slate-300 text-sm mt-1.5 max-w-2xl leading-relaxed">
              Real-time driver telemetry, route corridor tracking, FMCSA HOS compliance clocks, and automated next-load dispatch suggestions designed for multi-truck fleets.
            </p>
          </div>

          <CardContent className="p-6 sm:p-8 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/60 space-y-1.5">
                <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                  <Radar className="h-4 w-4 text-blue-600" />
                  Estimated Fleet Position &amp; Progression
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Monitor active units and driver transit phases (En Route, At Pickup, Loaded, Delivered) estimated from vehicle speed and mileage.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/60 space-y-1.5">
                <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                  <Clock className="h-4 w-4 text-blue-600" />
                  HOS &amp; Remaining Drive Hours
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Live countdown clocks for 11-hour drive limits and 14-hour on-duty windows to prevent federal compliance violations.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/60 space-y-1.5">
                <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                  <Sparkles className="h-4 w-4 text-amber-500" />
                  Smart Dispatch Suggestions
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Automated pairing of arriving drivers with candidate next loads matching their delivery coordinates and trailer specs.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/60 space-y-1.5">
                <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  Instant Exception Reporting
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Real-time alerts for roadside delays, weather interruptions, maintenance flags, and shipper detention.
                </p>
              </div>
            </div>

            <div className="pt-5 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-xs text-slate-500 block">Current Plan: <strong className="text-slate-800">Starter ($49/mo)</strong></span>
                <span className="text-xs text-slate-700">Upgrade to <strong>Fleet Pro ($99/mo)</strong> to unlock Live Command Center, up to 3 trucks, and unlimited drivers.</span>
              </div>
              <Button
                size="lg"
                onClick={() => setActiveTab('billing')}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md gap-2 shrink-0"
              >
                <Sparkles className="h-4 w-4 text-amber-300" />
                Upgrade to Fleet Pro ($99/mo)
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Active (in-transit/active container) loads ──────────────────────────────
  const activeLoads = useMemo(() => {
    const activeTripIds = new Set(trips.filter(t => t.status === 'active').map(t => t.id));
    return loads.filter(l => 
      l.status === 'in-transit' || 
      l.status === 'arrived' || 
      (l as any).status === 'Arrived' || 
      l.status === 'loading' || 
      l.status === 'unloading' || 
      (l.tripId && activeTripIds.has(l.tripId) && l.status !== 'delivered')
    );
  }, [loads, trips]);

  // Auto-sync exact physical coordinates for active loads in database
  const geocodedLoadIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    activeLoads.forEach(async (load) => {
      if (!load.id || geocodedLoadIdsRef.current.has(load.id)) return;
      const needsOriginGeocode = typeof load.origin?.lat !== 'number' || typeof load.origin?.lng !== 'number';
      const needsDestGeocode = typeof load.destination?.lat !== 'number' || typeof load.destination?.lng !== 'number';

      if (needsOriginGeocode || needsDestGeocode) {
        geocodedLoadIdsRef.current.add(load.id);
        const updates: Partial<Load> = {};
        if (needsOriginGeocode && load.origin?.city) {
          const coords = await geocodePhysicalAddress(load.origin);
          if (coords) {
            updates.origin = { ...load.origin, lat: coords.lat, lng: coords.lng };
            updates.originLat = coords.lat;
            updates.originLng = coords.lng;
          }
        }
        if (needsDestGeocode && load.destination?.city) {
          const coords = await geocodePhysicalAddress(load.destination);
          if (coords) {
            updates.destination = { ...load.destination, lat: coords.lat, lng: coords.lng };
            updates.destinationLat = coords.lat;
            updates.destinationLng = coords.lng;
          }
        }
        if (Object.keys(updates).length > 0) {
          updateLoad(load.id, updates);
        }
      }
    });
  }, [activeLoads, updateLoad]);

  const defaultMonthlyMiles = useMemo(() => {
    const fromSpeed = settings.truckAverageSpeed > 0 ? settings.truckAverageSpeed * 24 * 20 : 0;
    return fromSpeed || 5_000;
  }, [settings]);

  // ── Enrich each active load with telemetry and route info ──────────────────
  const enrichedLoads = useMemo(() => {
    const activeTruckCount = Math.max(1, vehicles.filter(v => v.type === 'truck').length);
    const globalMonthlyOverhead = settings.recurringExpenses.reduce((s, e) => s + (e.amount || 0), 0);
    const perTruckGlobalMonthly = globalMonthlyOverhead / activeTruckCount;

    return activeLoads.map(load => {
      const matchedTrip = (load.tripId && load.tripId !== 'none') ? trips.find(t => t.id === load.tripId) : undefined;
      const truck   = (vehicles.find(v => v.id === load.assignedTruckId   && v.type === 'truck'))
        || (matchedTrip?.assignedTruckId ? vehicles.find(v => v.id === matchedTrip.assignedTruckId && v.type === 'truck') : undefined);
      const trailer = (vehicles.find(v => v.id === load.assignedTrailerId && v.type === 'trailer'))
        || (matchedTrip?.assignedTrailerId ? vehicles.find(v => v.id === matchedTrip.assignedTrailerId && v.type === 'trailer') : undefined);
      const driver  = (driverProfiles.find(d => d.uid === load.assignedDriverId))
        || (matchedTrip?.assignedDriverId ? driverProfiles.find(d => d.uid === matchedTrip.assignedDriverId) : undefined)
        || (truck?.assignedDriverId ? driverProfiles.find(d => d.uid === truck.assignedDriverId) : undefined);
      const client  = clients.find(c => c.id === load.clientId);

      const totalTripMiles = (load.distance || 0) + (load.deadheadMiles || 0);

      const isTripConsolidated = Boolean(load.tripId && load.tripId !== 'none');
      const deckLength = trailer?.trailerLength ?? 40;
      const maxPayload = trailer?.payloadCapacity
        || Math.max(0, (trailer?.gvwr ?? 0) - (trailer?.emptyWeight ?? 0))
        || 15_000;

      const CARGO_SAFETY_BUFFER = (settings as any)?.CARGO_SAFETY_BUFFER ?? (settings as any)?.cargoSafetyBuffer ?? 0.33;
      const cargoItem = loadToCargoItem(load);
      const incomingLinearFt = computeCargoLinearFootprint(
        cargoItem,
        trailer?.trailerWidth ?? 8.5,
        CARGO_SAFETY_BUFFER
      ).linearFeet;
      const incomingWeight = (cargoItem.weight || 0) * (cargoItem.quantity || 1);

      const spaceShare = deckLength > 0 && incomingLinearFt > 0 ? Math.min(1.0, incomingLinearFt / deckLength) : 0;
      const weightShare = maxPayload > 0 && incomingWeight > 0 ? Math.min(1.0, incomingWeight / maxPayload) : 0;
      const maxShare = Math.max(spaceShare, weightShare);

      let costShare = 1.0;
      if (isTripConsolidated) {
        if (maxShare > 0) {
          costShare = Math.max(0.01, Math.min(1.0, maxShare));
        } else if (matchedTrip) {
          const existingTripLoads = (loads ?? []).filter(l => l.tripId === matchedTrip.id && l.status !== 'delivered');
          const count = Math.max(2, existingTripLoads.length);
          costShare = 1 / count;
        } else {
          costShare = 0.25;
        }
      }

      const mpg       = truck?.mpg ?? settings.truckMpg;
      const fuelPrice = settings.defaultFuelCostPerGallon;
      const projFuel  = mpg > 0 && totalTripMiles > 0 ? (totalTripMiles / mpg) * fuelPrice : 0;
      const projDef   = mpg > 0 && totalTripMiles > 0 ? (totalTripMiles / mpg) * 0.025 * (settings.defCostPerGallon ?? 4.5) : 0;

      const engineTruck = truck
        ? vehicleToEngineTruck(truck, truck.estimatedMonthlyMiles ?? defaultMonthlyMiles)
        : { id: '', description: 'Unassigned', gvwr: 0, maxTongueWeightCapacity: 3_500, opCostPerMile: settings.defaultOperatingCostPerMile ?? 0.20, insuranceMo: 0, monthlyPayment: 0, maintFundMo: 0 };

      const engineTrailer = trailer
        ? vehicleToEngineTrailer(trailer)
        : { id: '', description: 'Unassigned', gvwr: 0, emptyWeight: 0, monthlyPayment: 0, maintFundMo: 0, insuranceMo: 0, deckLength: 40, deckWidth: 8.5 };

      const engineResults = calculateTripMetrics({
        truck:   engineTruck,
        trailer: engineTrailer,
        cargo:   [cargoItem],
        loadedMiles:   load.distance ?? 0,
        deadheadMiles: load.deadheadMiles ?? 0,
        pickupDate:    load.pickupDateTime ?? new Date().toISOString(),
        deliveryDate:  load.deliveryDateTime ?? new Date().toISOString(),
        projectedFuel: projFuel,
        projectedDef:  projDef,
        averageMonthlyMiles: truck?.estimatedMonthlyMiles ?? defaultMonthlyMiles,
        businessNetProfitTargetPerDay: settings.targetDailyBusinessProfit ?? 300,
        driverPayrollTargetPerDay:     settings.defaultDriverHourlyRate ? settings.defaultDriverHourlyRate * 8 : 250,
        userEnteredRatePerMile: (load.ratePerMile ?? 0) > 0 ? load.ratePerMile : undefined,
        costShareRatio: costShare,
      });

      let driverPay = 0;
      if (driver) {
        if (driver.payType === 'per-mile') {
          driverPay = totalTripMiles * (driver.payRate || 0) * costShare;
        } else if (driver.payType === 'hourly') {
          const estHours = driver.estimatedTripHours
            || (totalTripMiles > 0 ? totalTripMiles / (settings.truckAverageSpeed || 55) : 0);
          driverPay = estHours * (driver.payRate || settings.defaultDriverHourlyRate || 25) * costShare;
        } else {
          const rate = driver.payPercentageOfGross ?? driver.payrollPercentage ?? settings.payrollPercentage;
          driverPay = load.totalAgreedRate * ((rate ?? 25) / 100);
        }
      } else {
        driverPay = load.totalAgreedRate * (settings.payrollPercentage / 100);
      }

      const OVERHEAD_MONTHLY_MILES = Math.max(8_500, truck?.estimatedMonthlyMiles ?? 0);
      const truckMonthly   = (truck?.monthlyRecurringExpenses?.insurance ?? 0) + (truck?.monthlyRecurringExpenses?.payment ?? 0);
      const trailerMonthly = (trailer?.monthlyRecurringExpenses?.insurance ?? 0) + (trailer?.monthlyRecurringExpenses?.payment ?? 0);
      const totalMonthlyFixed = truckMonthly + trailerMonthly + perTruckGlobalMonthly;
      const overheadPerMile   = totalMonthlyFixed / OVERHEAD_MONTHLY_MILES;
      const overheadAlloc     = overheadPerMile * totalTripMiles * costShare;

      const opCostPerMile   = settings.defaultOperatingCostPerMile ?? 0.20;
      const maintenanceCost = totalTripMiles * opCostPerMile * costShare;
      const effectiveFuel   = projFuel * costShare;
      const effectiveDef    = projDef * costShare;

      const totalExpenses = effectiveFuel + effectiveDef + maintenanceCost + overheadAlloc + driverPay;
      const netProfit     = load.totalAgreedRate - totalExpenses;
      const cdlBreach     = engineResults.isCdlRequired && (driver?.cdlStatus ?? 'Non-CDL') === 'Non-CDL';

      const nowMs = currentTime || Date.now();
      const parseDepartureMs = (l: Load): number => {
        if (l.manualOverrideAt) {
          const overrideParsed = new Date(l.manualOverrideAt).getTime();
          if (!isNaN(overrideParsed)) return overrideParsed;
        }
        const raw = l.pickupDateTime || (l as any).departureDateTime || (l as any).requestedPickupDateTime || (l as any).pickupDate;
        if (!raw) return 0;
        if (typeof raw === 'number' && !isNaN(raw)) return raw;
        if (typeof raw === 'string') {
          const trimmed = raw.trim();
          if (/^\d{10,13}$/.test(trimmed)) {
            const n = Number(trimmed);
            return trimmed.length === 10 ? n * 1000 : n;
          }
          const normalized = trimmed.includes(' ') && !trimmed.includes('T') && /^\d{4}-\d{2}-\d{2}\s/.test(trimmed)
            ? trimmed.replace(' ', 'T')
            : trimmed;
          const parsed = new Date(normalized).getTime();
          if (!isNaN(parsed)) return parsed;
        }
        return 0;
      };

      const pickupMs = parseDepartureMs(load);
      const avgSpeed = settings.truckAverageSpeed > 0 ? settings.truckAverageSpeed : 55;
      const loadedDistance = load.distance || 0;

      const driveHours = (load.estimatedDriveTimeHours && load.estimatedDriveTimeHours > 0)
        ? load.estimatedDriveTimeHours
        : (loadedDistance > 0 ? loadedDistance / avgSpeed : 4);

      const durationMs = Math.max(1800000, Math.round(driveHours * 3600 * 1000));

      let transitFraction = 0;
      let isFutureScheduled = false;
      let elapsedMs = 0;

      if (load.status === 'delivered') {
        transitFraction = 1.0;
        elapsedMs = durationMs;
      } else if (load.status === 'arrived' || (load as any).status === 'Arrived' || load.driverPhase === 'Arrived') {
        transitFraction = 0.95;
        elapsedMs = durationMs;
      } else if (load.status === 'unloading') {
        transitFraction = 0.95;
        elapsedMs = Math.round(durationMs * 0.95);
      } else if (load.status === 'loading') {
        transitFraction = 0.05;
        elapsedMs = Math.round(durationMs * 0.05);
      } else if (pickupMs > 0 && !isNaN(pickupMs)) {
        if (nowMs >= pickupMs) {
          elapsedMs = nowMs - pickupMs;
          transitFraction = Math.min(0.98, Math.max(0.05, elapsedMs / durationMs));
        } else {
          isFutureScheduled = true;
          elapsedMs = 0;
          transitFraction = 0.02;
        }
      } else {
        transitFraction = 0.40;
        elapsedMs = Math.round(durationMs * transitFraction);
      }

      let progressPct: number;
      if (load.status === 'delivered') {
        progressPct = 100;
      } else if (load.status === 'arrived' || (load as any).status === 'Arrived' || load.driverPhase === 'Arrived') {
        progressPct = 95;
      } else if (load.status === 'unloading') {
        progressPct = 95;
      } else if (load.status === 'loading') {
        progressPct = 15;
      } else if (isFutureScheduled) {
        progressPct = 10;
      } else {
        progressPct = Math.min(95, Math.max(15, Math.round(15 + transitFraction * 80)));
      }

      const estMilesCovered = Math.round(loadedDistance * transitFraction);
      const estMilesRemaining = Math.max(0, loadedDistance - estMilesCovered);

      let etaFormatted = '—';
      let estArrivalTimestamp = nowMs + durationMs;
      try {
        if (load.status === 'delivered') {
          etaFormatted = 'Delivered';
        } else if (load.status === 'arrived' || (load as any).status === 'Arrived' || load.driverPhase === 'Arrived') {
          etaFormatted = 'Arrived (At Facility)';
        } else if (load.status === 'unloading') {
          etaFormatted = 'Arrived (Unloading)';
        } else if (isFutureScheduled && pickupMs > 0) {
          const scheduledEta = pickupMs + durationMs;
          estArrivalTimestamp = scheduledEta;
          etaFormatted = new Date(scheduledEta).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        } else {
          const remainingDriveHours = estMilesRemaining / avgSpeed;
          const remainingMs = Math.max(60000, Math.round(remainingDriveHours * 3600 * 1000));
          estArrivalTimestamp = nowMs + remainingMs;
          etaFormatted = new Date(estArrivalTimestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        }
      } catch {
        etaFormatted = '—';
      }

      const elapsedHours = Math.floor(elapsedMs / (3600 * 1000));
      const elapsedMins = Math.floor((elapsedMs % (3600 * 1000)) / (60 * 1000));
      const elapsedFormatted = elapsedHours > 0 ? `${elapsedHours}h ${elapsedMins}m` : `${elapsedMins}m`;

      const origCityState = load.origin?.city ? `${load.origin.city}, ${load.origin.state || ''}` : 'Origin';
      const destCityState = load.destination?.city ? `${load.destination.city}, ${load.destination.state || ''}` : 'Destination';

      const progressLegs = buildDriverProgressLegs(load, loads, driver);
      const legProgress = calculateLegProgress(load, loads, loadedDistance, transitFraction, avgSpeed, currentTime, driver);
      const phase = phaseDisplay(load.status, load.driverExceptionFlag);

      let liveLocationStatus = '';
      if (load.status === 'arrived' || (load as any).status === 'Arrived' || load.driverPhase === 'Arrived') {
        const arrivalTimeStr = load.arrivedAt ? ` at ${new Date(load.arrivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '';
        liveLocationStatus = `Arrived at Facility (${destCityState})${arrivalTimeStr}`;
      } else if (legProgress.isDeadhead) {
        liveLocationStatus = `En Route to Pickup at ${origCityState} (~${legProgress.legRemainingMiles} mi)`;
      } else if (load.status === 'loading') {
        liveLocationStatus = `Loading at ${origCityState}`;
      } else if (load.status === 'unloading') {
        liveLocationStatus = `Arrived at ${destCityState} — Unloading`;
      } else if (load.status === 'delivered') {
        liveLocationStatus = `Completed delivery at ${destCityState}`;
      } else if (isFutureScheduled) {
        liveLocationStatus = `Scheduled departure from ${origCityState}`;
      } else {
        liveLocationStatus = `En Route: ${origCityState} ➔ ${destCityState} (~${estMilesRemaining} mi left)`;
      }

      return {
        load, truck, trailer, driver, client,
        engineResults, driverPay, projFuel, projDef,
        maintenanceCost, overheadAlloc, totalExpenses, netProfit,
        cdlBreach, progressPct, phase, totalTripMiles, loadedDistance,
        opCostPerMile, avgSpeed,
        transitFraction, estMilesCovered, estMilesRemaining,
        etaFormatted, elapsedFormatted,
        estArrivalTimestamp,
        liveLocationStatus, progressLegs, legProgress,
      };
    });
  }, [activeLoads, vehicles, driverProfiles, clients, settings, defaultMonthlyMiles, currentTime, trips, loads]);

  // ── Build Driver Fleet Items for Embedded Map & Cards ─────────────────────
  const driverFleetItems: DriverFleetMapItem[] = useMemo(() => {
    const activeProfiles = driverProfiles.filter(d => d.status === 'active' || !d.status);

    return activeProfiles.map(driver => {
      const enriched = enrichedLoads.find(e => 
        (driver.uid && (e.driver?.uid === driver.uid || e.load.assignedDriverId === driver.uid)) ||
        (driver.id && (e.driver?.id === driver.id || e.load.assignedDriverId === driver.id))
      );
      const assignedTruck = vehicles.find(v => v.id === driver.assignedTruckId && v.type === 'truck')
        || (enriched?.truck);

      if (enriched) {
        const { load, legProgress, etaFormatted, estMilesRemaining, liveLocationStatus } = enriched;
        const origCoords = legProgress.fromCoordinates || (
          typeof load.origin?.lat === 'number' && typeof load.origin?.lng === 'number'
            ? { lat: load.origin.lat, lng: load.origin.lng }
            : typeof load.originLat === 'number' && typeof load.originLng === 'number'
              ? { lat: load.originLat, lng: load.originLng }
              : null
        );
        const destCoords = legProgress.toCoordinates || (
          typeof load.destination?.lat === 'number' && typeof load.destination?.lng === 'number'
            ? { lat: load.destination.lat, lng: load.destination.lng }
            : typeof load.destinationLat === 'number' && typeof load.destinationLng === 'number'
              ? { lat: load.destinationLat, lng: load.destinationLng }
              : null
        );

        const estLoc = calculateEstimatedDriverLocation(
          legProgress.fromLocation,
          legProgress.toLocation,
          legProgress.legFraction,
          driver.currentLat,
          driver.currentLng,
          origCoords,
          destCoords
        );

        let status: DriverFleetStatus = 'In Transit';
        let statusLabel = 'In Transit';

        if (isDriverOffDuty(driver)) {
          status = 'Off Duty';
          statusLabel = 'Off Duty';
        } else if (load.driverExceptionFlag) {
          status = 'Late';
          statusLabel = `Exception: ${load.driverExceptionFlag}`;
        } else if ((legProgress.isDeadhead || load.status === 'dispatched') && !load.manualOverrideAt && load.status !== 'in-transit' && load.status !== 'loading' && load.status !== 'arrived-origin') {
          status = 'Deadheading';
          statusLabel = 'Deadheading';
        } else if (load.status === 'arrived' || (load as any).status === 'Arrived' || load.status === 'arrived-origin' || load.status === 'arrived-destination' || load.driverPhase === 'Arrived') {
          status = 'Arrived';
          statusLabel = 'Arrived at Facility';
        } else if (load.status === 'unloading' || load.driverPhase === 'Getting Unloaded') {
          status = 'Unloading';
          statusLabel = 'Unloading';
        } else if (load.status === 'loading' || load.driverPhase === 'Getting Loaded') {
          status = 'In Transit';
          statusLabel = 'Loading';
        } else if (load.status === 'in-transit') {
          status = 'In Transit';
          statusLabel = 'In Transit (Loaded)';
        }

        return {
          driver,
          truck: assignedTruck,
          activeLoad: load,
          status,
          statusLabel,
          coordinates: estLoc.coordinates,
          locationName: legProgress.nextStopName || liveLocationStatus,
          etaFormatted,
          remainingMiles: estMilesRemaining,
          originCoords: estLoc.originCoordinates,
          destCoords: estLoc.destCoordinates,
          originName: load.origin?.city ? `${load.origin.city}, ${load.origin.state || ''}` : 'Pickup',
          destName: load.destination?.city ? `${load.destination.city}, ${load.destination.state || ''}` : 'Delivery',
          isDeadhead: legProgress.isDeadhead,
        };
      }

      // Driver without active load
      const offDuty = isDriverOffDuty(driver);
      let availableCoords = { lat: 39.8283, lng: -98.5795 };
      const explicitStaging = driver.currentStaging?.trim() || (driver.lastLocationCity ? `${driver.lastLocationCity}, ${driver.lastLocationState || ''}`.trim() : '');
      let locationName = explicitStaging || (offDuty ? 'Off Duty (Staged)' : 'Terminal Yard');

      if (typeof driver.currentLat === 'number' && typeof driver.currentLng === 'number' && (driver.currentLat !== 39.8283 || driver.currentLng !== -98.5795)) {
        availableCoords = { lat: driver.currentLat, lng: driver.currentLng };
      } else if (explicitStaging) {
        availableCoords = resolveCoordinates(explicitStaging);
      } else if (settings.carrierAddress?.city) {
        locationName = `${settings.carrierAddress.city}, ${settings.carrierAddress.state || ''} ${offDuty ? '(Off Duty)' : '(Yard)'}`;
        availableCoords = resolveCoordinates(settings.carrierAddress.city, settings.carrierAddress.state);
      }

      return {
        driver,
        truck: assignedTruck,
        activeLoad: undefined,
        status: (offDuty ? 'Off Duty' : 'Available') as DriverFleetStatus,
        statusLabel: offDuty ? 'Off Duty' : 'Available for Dispatch',
        coordinates: availableCoords,
        locationName,
        etaFormatted: undefined,
        remainingMiles: undefined,
      };
    });
  }, [driverProfiles, enrichedLoads, vehicles, settings]);

  // Set default selected driver if none selected
  useEffect(() => {
    if (!selectedDriverId && driverFleetItems.length > 0) {
      const activeItem = driverFleetItems.find(d => d.status === 'In Transit' || d.status === 'Unloading') || driverFleetItems[0];
      setSelectedDriverId(activeItem.driver.id || activeItem.driver.uid);
    }
  }, [driverFleetItems, selectedDriverId]);

  // Current selected driver item
  const selectedFleetItem = useMemo(() => {
    return driverFleetItems.find(d => 
      (selectedDriverId && (d.driver.uid === selectedDriverId || d.driver.id === selectedDriverId))
    ) || driverFleetItems[0] || null;
  }, [driverFleetItems, selectedDriverId]);

  // Enriched active load of the selected driver
  const selectedEnrichedLoad = useMemo(() => {
    if (!selectedFleetItem?.driver) return null;
    const dUid = selectedFleetItem.driver.uid;
    const dId = selectedFleetItem.driver.id;
    return enrichedLoads.find(e => 
      (dUid && (e.driver?.uid === dUid || e.load.assignedDriverId === dUid)) ||
      (dId && (e.driver?.id === dId || e.load.assignedDriverId === dId))
    ) || null;
  }, [selectedFleetItem, enrichedLoads]);

  // Selected map data for popout modal
  const selectedMapData = useMemo(() => {
    if (!selectedMapLoadId) return null;
    return enrichedLoads.find(e => e.load.id === selectedMapLoadId) || null;
  }, [selectedMapLoadId, enrichedLoads]);

  // Smart next load candidates
  const candidateNextLoads = useMemo(() => {
    if (!selectedFleetItem?.driver) return [];

    const driverTrailer = vehicles.find(v => v.id === selectedFleetItem.driver.assignedTrailerId && v.type === 'trailer')
      || (selectedEnrichedLoad?.trailer);

    return findCandidateNextLoads({
      driver: selectedFleetItem.driver,
      activeLoad: selectedFleetItem.activeLoad,
      allLoads: loads,
      truck: selectedFleetItem.truck,
      trailer: driverTrailer,
      settings,
      currentTimeMs: currentTime || Date.now(),
      driverEstArrivalMs: selectedEnrichedLoad?.estArrivalTimestamp,
      maxResults: 2,
    });
  }, [selectedFleetItem, selectedEnrichedLoad, loads, vehicles, settings, currentTime]);

  const handleAssignCandidateLoad = async (candidate: NextLoadCandidate) => {
    if (!selectedFleetItem?.driver || !candidate.load.id) return;
    const targetDriver = selectedFleetItem.driver;

    if (isDriverOffDuty(targetDriver) || selectedFleetItem.status === 'Off Duty') {
      toast({
        title: 'Assignment Blocked',
        description: `${targetDriver.name} is currently Off Duty. Cannot dispatch freight to an off-duty driver.`,
        variant: 'destructive',
      });
      return;
    }

    setAssigningLoadId(candidate.load.id);
    try {
      const updates: Partial<Load> = {
        assignedDriverId: targetDriver.uid,
        deadheadMiles: candidate.deadheadMiles,
        status: 'loading',
        driverPhase: 'Getting Loaded',
      };

      if (selectedFleetItem.truck?.id) {
        updates.assignedTruckId = selectedFleetItem.truck.id;
      }
      if (targetDriver.assignedTrailerId) {
        updates.assignedTrailerId = targetDriver.assignedTrailerId;
      }

      await updateLoad(candidate.load.id, updates);

      toast({
        title: 'Load Dispatched to Driver',
        description: `Load #${candidate.load.loadNumber ?? candidate.load.id.slice(0, 6)} assigned to ${targetDriver.name}.`,
      });
    } catch (err: any) {
      toast({
        title: 'Assignment Failed',
        description: err?.message || 'Failed to dispatch load.',
        variant: 'destructive',
      });
    } finally {
      setAssigningLoadId(null);
    }
  };

  // Status counters
  const inTransitCount = driverFleetItems.filter(d => d.status === 'In Transit' || d.status === 'Unloading' || d.status === 'Deadheading' || d.status === 'Arrived').length;
  const availableCount = driverFleetItems.filter(d => d.status === 'Available').length;
  const offDutyCount = driverFleetItems.filter(d => d.status === 'Off Duty').length;
  const lowHosCount = driverFleetItems.filter(d => (d.driver.estimatedHosRemaining ?? 11) < 3 && d.status !== 'Off Duty').length;

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20">
      {/* ── Page Header & Purpose Clarification ──────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold font-headline text-slate-900 tracking-tight flex items-center gap-2.5">
            <Radar className="h-7 w-7 text-blue-600" />
            Driver Command Center
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Driver availability, Hours of Service (HOS) limits, route progression, and estimated waypoint tracking.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200 text-xs px-2.5 py-1 font-semibold flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            Position Estimate (not live GPS)
          </Badge>
        </div>
      </div>

      {/* ── Operational Summary Bar ──────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Drivers */}
        <div className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Total Drivers</span>
            <span className="text-xl font-extrabold text-slate-900 mt-0.5 block">{driverFleetItems.length}</span>
          </div>
          <div className="h-9 w-9 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center font-bold">
            <Users className="h-4 w-4" />
          </div>
        </div>

        {/* In Transit */}
        <div className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">On Trip / Transit</span>
            <span className="text-xl font-extrabold text-emerald-700 mt-0.5 block">{inTransitCount}</span>
          </div>
          <div className="h-9 w-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <Truck className="h-4 w-4" />
          </div>
        </div>

        {/* Available for Dispatch */}
        <div className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Available Staged</span>
            <span className="text-xl font-extrabold text-blue-700 mt-0.5 block">{availableCount}</span>
          </div>
          <div className="h-9 w-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <UserCheck className="h-4 w-4" />
          </div>
        </div>

        {/* Low HOS / Off Duty */}
        <div className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
              {lowHosCount > 0 ? 'Low HOS Alert' : 'Off Duty'}
            </span>
            <span className={cn(
              "text-xl font-extrabold mt-0.5 block",
              lowHosCount > 0 ? "text-amber-600" : "text-slate-600"
            )}>
              {lowHosCount > 0 ? `${lowHosCount} Drivers` : `${offDutyCount} Drivers`}
            </span>
          </div>
          <div className={cn(
            "h-9 w-9 rounded-lg flex items-center justify-center font-bold",
            lowHosCount > 0 ? "bg-amber-50 text-amber-600" : "bg-slate-100 text-slate-500"
          )}>
            {lowHosCount > 0 ? <AlertTriangle className="h-4 w-4" /> : <UserX className="h-4 w-4" />}
          </div>
        </div>
      </div>

      {/* ── Driver Cards Ribbon (Flight Board) ───────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-500 font-semibold uppercase tracking-wider">
          <span className="flex items-center gap-1.5 text-slate-700">
            <Compass className="h-4 w-4 text-blue-600" />
            Active Fleet Roster &bull; Click to Select Driver
          </span>
          <span className="text-[11px] text-slate-400 font-normal">
            {driverFleetItems.length} Driver Profiles Monitored
          </span>
        </div>

        {driverFleetItems.length === 0 ? (
          <div className="p-8 text-center bg-white border border-slate-200 rounded-xl shadow-xs">
            <Users className="h-10 w-10 text-slate-400 mx-auto mb-2" />
            <h3 className="text-base font-bold text-slate-800">No Drivers Found</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Add driver profiles in Drivers &amp; Fleet to monitor route progression, HOS driving windows, and waypoint tracking.
            </p>
            <Button
              onClick={() => setActiveTab('drivers')}
              className="mt-4 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold h-8 shadow-xs"
            >
              Go to Drivers &amp; Fleet
            </Button>
          </div>
        ) : (
          <div className="flex items-stretch gap-3 overflow-x-auto pb-2 no-scrollbar">
            {driverFleetItems.map((item) => {
              const driverKey = item.driver.id || item.driver.uid;
              const isSelected = Boolean(
                selectedDriverId && (item.driver.uid === selectedDriverId || item.driver.id === selectedDriverId)
              );
              const isTransit = item.status === 'In Transit';
              const isDeadheading = item.status === 'Deadheading';
              const isArrived = item.status === 'Arrived';
              const isUnloading = item.status === 'Unloading';
              const isOffDuty = item.status === 'Off Duty';
              const hosRemaining = item.driver.estimatedHosRemaining ?? 11.0;
              const isLowHos = hosRemaining < 3 && !isOffDuty;

              let statusColor = 'bg-blue-50 text-blue-700 border-blue-200';
              if (isTransit) statusColor = 'bg-emerald-50 text-emerald-800 border-emerald-300';
              if (isDeadheading) statusColor = 'bg-indigo-50 text-indigo-800 border-indigo-300';
              if (isArrived) statusColor = 'bg-teal-50 text-teal-800 border-teal-300';
              if (isUnloading) statusColor = 'bg-amber-50 text-amber-800 border-amber-300';
              if (isOffDuty) statusColor = 'bg-slate-100 text-slate-500 border-slate-200';

              return (
                <button
                  key={driverKey}
                  type="button"
                  onClick={() => setSelectedDriverId(driverKey)}
                  className={cn(
                    "min-w-[240px] max-w-[270px] text-left p-3.5 rounded-xl border transition-all flex flex-col justify-between shrink-0 shadow-2xs",
                    isSelected
                      ? "bg-blue-50/40 border-blue-600 ring-2 ring-blue-100 shadow-xs"
                      : "bg-white border-slate-200 hover:border-slate-300 hover:shadow-xs"
                  )}
                >
                  {/* Top: Driver & Status */}
                  <div className="w-full mb-2">
                    <div className="flex items-center justify-between gap-1.5 mb-1">
                      <strong className="text-sm font-bold text-slate-900 truncate">
                        {item.driver.name}
                      </strong>
                      <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-md border", statusColor)}>
                        {item.status}
                      </span>
                    </div>

                    <div className="text-xs text-slate-600 truncate flex items-center gap-1">
                      <MapPin className="h-3 w-3 text-slate-400 shrink-0" />
                      <span className="truncate">{item.locationName}</span>
                    </div>
                  </div>

                  {/* Bottom: HOS & Route / ETA */}
                  <div className="border-t border-slate-100 pt-2 flex items-center justify-between text-[11px]">
                    {/* HOS Badge */}
                    <span className={cn(
                      "font-semibold flex items-center gap-1 px-1.5 py-0.5 rounded",
                      isLowHos ? "bg-amber-100 text-amber-800" : isOffDuty ? "bg-slate-100 text-slate-500" : "bg-emerald-50 text-emerald-700"
                    )}>
                      <Clock className="h-3 w-3" />
                      {hosRemaining.toFixed(1)}h HOS
                    </span>

                    {/* ETA or Staged info */}
                    {isOffDuty ? (
                      <span className="text-slate-400">Off Duty</span>
                    ) : item.etaFormatted ? (
                      <span className="text-blue-700 font-bold">
                        ETA {item.etaFormatted}
                      </span>
                    ) : (
                      <span className="text-slate-500 font-medium">Ready</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Main Dual Panel: Left Live Map, Right Driver Detail ────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ── LEFT: Live Fleet Map ──────────────────────────────────── */}
        <div className="lg:col-span-6 xl:col-span-7 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <Navigation className="h-4 w-4 text-blue-600" />
              Estimated Fleet Position &bull; Active Transit Corridor
            </h2>
            <span className="text-xs text-slate-400">
              {driverFleetItems.length} Fleet Markers Active
            </span>
          </div>

          {/* Location Disclaimer Notice */}
          <LocationDisclaimerNotice variant="banner" />

          <div className="h-[480px] xl:h-[540px] w-full rounded-2xl overflow-hidden border border-slate-200 shadow-sm bg-slate-900">
            <DriverFleetMap
              drivers={driverFleetItems}
              selectedDriverId={selectedDriverId}
              onSelectDriver={setSelectedDriverId}
              className="h-full w-full"
            />
          </div>
        </div>

        {/* ── RIGHT: Selected Driver Detail & Active Assignment ─────── */}
        <div className="lg:col-span-6 xl:col-span-5 space-y-4">
          {selectedFleetItem ? (
            <>
              {/* Selected Driver Profile Card */}
              <Card className="border border-slate-200 shadow-sm bg-white rounded-2xl overflow-hidden">
                <CardHeader className="p-4 pb-3 bg-slate-50/60 border-b border-slate-100">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-blue-600 text-white font-bold flex items-center justify-center text-sm shadow-2xs">
                        {selectedFleetItem.driver.name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <CardTitle className="text-base font-bold text-slate-900">{selectedFleetItem.driver.name}</CardTitle>
                          <Badge variant="outline" className="text-[10px] font-semibold bg-slate-100 text-slate-700 border-slate-200">
                            {selectedFleetItem.driver.cdlStatus ?? 'Class A CDL'}
                          </Badge>
                        </div>
                        <CardDescription className="text-xs text-slate-500">
                          Unit #{selectedFleetItem.truck?.unitNumber ?? '101'} • {selectedFleetItem.truck?.name ?? 'Assigned Power Unit'}
                        </CardDescription>
                      </div>
                    </div>

                    {/* Duty Status Quick Toggle & Contact Shortcuts */}
                    <div className="flex items-center gap-1.5">
                      <select
                        value={isDriverOffDuty(selectedFleetItem.driver) ? 'off-duty' : 'active'}
                        onChange={async (e) => {
                          const newStatus = e.target.value as 'active' | 'off-duty';
                          const newAvailability = newStatus === 'off-duty' ? 'Off Duty' : 'Available';
                          try {
                            await updateDriverProfile(selectedFleetItem.driver.uid, {
                              status: newStatus,
                              availabilityStatus: newAvailability,
                            });
                            toast({
                              title: newStatus === 'off-duty' ? 'Driver Set to Off Duty' : 'Driver Set to Active',
                              description: `${selectedFleetItem.driver.name} duty status updated.`,
                            });
                          } catch (err: any) {
                            toast({
                              title: 'Status Update Failed',
                              description: err?.message || 'Failed to update duty status.',
                              variant: 'destructive',
                            });
                          }
                        }}
                        className={cn(
                          "h-8 px-2.5 py-1 text-xs font-semibold rounded-lg border focus:outline-none cursor-pointer transition-colors",
                          isDriverOffDuty(selectedFleetItem.driver)
                            ? "bg-slate-100 text-slate-600 border-slate-300"
                            : "bg-emerald-50 text-emerald-800 border-emerald-300"
                        )}
                        title="Change Driver Duty Status"
                      >
                        <option value="active">🟢 Active / Available</option>
                        <option value="off-duty">⚪ Off Duty</option>
                      </select>

                      {selectedFleetItem.driver.phone && (
                        <>
                          <a
                            href={`tel:${selectedFleetItem.driver.phone}`}
                            className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                            title={`Call ${selectedFleetItem.driver.name}`}
                          >
                            <Phone className="h-4 w-4" />
                          </a>
                          <a
                            href={`sms:${selectedFleetItem.driver.phone}`}
                            className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-blue-700 hover:bg-blue-50 transition-colors"
                            title={`Text ${selectedFleetItem.driver.name}`}
                          >
                            <MessageSquare className="h-4 w-4" />
                          </a>
                        </>
                      )}
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="p-4 space-y-3">
                  {/* HOS Drive Time Bar */}
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-semibold text-slate-700 flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5 text-blue-600" />
                        Remaining Drive Time (FMCSA 11-Hour Limit)
                      </span>
                      <span className="font-bold text-slate-900">
                        {(selectedFleetItem.driver.estimatedHosRemaining ?? 11.0).toFixed(1)} / 11.0 hrs
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          (selectedFleetItem.driver.estimatedHosRemaining ?? 11.0) < 3 
                            ? "bg-amber-500" 
                            : isDriverOffDuty(selectedFleetItem.driver) 
                            ? "bg-slate-300" 
                            : "bg-emerald-500"
                        )}
                        style={{ width: `${Math.min(100, Math.max(5, ((selectedFleetItem.driver.estimatedHosRemaining ?? 11.0) / 11.0) * 100))}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-600 pt-1">
                    <span>Current Staging: <strong className="text-slate-900">{selectedFleetItem.driver.currentStaging || (selectedFleetItem.driver.lastLocationCity ? `${selectedFleetItem.driver.lastLocationCity}, ${selectedFleetItem.driver.lastLocationState || ''}`.trim() : '') || selectedFleetItem.locationName}</strong></span>
                    <Badge variant="outline" className="text-[10px]">
                      {selectedFleetItem.statusLabel}
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              {/* Active Load Assignment Card (If Driver is on a load) */}
              {selectedEnrichedLoad ? (
                <Card className="border border-slate-200 shadow-sm bg-white rounded-2xl overflow-hidden">
                  <CardHeader className="p-4 pb-3 bg-blue-50/40 border-b border-blue-100 flex flex-row items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold bg-blue-600 text-white px-2 py-0.5 rounded-md">
                          {selectedEnrichedLoad.load.loadNumber ?? `#${selectedEnrichedLoad.load.id?.substring(0, 6).toUpperCase()}`}
                        </span>
                        <CardTitle className="text-sm font-bold text-slate-900">
                          {selectedEnrichedLoad.client?.companyName ?? 'Shipper Consignment'}
                        </CardTitle>
                      </div>
                      <CardDescription className="text-xs text-slate-500 mt-0.5">
                        {selectedEnrichedLoad.load.origin?.city}, {selectedEnrichedLoad.load.origin?.state} ➔ {selectedEnrichedLoad.load.destination?.city}, {selectedEnrichedLoad.load.destination?.state}
                      </CardDescription>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setSelectedMapLoadId(selectedEnrichedLoad.load.id!)}
                        className="text-xs text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-100/50"
                        title="Expand route corridor"
                      >
                        <Maximize2 className="h-4 w-4" />
                      </button>
                    </div>
                  </CardHeader>

                  <CardContent className="p-4 space-y-3.5">
                    {/* Active Waypoint Box */}
                    <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-blue-800 bg-blue-100/70 px-2 py-0.5 rounded">
                          Leg {selectedEnrichedLoad.legProgress.legIndex + 1} of {selectedEnrichedLoad.legProgress.totalLegs}: {selectedEnrichedLoad.legProgress.activeLegTitle}
                        </span>
                        <span className="font-semibold text-slate-700">
                          {selectedEnrichedLoad.legProgress.nextStopDistanceText}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-center text-xs pt-1">
                        <div className="p-2 bg-white rounded-lg border border-slate-200">
                          <span className="text-[10px] text-slate-400 uppercase font-semibold block">Next Stop ETA</span>
                          <strong className="text-blue-700 font-bold">{selectedEnrichedLoad.legProgress.nextStopEtaFormatted}</strong>
                        </div>
                        <div className="p-2 bg-white rounded-lg border border-slate-200">
                          <span className="text-[10px] text-slate-400 uppercase font-semibold block">Drive Time</span>
                          <strong className="text-amber-700 font-bold">~{selectedEnrichedLoad.legProgress.nextStopCountdownFormatted}</strong>
                        </div>
                        <div className="p-2 bg-white rounded-lg border border-slate-200">
                          <span className="text-[10px] text-slate-400 uppercase font-semibold block">Leg Progress</span>
                          <strong className="text-emerald-700 font-bold">{Math.round(selectedEnrichedLoad.legProgress.legFraction * 100)}%</strong>
                        </div>
                      </div>

                      {/* Waypoint Action Buttons */}
                      <div className="pt-2 flex items-center justify-between gap-2 flex-wrap border-t border-slate-200/60">
                        <span className="text-[11px] text-slate-500 font-medium">Waypoint Action:</span>

                        {(() => {
                          const activeTargetLoad = selectedEnrichedLoad.load;
                          const isPickup = selectedEnrichedLoad.legProgress.nextStopType === 'pickup';
                          const isArrived = activeTargetLoad.status === 'arrived' || (activeTargetLoad as any).status === 'Arrived' || activeTargetLoad.driverPhase === 'Arrived';

                          if (isArrived) {
                            return (
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <Badge className="bg-teal-50 text-teal-800 border-teal-200 text-xs">
                                  📍 Stationary • Detention Clock Active
                                </Badge>
                                {isPickup ? (
                                  <Button
                                    size="sm"
                                    onClick={() => updateLoad(activeTargetLoad.id!, { status: 'loading', driverPhase: 'Getting Loaded' })}
                                    className="bg-amber-600 hover:bg-amber-700 text-white text-xs h-7"
                                  >
                                    Begin Loading
                                  </Button>
                                ) : (
                                  <Button
                                    size="sm"
                                    onClick={() => updateLoad(activeTargetLoad.id!, { status: 'unloading', driverPhase: 'Getting Unloaded' })}
                                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-7"
                                  >
                                    Begin Unloading
                                  </Button>
                                )}
                              </div>
                            );
                          }

                          if (isPickup) {
                            if (activeTargetLoad.status === 'loading') {
                              return (
                                <Button
                                  size="sm"
                                  onClick={() => updateLoad(activeTargetLoad.id!, { status: 'in-transit', driverPhase: 'Enroute to Destination' })}
                                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-7"
                                >
                                  Depart Pickup (In Transit)
                                </Button>
                              );
                            }
                            return (
                              <Button
                                size="sm"
                                onClick={() => updateLoad(activeTargetLoad.id!, { status: 'arrived', driverPhase: 'Arrived' })}
                                className="bg-teal-600 hover:bg-teal-700 text-white text-xs h-7"
                              >
                                Mark Arrived at Shipper
                              </Button>
                            );
                          } else {
                            if (activeTargetLoad.status === 'unloading') {
                              return (
                                <Button
                                  size="sm"
                                  onClick={() => updateLoad(activeTargetLoad.id!, { 
                                    status: 'delivered', 
                                    driverPhase: 'Complete',
                                    deliveredAt: new Date().toISOString(),
                                    paperworkStatus: activeTargetLoad.signedBolUrl ? 'pod_uploaded' : 'pending_pod',
                                  })}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold h-7 gap-1"
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  Complete Delivery
                                </Button>
                              );
                            }
                            return (
                              <Button
                                size="sm"
                                onClick={() => updateLoad(activeTargetLoad.id!, { status: 'arrived', driverPhase: 'Arrived' })}
                                className="bg-teal-600 hover:bg-teal-700 text-white text-xs h-7"
                              >
                                Mark Arrived at Destination
                              </Button>
                            );
                          }
                        })()}
                      </div>
                    </div>

                    {/* Paperwork / BOL & Packet Shortcuts */}
                    <div className="flex items-center justify-between text-xs pt-1">
                      {selectedEnrichedLoad.load.signedBolUrl ? (
                        <a
                          href={selectedEnrichedLoad.load.signedBolUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 font-semibold text-purple-700 hover:underline"
                        >
                          <FileCheck className="h-3.5 w-3.5" />
                          View Signed POD (BOL)
                        </a>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">No paper BOL uploaded yet</span>
                      )}

                      <button
                        type="button"
                        onClick={() => setSharePacketLoad(selectedEnrichedLoad.load)}
                        className="inline-flex items-center gap-1 font-semibold text-blue-600 hover:underline"
                      >
                        <Share2 className="h-3.5 w-3.5" />
                        Share Load Packet
                      </button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                /* Driver is Available (No Active Load) */
                <Card className="border border-blue-200 shadow-sm bg-gradient-to-b from-blue-50/30 to-white rounded-2xl p-5 text-center space-y-2">
                  <div className="w-11 h-11 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mx-auto border border-blue-200">
                    <Truck className="h-5 w-5" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-900">Driver Staged &amp; Available</h4>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                    {selectedFleetItem.driver.name} is currently staged in <strong className="text-slate-800">{selectedFleetItem.driver.currentStaging || (selectedFleetItem.driver.lastLocationCity ? `${selectedFleetItem.driver.lastLocationCity}, ${selectedFleetItem.driver.lastLocationState || ''}`.trim() : '') || selectedFleetItem.locationName}</strong> with <strong>{(selectedFleetItem.driver.estimatedHosRemaining ?? 11).toFixed(1)} hrs</strong> of driving time ready.
                  </p>
                </Card>
              )}

              {/* ── Candidate Next-Load Suggestions ────────────────────── */}
              {candidateNextLoads.length > 0 && selectedFleetItem.status !== 'Off Duty' && (
                <Card className="border border-slate-200 shadow-sm bg-white rounded-2xl overflow-hidden">
                  <CardHeader className="p-4 pb-2 border-b border-slate-100 flex flex-row items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-amber-500" />
                      <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-800">
                        Smart Next-Load Pairings
                      </CardTitle>
                    </div>
                    <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                      Lowest Deadhead
                    </Badge>
                  </CardHeader>
                  <CardContent className="p-3.5 space-y-3">
                    {candidateNextLoads.map(candidate => (
                      <div
                        key={candidate.load.id}
                        className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="text-xs font-bold text-blue-700">
                              {candidate.load.loadNumber ?? `#${candidate.load.id?.slice(0, 6).toUpperCase()}`}
                            </span>
                            <p className="text-xs font-medium text-slate-800 mt-0.5">
                              {candidate.pickupLocationName} ➔ {candidate.deliveryLocationName}
                            </p>
                          </div>
                          <div className="text-right">
                            <span className="text-xs font-bold text-emerald-700 block">
                              +${candidate.projectedGross.toFixed(2)}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              ~{candidate.deadheadMiles} mi deadhead
                            </span>
                          </div>
                        </div>

                        <Button
                          size="sm"
                          disabled={assigningLoadId === candidate.load.id}
                          onClick={() => handleAssignCandidateLoad(candidate)}
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs h-8 shadow-2xs gap-1.5"
                        >
                          <Sparkles className="h-3.5 w-3.5 text-amber-300" />
                          <span>{assigningLoadId === candidate.load.id ? 'Dispatching...' : `Assign & Dispatch to ${selectedFleetItem.driver.name}`}</span>
                        </Button>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <div className="p-6 bg-white border border-slate-200 rounded-2xl text-center text-slate-400 text-xs">
              Select a driver from the roster above or tap a map marker to view live status.
            </div>
          )}
        </div>
      </div>

      {/* ── Expandable Full Fleet Telemetry Table ─────────────────────── */}
      <Card className="border border-slate-200 shadow-sm bg-white rounded-2xl overflow-hidden">
        <button
          type="button"
          onClick={() => setShowFullFleetTable(!showFullFleetTable)}
          className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-50/70 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <Layers className="h-4 w-4 text-blue-600" />
            <div>
              <strong className="text-xs font-bold text-slate-900 block">All Drivers Fleet Status Overview</strong>
              <span className="text-[11px] text-slate-500">Summary of all drivers, remaining HOS, and active assignments</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-600">
            <span>{showFullFleetTable ? 'Hide Table' : 'Show Table'}</span>
            {showFullFleetTable ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </button>

        {showFullFleetTable && (
          <div className="border-t border-slate-100 overflow-x-auto p-0">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-[10px] text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Driver Name</th>
                  <th className="py-3 px-4">Duty Status</th>
                  <th className="py-3 px-4">Remaining HOS</th>
                  <th className="py-3 px-4">Current Route / Location</th>
                  <th className="py-3 px-4">Next Stop ETA</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {driverFleetItems.map((item) => {
                  const hos = item.driver.estimatedHosRemaining ?? 11.0;
                  const driverKey = item.driver.id || item.driver.uid;
                  const isSelected = Boolean(
                    selectedDriverId && (item.driver.uid === selectedDriverId || item.driver.id === selectedDriverId)
                  );
                  return (
                    <tr
                      key={driverKey}
                      onClick={() => setSelectedDriverId(driverKey)}
                      className={cn(
                        "hover:bg-slate-50/80 cursor-pointer transition-colors",
                        isSelected ? "bg-blue-50/30" : ""
                      )}
                    >
                      <td className="py-3 px-4 font-bold text-slate-900">
                        {item.driver.name}
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant="outline" className="text-[10px] font-semibold">
                          {item.statusLabel}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 font-semibold">
                        <span className={hos < 3 && item.status !== 'Off Duty' ? "text-amber-600 font-bold" : "text-slate-800"}>
                          {hos.toFixed(1)} hrs
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {item.locationName}
                      </td>
                      <td className="py-3 px-4 text-blue-700 font-medium">
                        {item.etaFormatted || '—'}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedDriverId(driverKey);
                          }}
                          className="text-xs h-7 text-blue-600 hover:text-blue-800"
                        >
                          Select
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── Popout Route Modal ───────────────────────────────────────── */}
      {selectedMapData && (
        <TransitMapModal
          isOpen={Boolean(selectedMapData)}
          onClose={() => setSelectedMapLoadId(null)}
          load={selectedMapData.load}
          legProgress={selectedMapData.legProgress}
          driver={selectedMapData.driver}
        />
      )}

      {/* ── Share Load Packet Modal ──────────────────────────────────── */}
      <ShareLoadPacketModal
        load={sharePacketLoad}
        client={clients.find(c => c.id === sharePacketLoad?.clientId)}
        settings={settings}
        vehicles={vehicles}
        driverProfiles={driverProfiles}
        isOpen={Boolean(sharePacketLoad)}
        onClose={() => setSharePacketLoad(null)}
      />
    </div>
  );
}
