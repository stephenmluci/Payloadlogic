
import React from 'react';
import type { Load, Client, Settings } from '@/types';
import { calculateTripMetrics, computeCargoLinearFootprint } from '@/lib/logisticsEngine';
import { vehicleToEngineTruck, vehicleToEngineTrailer, loadToCargoItem } from '@/lib/logisticsAdapters';
import { calculateHOSTransit } from '@/lib/hosEngine';
import { computeCompliance } from '@/lib/complianceEngine';
import { HOSWarningBanner } from './HOSWarningBanner';
import { ComplianceBadges } from './ComplianceBadges';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue, SelectSeparator, SelectLabel } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { MapPin, Map, Milestone, DollarSign, FileText, CheckCircle, Clock, Truck as TruckIcon, Hash, CalendarClock, UserCircle, Pencil, Trash2, Ruler, Weight, Box, ShieldCheck, ShieldX, ShieldAlert, Timer, Phone, TrendingUp, TrendingDown, Info, AlertTriangle, Scale, MessageSquare, Lock, FileCheck, ExternalLink, Share2, Receipt, ChevronDown, ChevronUp, Send } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { ShareLoadPacketModal } from './ShareLoadPacketModal';
import { SignedBolUpload } from './SignedBolUpload';
import { getDriverProfileId } from '@/lib/driverAssignment';

const CDL_THRESHOLD = 26_000; // lbs — 49 CFR § 383.91

import { format as formatDate, differenceInCalendarDays } from 'date-fns';
import { cn, formatAddress } from '@/lib/utils';
import type { Address } from '@/types';



type LoadCardProps = {
  load: Load;
  client: Client | undefined;
  settings: Settings; 
  onStatusChange: (loadId: string, status: Load['status']) => void;
  onGenerateAgreement: (load: Load) => void;
  onGenerateInvoice: (load: Load) => void;
  onGenerateSettlement?: (load: Load) => void;
  onShareLoadPacket?: (load: Load) => void;
  onEdit: (load: Load) => void;
  onDelete: (loadId: string) => Promise<void>;
  /** Called when the dispatcher clicks "Update to Best Delivery Date" on an infeasible load */
  onUpdateDelivery?: (loadId: string, deliveryDateTime: string) => void;
  calculateVehicleCPM?: (vehicleId: string) => number;
  isUpdatingStatus?: boolean;
  vehicles?: import('@/types').Vehicle[];
  loads?: Load[];
  /** Trips array for resolving trip numbers from load.tripId */
  trips?: import('@/types').Trip[];
  driverProfiles?: import('@/types').DriverProfile[]; expenses?: import('@/types').Expense[];
};

import { isDriverBroadcastingGPS, deriveTelemetryLoadStatus, isErroneousArrivalTimestamp } from '@/lib/telemetrySync';

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending_approval: { label: 'Pending Approval', color: 'bg-amber-500 text-white', icon: <Clock className="h-4 w-4 mr-1" /> },
  approved: { label: 'Approved', color: 'bg-blue-600 text-white', icon: <CheckCircle className="h-4 w-4 mr-1" /> },
  pending: { label: 'Pending Approval', color: 'bg-amber-500 text-white', icon: <Clock className="h-4 w-4 mr-1" /> },
  'client-request-approved': { label: 'Req. Approved', color: 'bg-teal-500 text-white', icon: <CheckCircle className="h-4 w-4 mr-1" /> },
  dispatched: { label: 'Dispatched', color: 'bg-indigo-600 text-white', icon: <TruckIcon className="h-4 w-4 mr-1" /> },
  deadheading: { label: 'Deadheading', color: 'bg-indigo-600 text-white', icon: <TruckIcon className="h-4 w-4 mr-1" /> },
  Deadheading: { label: 'Deadheading', color: 'bg-indigo-600 text-white', icon: <TruckIcon className="h-4 w-4 mr-1" /> },
  'arrived-origin': { label: 'Arrived at Origin', color: 'bg-cyan-600 text-white', icon: <MapPin className="h-4 w-4 mr-1" /> },
  loading: { label: 'Loading', color: 'bg-blue-100 text-blue-800', icon: <Box className="h-4 w-4 mr-1" /> },
  'in-transit': { label: 'In Transit (Loaded)', color: 'bg-emerald-600 text-white', icon: <TruckIcon className="h-4 w-4 mr-1" /> },
  'arrived-destination': { label: 'Arrived at Destination', color: 'bg-teal-600 text-white', icon: <MapPin className="h-4 w-4 mr-1" /> },
  unloading: { label: 'Unloading', color: 'bg-amber-100 text-amber-800', icon: <Box className="h-4 w-4 mr-1" /> },
  delivered: { label: 'Delivered', color: 'bg-teal-700 text-white', icon: <CheckCircle className="h-4 w-4 mr-1" /> },
  // Aliases / Exception states
  arrived: { label: 'Arrived at Facility', color: 'bg-teal-600 text-white', icon: <MapPin className="h-4 w-4 mr-1" /> },
  Arrived: { label: 'Arrived at Facility', color: 'bg-teal-600 text-white', icon: <MapPin className="h-4 w-4 mr-1" /> },
  waiting: { label: 'Waiting / Detention', color: 'bg-orange-100 text-orange-800', icon: <Timer className="h-4 w-4 mr-1" /> },
  'on-break': { label: 'On Break', color: 'bg-slate-100 text-slate-700', icon: <Clock className="h-4 w-4 mr-1" /> },
  idle: { label: 'Idle / Staging', color: 'bg-slate-100 text-slate-700', icon: <Clock className="h-4 w-4 mr-1" /> },
};

/** Returns a concise unified label for the dispatcher badge */
export function getDispatcherStatusLabel(statusKey: string, load?: Load): { label: string; color: string } {
  const norm = (statusKey || '').toLowerCase();
  if (norm === 'delivered' || norm === 'complete' || norm === 'delivered / completed') {
    const hasBol = Boolean(load?.signedBolUrl || load?.paperworkStatus === 'pod_uploaded' || load?.paperworkStatus === 'invoiced' || load?.paperworkStatus === 'closed');
    if (hasBol) {
      return { label: 'Delivered (POD Verified)', color: 'bg-emerald-700 text-white' };
    }
    return { label: 'Delivered (Pending POD)', color: 'bg-amber-600 text-white' };
  }
  return statusConfig[statusKey] ?? statusConfig[statusKey?.toLowerCase()] ?? statusConfig.pending_approval;
}

const formatDateTimeDisplay = (isoString: string | undefined) => {
  if (!isoString) return 'N/A';
  try {
    return formatDate(new Date(isoString), 'PPpp');
  } catch {
    return 'Invalid Date';
  }
};


export function LoadCard({ 
  load, client, settings, onStatusChange, onGenerateAgreement, onGenerateInvoice, onGenerateSettlement, onShareLoadPacket, onEdit, onDelete, onUpdateDelivery, calculateVehicleCPM, isUpdatingStatus, vehicles, loads, trips, driverProfiles, expenses
}: LoadCardProps) {
  const { financialProfile, isFinancialProfileComplete, setIsFleetFinancialModalOpen } = useApp();
  const [isSharePacketOpen, setIsSharePacketOpen] = React.useState(false);
  const [isExpenseLedgerOpen, setIsExpenseLedgerOpen] = React.useState(false);
  const VALID_STATUS_VALUES = [
    'pending_approval',
    'approved',
    'pending',
    'client-request-approved',
    'dispatched',
    'arrived-origin',
    'loading',
    'in-transit',
    'arrived-destination',
    'unloading',
    'delivered',
    'waiting',
    'on-break',
    'idle'
  ];

  const normalizedStatus = React.useMemo(() => {
    const raw = String(load.status || '').toLowerCase().trim();
    if (!raw || raw === 'pending_approval' || raw === 'draft') return 'pending_approval';
    if (raw === 'approved') return 'approved';
    if (raw === 'pending') return 'pending_approval';
    if (raw === 'arrived' || raw === 'arrived at destination') return 'arrived-destination';
    if (raw === 'arrived at origin') return 'arrived-origin';
    if (raw === 'enroute to pickup' || raw === 'dispatched / en route' || raw === 'dispatched') return 'dispatched';
    if (raw === 'getting loaded') return 'loading';
    if (raw === 'enroute to destination' || raw === 'in transit') return 'in-transit';
    if (raw === 'getting unloaded') return 'unloading';
    if (raw === 'complete' || raw === 'delivered / completed') return 'delivered';
    return VALID_STATUS_VALUES.includes(raw) ? (raw as Load['status']) : 'pending_approval';
  }, [load.status]);

  const currentStatus = statusConfig[load.status] || statusConfig[normalizedStatus] || statusConfig.pending;

  // ── HOS transit feasibility (only meaningful for non-delivered loads) ────────
  const hosResult = load.status !== 'delivered'
    ? calculateHOSTransit(
        load.distance      || 0,
        load.deadheadMiles || 0,
        load.pickupDateTime  || '',
        load.deliveryDateTime || '',
      )
    : null;

  // ── In-Transit Actual Expenses (from actualExpenses sub-collection) ─────────
  const actualExpensesList = load.actualExpenses || [];

  const loggedFuel = actualExpensesList
    .filter(e => e.category === 'Fuel')
    .reduce((sum, e) => sum + (e.amount || 0), 0);

  const loggedDef = actualExpensesList
    .filter(e => e.category === 'DEF')
    .reduce((sum, e) => sum + (e.amount || 0), 0);

  const loggedMaintenance = actualExpensesList
    .filter(e => e.category === 'Maintenance/Repair')
    .reduce((sum, e) => sum + (e.amount || 0), 0);

  const loggedTollsAndScales = actualExpensesList
    .filter(e => ['Tolls', 'Scale Ticket', 'Other'].includes(e.category))
    .reduce((sum, e) => sum + (e.amount || 0), 0);

  const totalLoggedExpenses = actualExpensesList.reduce((sum, e) => sum + (e.amount || 0), 0);

  // Delivered Load Actual Expenses (dynamically integrated with sub-collection)
  const actualFuelDelivered = loggedFuel > 0 ? loggedFuel : (load.expenses?.fuel || 0);
  const actualDefDelivered = loggedDef > 0 ? loggedDef : (load.expenses?.def || 0);
  const actualMaintenanceDelivered = loggedMaintenance > 0 ? loggedMaintenance : (load.expenses?.maintenance || 0);
  const actualRecurringDelivered = load.expenses?.recurring || 0;
  const actualPayrollDelivered = load.expenses?.payroll || 0;
  const actualTollsScalesDelivered = loggedTollsAndScales;

  const actualProfit = load.totalAgreedRate - (
    actualPayrollDelivered +
    actualRecurringDelivered +
    actualFuelDelivered +
    actualDefDelivered +
    actualMaintenanceDelivered +
    actualTollsScalesDelivered
  );

  const matchedTrip = (load.tripId && load.tripId !== 'none') ? trips?.find(t => t.id === load.tripId) : undefined;
  const trailer = (load.assignedTrailerId && vehicles ? vehicles.find(v => v.id === load.assignedTrailerId) : undefined)
    || (matchedTrip?.assignedTrailerId ? vehicles?.find(v => v.id === matchedTrip.assignedTrailerId) : undefined);
  const truck = (load.assignedTruckId && vehicles ? vehicles.find(v => v.id === load.assignedTruckId) : undefined)
    || (matchedTrip?.assignedTruckId ? vehicles?.find(v => v.id === matchedTrip.assignedTruckId) : undefined);
  const driver = (load.assignedDriverId && driverProfiles ? driverProfiles.find(d => getDriverProfileId(d) === load.assignedDriverId || (load.assignedDriverId && d.name?.toLowerCase() === load.assignedDriverId.toLowerCase())) : undefined)
    || (matchedTrip?.assignedDriverId ? driverProfiles?.find(d => getDriverProfileId(d) === matchedTrip.assignedDriverId) : undefined)
    || (truck?.assignedDriverId ? driverProfiles?.find(d => getDriverProfileId(d) === truck.assignedDriverId) : undefined)
    || (load.assignedTruckId && driverProfiles ? driverProfiles.find(d => d.assignedTruckId === load.assignedTruckId) : undefined)
    || (load.assignedDriverName && driverProfiles ? driverProfiles.find(d => d.name?.toLowerCase() === load.assignedDriverName?.toLowerCase()) : undefined);
  
  // ── Telemetry status synchronization ────────────────────────────────────
  const isBroadcastingGPS = isDriverBroadcastingGPS(driver);
  const isTrackingViaTelemetry = Boolean(driver && (isBroadcastingGPS || driver.telemetry?.status));

  // 1. Derived Status UI & Single Source of Truth: If load has an assigned driver and has been dispatched/started,
  // sync the UI with live GPS/radar telemetry.
  // Never hijack pre-dispatch states (pending_approval, approved, pending) before dispatch!
  const isPreDispatchState = normalizedStatus === 'pending_approval' || normalizedStatus === 'approved' || normalizedStatus === 'pending';
  const telemetryDerivedStatus = React.useMemo(() => {
    if (!driver || !load.assignedDriverId || isPreDispatchState) return null;
    return deriveTelemetryLoadStatus(load, loads || [], driver, Date.now());
  }, [driver, load, loads, isPreDispatchState]);

  const effectiveStatus = isPreDispatchState
    ? normalizedStatus
    : (load.assignedDriverId && telemetryDerivedStatus
        ? telemetryDerivedStatus
        : (isTrackingViaTelemetry && telemetryDerivedStatus ? telemetryDerivedStatus : normalizedStatus));


  const isErroneousArrival = isErroneousArrivalTimestamp(load, driver, loads || []);
  const showDetentionBanner = (load.status === 'arrived' || (load as any).status === 'Arrived' || load.arrivedAt || load.arrivalTimestamp) && 
    !isErroneousArrival && 
    !isTrackingViaTelemetry && 
    effectiveStatus !== 'dispatched' && 
    effectiveStatus !== 'Deadheading';

  const deckHeight = trailer?.deckHeight || 0;
  
  let totalCargoHeight = load.cargoHeight ? (load.cargoHeight <= 20 ? load.cargoHeight * 12 : load.cargoHeight) : 0;
  if (load.placementMode === 'stacked' || load.placementMode === 'nested') {
      const linkedLoad = loads?.find(l => l.id === load.linkedLoadId);
      if (linkedLoad) {
          const linkedH = linkedLoad.cargoHeight ? (linkedLoad.cargoHeight <= 20 ? linkedLoad.cargoHeight * 12 : linkedLoad.cargoHeight) : 0;
          totalCargoHeight += linkedH;
      }
  }
  const totalTransportHeight = deckHeight + totalCargoHeight;
  const isOverHeight = deckHeight > 0 && totalCargoHeight > 0 && totalTransportHeight > 162;

  // ── Capacity & Proration Share ───────────────────────────────────────────
  const isTripConsolidated = Boolean(load.tripId && load.tripId !== 'none');
  const effectiveDeckLength = trailer?.trailerLength ?? 40;
  const effectivePayloadCapacity = trailer?.payloadCapacity
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

  const spaceShare = effectiveDeckLength > 0 && incomingLinearFt > 0
    ? Math.min(1.0, incomingLinearFt / effectiveDeckLength)
    : 0;
  const weightShare = effectivePayloadCapacity > 0 && incomingWeight > 0
    ? Math.min(1.0, incomingWeight / effectivePayloadCapacity)
    : 0;

  const maxCapacityShare = Math.max(spaceShare, weightShare);

  // ── LTL / Partial Freight Distribution ─────────────────────────────────
  const isLtlLoad = Boolean(load.isPartialLTL ?? load.isLtl ?? load.isPartialLoad);
  const autoDeckPercentage = effectiveDeckLength > 0 && incomingLinearFt > 0
    ? Math.min(100, Math.max(5, Math.round((incomingLinearFt / effectiveDeckLength) * 100)))
    : (maxCapacityShare > 0 ? Math.round(maxCapacityShare * 100) : 25);
  const deckPercentageUsed = load.deckPercentageUsed !== undefined && load.deckPercentageUsed > 0
    ? load.deckPercentageUsed
    : autoDeckPercentage;

  // Deck footprint accounting for (Quantity * Length) / Max Trailer Length
  const loadQuantity = Math.max(1, load.cargoQuantity || 1);
  const exactLinearFeet = (load.cargoLength && load.cargoLength > 0)
    ? load.cargoLength * loadQuantity
    : (incomingLinearFt > 0 ? incomingLinearFt : (effectiveDeckLength * (deckPercentageUsed / 100)));
  const trailerMaxLength = effectiveDeckLength > 0 ? effectiveDeckLength : 40;
  const calculatedDeckRatio = trailerMaxLength > 0 ? Math.min(1.0, Math.max(0.01, exactLinearFeet / trailerMaxLength)) : 1.0;
  const effectiveDeckPercentageRatio = (load.deckPercentageUsed !== undefined && load.deckPercentageUsed > 0)
    ? Math.min(1.0, Math.max(0.01, load.deckPercentageUsed / 100))
    : calculatedDeckRatio;
  const deckFootprintPercentage = Math.round(effectiveDeckPercentageRatio * 100);

  let costShare = 1.0;
  if (isLtlLoad || isTripConsolidated) {
    if (load.deckPercentageUsed !== undefined && load.deckPercentageUsed > 0) {
      costShare = Math.max(0.01, Math.min(1.0, load.deckPercentageUsed / 100));
    } else if (autoDeckPercentage > 0) {
      costShare = Math.max(0.01, Math.min(1.0, autoDeckPercentage / 100));
    } else if (maxCapacityShare > 0) {
      costShare = Math.max(0.01, Math.min(1.0, maxCapacityShare));
    } else if (matchedTrip) {
      const existingTripLoads = (loads ?? []).filter(l => l.tripId === matchedTrip.id && l.status !== 'delivered');
      const count = Math.max(1, existingTripLoads.length);
      costShare = 1 / count;
    } else {
      costShare = 0.25;
    }
  } else {
    // Dedicated Full Load: strictly 100%
    costShare = 1.0;
  }

  // ── DOT Weight / CDL Compliance — via logisticsEngine (FMCSA 49 CFR § 383.91) ───────
  const engineTruck = truck
    ? vehicleToEngineTruck(truck, truck.estimatedMonthlyMiles ?? 5_000)
    : { id: '', description: '', gvwr: 0, opCostPerMile: 0.15, insuranceMo: 0, maxTongueWeightCapacity: 3_500, monthlyPayment: 0, maintFundMo: 0 };
  const engineTrailer = trailer
    ? vehicleToEngineTrailer(trailer)
    : { id: '', description: '', gvwr: 0, emptyWeight: 0, monthlyPayment: 0, maintFundMo: 0, insuranceMo: 0, deckLength: 40, deckWidth: 8.5 };
  const engineCargo = [cargoItem];

  const engineResults = calculateTripMetrics({
    truck:    engineTruck,
    trailer:  engineTrailer,
    cargo:    engineCargo,
    loadedMiles:   load.distance ?? 0,
    deadheadMiles: load.deadheadMiles ?? 0,
    pickupDate:    load.pickupDateTime  ?? new Date().toISOString(),
    deliveryDate:  load.deliveryDateTime ?? new Date().toISOString(),
    projectedFuel: 0,
    projectedDef:  0,
    averageMonthlyMiles: truck?.estimatedMonthlyMiles ?? 5_000,
    businessNetProfitTargetPerDay: settings.targetDailyBusinessProfit ?? 0,
    driverPayrollTargetPerDay: driver
      ? (driver.payType === 'hourly'
          ? (driver.payRate || settings.defaultDriverHourlyRate || 0) * 8
          : driver.payType === 'per-mile'
          ? (driver.payRate || 0) * 450
          : 0)
      : (settings.defaultDriverHourlyRate ? settings.defaultDriverHourlyRate * 8 : 0),
    userEnteredRatePerMile:        load.ratePerMile,
    costShareRatio:                costShare,
  });

  const {
    paperGcwr,
    isCdlRequired: requiresClassACDL,
  } = engineResults;

  const truckGvwr  = engineTruck.gvwr;
  const trailerGvwr = engineTrailer.gvwr;
  const totalCargoWeight = engineResults.totalCargoWeight;
  const gcwr = paperGcwr;

  // Actual operating weight from vehicle physical tare weights — not engine-derived
  const actualOperatingWeight =
    (truck?.emptyWeight  ?? 0) +
    (trailer?.emptyWeight ?? 0) +
    totalCargoWeight;

  const complianceResult = computeCompliance(
    truck,
    trailer,
    driver,
    totalCargoWeight
  );

  const isDotWeightViolation = complianceResult.cdlStatus === 'breach';

  const clientDisplayInfo = client
    ? `${client.companyName} (Contact: ${client.contactName})`
    : load.requestedByClientName || 'Unknown Client';

  // ── Projected Profit for active (non-delivered) loads ─────────────────────
  // Formula: Revenue − (Fuel + DEF + Prorated daily fixed costs + Per-mile op cost + Payroll)
  // Note: truckCpm is a monthly fleet-average metric and must NOT be used as a
  //       per-trip cost multiplier — doing so dumps the entire month's fixed costs
  //       onto a single load and produces wildly negative "projected profits".
  // ── Multi-Day Calendar Trip Days Calculation ─────────────────────────────
  let tripCalendarDays = 1;
  if (load.pickupDateTime && load.deliveryDateTime) {
    try {
      const pDate = new Date(load.pickupDateTime);
      const dDate = new Date(load.deliveryDateTime);
      if (!isNaN(pDate.getTime()) && !isNaN(dDate.getTime())) {
        const days = differenceInCalendarDays(dDate, pDate) + 1;
        tripCalendarDays = Math.max(1, days);
      }
    } catch {
      tripCalendarDays = 1;
    }
  }
  if (load.tripDuration && load.tripDuration > 0) {
    tripCalendarDays = Math.max(tripCalendarDays, load.tripDuration);
  }

  let projectedProfit: number | null = null;
  let projectedPayroll = 0;
  let projectedFuelCost = 0;
  let projectedDefCost = 0;
  let projectedTotalRecurring = 0;
  let projectedMaintenance = 0;

  if ((load.status !== 'delivered' || !load.expenses?.calculated) && isFinancialProfileComplete) {

    const totalTripMiles = (load.distance || 0) + (load.deadheadMiles || 0);

    // ── Payroll ──────────────────────────────────────────────────────────────
    if (driver) {
      if (driver.payType === 'per-mile') {
        projectedPayroll = totalTripMiles * (driver.payRate || 0) * costShare;
      } else if (driver.payType === 'hourly') {
        const estHours = driver.estimatedTripHours
          || (totalTripMiles > 0 ? totalTripMiles / (settings.truckAverageSpeed || 55) : 0);
        projectedPayroll = estHours * (driver.payRate || settings.defaultDriverHourlyRate || 0) * costShare;
      } else {
        const rate = driver.payPercentageOfGross ?? driver.payrollPercentage ?? settings.payrollPercentage;
        projectedPayroll = load.totalAgreedRate * ((rate ?? 0) / 100);
      }
    } else if (settings.defaultDriverPayType === 'hourly') {
      const estHours = totalTripMiles > 0 ? totalTripMiles / (settings.truckAverageSpeed || 55) : 0;
      projectedPayroll = estHours * (settings.defaultDriverHourlyRate || 0) * costShare;
    } else {
      projectedPayroll = load.totalAgreedRate * ((settings.payrollPercentage || 0) / 100);
    }

    // ── Fuel ─────────────────────────────────────────────────────────────────
    const mpg = truck?.mpg ?? settings.truckMpg;
    const fuelPrice = truck?.avgFuelPrice ?? settings.defaultFuelCostPerGallon ?? 0;
    projectedFuelCost = (totalTripMiles > 0 && mpg > 0 && fuelPrice > 0)
      ? ((totalTripMiles / mpg) * fuelPrice) * costShare
      : 0;

    // ── DEF: 2.5% of fuel volume × DEF cost per gallon ───────────────────
    const DEF_RATIO = 0.025;
    const defCostPerGal = (truck as any)?.avgDefCostPerGallon ?? settings.defCostPerGallon ?? 0;
    const totalFuelGals = mpg > 0 ? totalTripMiles / mpg : 0;
    projectedDefCost = (totalFuelGals * DEF_RATIO * defCostPerGal) * costShare;

    // ── Per-mile operating cost (maintenance reserve — pure reserve, not full CPM) ────
    const opCostPerMile = truck?.operatingCostPerMile ?? settings.defaultOperatingCostPerMile ?? 0;
    projectedMaintenance = totalTripMiles * opCostPerMile * costShare;

    // ── Prorated overhead — multi-day calendar trip scaling ─────────────────

    const getVehicleMonthly = (v: typeof truck | typeof trailer) => {
      if (!v) return 0;
      let total = 0;
      if (v.monthlyRecurringExpenses) {
        total += (v.monthlyRecurringExpenses.insurance || 0);
        total += (v.monthlyRecurringExpenses.payment || 0);
        // maintenanceFund intentionally excluded — covered by maintenance reserve line
      }
      return total;
    };
    const truckMonthlyFixed   = getVehicleMonthly(truck);
    const trailerMonthlyFixed = getVehicleMonthly(trailer);
    const vehicleFixedTotal   = truckMonthlyFixed + trailerMonthlyFixed;

    // Global overhead prorated per active truck
    const activeTruckCount = Math.max(1, (vehicles ?? []).filter(v => v.type === 'truck').length);
    const globalMonthlyOverhead = (settings.recurringExpenses || []).reduce((sum, e) => sum + (e.amount || 0), 0);
    const perTruckGlobalMonthly = globalMonthlyOverhead / activeTruckCount;

    const totalMonthlyFixed = vehicleFixedTotal > 0 ? vehicleFixedTotal + perTruckGlobalMonthly : perTruckGlobalMonthly;
    const dailyTruckOverhead = totalMonthlyFixed / 30;

    // ── Global Overhead Rule ────────────────────────────────────────────────
    // 1. Deck Percentage: (Load Linear Feet / Trailer Max Length) uses effectiveDeckPercentageRatio computed above

    // 2. Gross Overhead: (Daily Truck Overhead * Transit Calendar Days)
    const transitCalendarDays = tripCalendarDays > 0 ? tripCalendarDays : 1;
    const grossOverhead = dailyTruckOverhead * transitCalendarDays;

    // 3. Prorated Allocation: (Gross Overhead * Deck Percentage)
    // 4. Override: Applies globally to all loads — even if the only load in a container, 15% deck = 15% overhead.
    projectedTotalRecurring = grossOverhead * effectiveDeckPercentageRatio;

    // -- Override with In-Transit Actual Expenses from sub-collection --
    if (loggedFuel > 0) projectedFuelCost = loggedFuel;
    if (loggedDef > 0) projectedDefCost = loggedDef;
    if (loggedMaintenance > 0) projectedMaintenance = loggedMaintenance;

    // -- Also incorporate any manual global expense entries for this load --
    const loadExpenses = (expenses || []).filter(e => e.loadId === load.id);
    const sumCat = (match: string) => loadExpenses.filter(e => e.category.toLowerCase().includes(match)).reduce((s, e) => s + e.amount, 0);

    const manFuel = sumCat('fuel');
    if (manFuel > 0 && loggedFuel === 0) projectedFuelCost = manFuel;

    const manDef = sumCat('def');
    if (manDef > 0 && loggedDef === 0) projectedDefCost = manDef;

    const manPayroll = sumCat('payroll');
    if (manPayroll > 0) projectedPayroll = manPayroll;

    const manMaint = sumCat('maint');
    if (manMaint > 0 && loggedMaintenance === 0) projectedMaintenance = manMaint;

    const manOverhead = sumCat('recurring') || sumCat('overhead');
    const manToll = sumCat('toll');
    const manOther = loadExpenses.filter(e => !['fuel','def','payroll','maint','recurring','overhead','toll'].some(c => e.category.toLowerCase().includes(c))).reduce((s, e) => s + e.amount, 0);

    if (manOverhead > 0) projectedTotalRecurring = manOverhead;
    projectedTotalRecurring += manToll + manOther;

    const totalProjectedExpenses =
      projectedPayroll +
      projectedFuelCost +
      projectedDefCost +
      projectedMaintenance +
      projectedTotalRecurring +
      loggedTollsAndScales;

    projectedProfit = load.totalAgreedRate - totalProjectedExpenses;
  }


  return (
    <Card className="shadow-md hover:shadow-lg transition-shadow duration-300 flex flex-col">
      <CardHeader className="pt-5 pb-3">
        <div className="flex justify-between items-start mb-3 gap-3">
          <CardTitle className="text-[15px] font-headline flex flex-col gap-2 min-w-0 flex-1">
            <div className="flex items-start break-words leading-snug">
              <span className="mr-2 mt-[2px] flex-shrink-0 text-[11px]">🟢</span>
              <span title={`Origin: ${formatAddress(load.origin)}`}>
                <span className="text-slate-500 font-bold">Origin:</span> {formatAddress(load.origin)}
              </span>
            </div>
            <div className="flex items-start break-words leading-snug">
              <span className="mr-2 mt-[2px] flex-shrink-0 text-[11px]">🔴</span>
              <span title={`Destination: ${formatAddress(load.destination)}`}>
                <span className="text-slate-500 font-bold">Destination:</span> {formatAddress(load.destination)}
              </span>
            </div>
          </CardTitle>

          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            {load.loadNumber && (
              <Badge variant="secondary" className="text-xs flex items-center">
                <Hash className="h-3 w-3 mr-1" />
                {load.loadNumber}
              </Badge>
            )}
            {load.tripId && (
              <Badge variant="outline" className="text-xs flex items-center bg-blue-50 border-blue-200 text-blue-700">
                <Map className="h-3 w-3 mr-1" />
                {trips?.find(t => t.id === load.tripId)?.tripNumber ?? `TRIP #${load.tripId.substring(0, 7)}`}
              </Badge>
            )}
            {isLtlLoad && (
              <Badge variant="outline" className="text-xs flex items-center bg-purple-50 border-purple-200 text-purple-700 font-bold">
                LTL ({deckPercentageUsed}% Deck)
              </Badge>
            )}
            {load.bolSource === 'system' ? (
              <Badge variant="outline" className="text-xs flex items-center bg-indigo-50 border-indigo-200 text-indigo-700 font-semibold" title="System Generated Digital BOL (Sign-on-Glass)">
                ⚡ Digital BOL
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs flex items-center bg-slate-50 border-slate-200 text-slate-600 font-medium" title="Broker Provided Paper BOL">
                📄 Broker BOL
              </Badge>
            )}
          </div>
        </div>
        <div className="flex justify-between items-center">
            <CardDescription className="text-sm space-y-0.5">
                <div className="flex items-center">
                    <UserCircle className="h-4 w-4 mr-1 text-muted-foreground" /> {clientDisplayInfo}
                </div>
                {client && client.contactPhone && (
                    <div className="flex items-center text-xs text-muted-foreground">
                        <Phone className="h-3 w-3 mr-1" /> {client.contactPhone}
                    </div>
                )}
                {driver && (
                    <div className="flex items-center mt-2 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-md">
                      <div className="flex flex-col text-xs text-slate-700">
                        <span className="font-bold text-blue-700 flex items-center mb-0.5"><UserCircle className="h-3.5 w-3.5 mr-1"/> {driver.name}</span>
                        <div className="flex items-center gap-2 text-slate-500">
                          {truck && <span className="flex items-center"><TruckIcon className="h-3 w-3 mr-0.5"/> {truck.unitNumber}</span>}
                          {trailer && <span className="flex items-center border-l border-slate-300 pl-2">Trailer: {trailer.unitNumber}</span>}
                        </div>
                      </div>
                    </div>
                )}
            </CardDescription>
            {/* ── Unified dispatcher status badge ── */}
            {(() => {
              const activeStatusKey = isTrackingViaTelemetry ? effectiveStatus : (load.status || normalizedStatus);
              const unified = getDispatcherStatusLabel(activeStatusKey, load);
              const base = statusConfig[activeStatusKey] ?? statusConfig.pending;
              return (
                <div className="flex flex-col items-end gap-1">
                  <Badge variant="outline" className={`${unified.color} border-none flex items-center shadow-xs font-semibold`}>
                    {base.icon} {unified.label}
                  </Badge>
                  {isTrackingViaTelemetry && (
                    <span className="text-[10px] text-indigo-600 font-bold flex items-center gap-1 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">
                      <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse" />
                      Live GPS Telemetry
                    </span>
                  )}
                </div>
              );
            })()}
        </div>

        {/* ── Driver Status & Alert Panel ── visible to dispatcher ── */}
        {driver && (load.driverExceptionFlag || load.driverNote) && (
          <div className="mt-3 rounded-xl overflow-hidden border border-slate-200 text-xs">
            {/* Exception alert row */}
            {load.driverExceptionFlag && (
              <div className="bg-red-50 border-b border-red-100 px-3 py-2 flex items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-red-600 flex-shrink-0" />
                <span className="font-bold text-red-700 uppercase tracking-wide">
                  ⚠ {load.driverExceptionFlag}
                </span>
              </div>
            )}
            {/* Driver note row */}
            {load.driverNote && (
              <div className={`px-3 py-2 flex items-start gap-2 ${load.driverExceptionFlag ? 'bg-red-50/50' : 'bg-blue-50/50'}`}>
                <MessageSquare className={`h-3.5 w-3.5 mt-0.5 flex-shrink-0 ${load.driverExceptionFlag ? 'text-red-500' : 'text-blue-500'}`} />
                <div className="min-w-0">
                  <p className={`font-semibold leading-snug ${load.driverExceptionFlag ? 'text-red-700' : 'text-blue-700'}`}>
                    &ldquo;{load.driverNote}&rdquo;
                  </p>
                  {load.driverNoteUpdatedAt && (
                    <p className="text-slate-400 mt-0.5">
                      {formatDate(new Date(load.driverNoteUpdatedAt), 'MMM d, h:mm a')}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        {/* ── Facility Arrival & Detention Active Banner ── (Hidden if GPS indicates driver is > 1 mile away) */}
        {showDetentionBanner && (
          <div className="mt-3 rounded-lg border border-teal-200 bg-teal-50/90 p-2.5 flex items-center justify-between text-xs text-teal-900 shadow-xs">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-teal-500 animate-ping shrink-0" />
              <MapPin className="h-4 w-4 text-teal-700 shrink-0" />
              <div>
                <span className="font-bold text-teal-800">Stationary at Facility • Detention Clock Active</span>
                {load.arrivedAt && (
                  <span className="block text-[11px] text-teal-700">
                    Arrival Logged: <strong>{formatDateTimeDisplay(load.arrivedAt)}</strong>
                  </span>
                )}
              </div>
            </div>
            {(load.status === 'arrived' || (load as any).status === 'Arrived') && (
              <Badge className="bg-teal-700 text-white hover:bg-teal-800 font-semibold text-[10px] shrink-0">
                Detention Active
              </Badge>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-3 text-sm flex-grow">
        {/* ── HOS Transit-Time Validation ─────────────────────────────────── */}
        <HOSWarningBanner
          hosResult={hosResult}
          onUpdateDelivery={
            onUpdateDelivery && load.id
              ? (dt) => onUpdateDelivery(load.id!, dt)
              : undefined
          }
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
            <div className="flex items-center text-muted-foreground">
              <CalendarClock className="h-4 w-4 mr-2" />
              Pickup: {formatDateTimeDisplay(load.pickupDateTime)}
            </div>
            {load.origin?.contactName && (
              <div className="flex items-center text-muted-foreground">
                <UserCircle className="h-4 w-4 mr-2" />
                Origin Contact: {load.origin.contactName} {load.origin.contactPhone ? `(${load.origin.contactPhone})` : ''}
              </div>
            )}
            <div className="flex items-center text-muted-foreground">
              <CalendarClock className="h-4 w-4 mr-2" />
              Delivery: {formatDateTimeDisplay(load.deliveryDateTime)}
            </div>
            {load.destination?.contactName && (
              <div className="flex items-center text-muted-foreground">
                <UserCircle className="h-4 w-4 mr-2" />
                Dest Contact: {load.destination.contactName} {load.destination.contactPhone ? `(${load.destination.contactPhone})` : ''}
              </div>
            )}
            <div className="flex items-center text-muted-foreground">
              <Milestone className="h-4 w-4 mr-2" />
              Distance: {load.distance} miles
            </div>
            <div className="flex items-center text-muted-foreground">
              <DollarSign className="h-4 w-4 mr-2" />
              Rate/Mile: ${load.ratePerMile.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
             {(load.tarpingFee && load.tarpingFee > 0) && (
              <div className="flex items-center text-muted-foreground">
                <DollarSign className="h-4 w-4 mr-2" />
                Tarping Fee: ${load.tarpingFee.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            )}
            {(hosResult ? hosResult.totalDriveHours : load.estimatedDriveTimeHours) !== undefined && (hosResult ? hosResult.totalDriveHours : load.estimatedDriveTimeHours)! > 0 && (
              <div className="flex items-center text-muted-foreground">
                <Timer className="h-4 w-4 mr-2" />
                Est. Drive: {(hosResult ? hosResult.totalDriveHours : load.estimatedDriveTimeHours)!.toFixed(1)} hours
              </div>
            )}
            <div className="flex items-center font-semibold col-span-full sm:col-span-1">
              <DollarSign className="h-4 w-4 mr-2 text-primary" />
              Total Agreed: ${load.totalAgreedRate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
        </div>

         { (load.cargoDescription || load.cargoLength || load.cargoDimensions || load.cargoWeight || load.requiresTarping !== undefined) && <Separator className="my-2" /> }

        {isOverHeight && (
            <div className="bg-red-50 border-l-4 border-red-500 text-red-800 p-3 rounded mb-3 flex items-start shadow-sm">
              <ShieldX className="h-5 w-5 mr-2 shrink-0 text-red-600 mt-0.5" />
              <div className="text-sm">
                <p className="font-bold text-red-700">CRITICAL SAFETY ALERT</p>
                <p>Total Transport Height <strong>({totalTransportHeight}")</strong> exceeds legal 13'6" limit (162").</p>
                <p className="text-xs mt-1 text-red-600 italic">Load cannot be moved to "In Transit".</p>
              </div>
            </div>
        )}

        <div className="mb-4">
          <ComplianceBadges result={complianceResult} />
        </div>

        {/* ── Cargo Load Slip Grid ──────────────────────────────────────── */}
        {(load.cargoLength || load.cargoWidth || load.cargoHeight || load.cargoWeightNum || load.cargoQuantity) && (() => {
          const qty        = Math.max(1, load.cargoQuantity || 1);
          const unitWt     = load.cargoWeightNum || 0;
          const totalWt    = qty * unitWt;

          const dimParts: string[] = [];
          if (load.cargoLength) dimParts.push(`${load.cargoLength} ft`);
          if (load.cargoWidth)  dimParts.push(`${load.cargoWidth} ft`);
          if (load.cargoHeight) dimParts.push(`${load.cargoHeight <= 20 ? load.cargoHeight : (load.cargoHeight / 12).toFixed(1)} ft H`);
          const dimensionLabel = dimParts.length > 0 ? dimParts.join(' × ') : '—';

          const isWide = (load.cargoWidth || 0) > 8.5;

          return (
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 overflow-hidden mb-2">
              {/* Column headers */}
              <div className="grid grid-cols-4 divide-x divide-slate-200 border-b border-slate-200 bg-slate-100">
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 px-2 py-1.5">QTY</span>
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 px-2 py-1.5">Dimensions (L×W×H)</span>
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 px-2 py-1.5">Unit Wt</span>
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 px-2 py-1.5">Total Weight</span>
              </div>
              {/* Data row */}
              <div className="grid grid-cols-4 divide-x divide-slate-200">
                {/* QTY */}
                <div className="px-2 py-2 flex items-center">
                  <span className="text-sm font-bold text-slate-800">{qty}</span>
                </div>
                {/* Dimensions */}
                <div className="px-2 py-2 flex items-center">
                  <span className={`text-sm font-medium leading-tight ${isWide ? 'text-orange-600 font-bold' : 'text-slate-700'}`}>
                    {dimensionLabel}
                    {isWide && (
                      <span className="ml-1 text-[9px] font-bold bg-orange-100 text-orange-700 border border-orange-300 rounded px-1 py-0.5 align-middle">WIDE</span>
                    )}
                  </span>
                </div>
                {/* Unit Weight */}
                <div className="px-2 py-2 flex items-center">
                  <span className="text-sm font-medium text-slate-700">
                    {unitWt > 0 ? `${unitWt.toLocaleString()} lbs` : '—'}
                  </span>
                </div>
                {/* Total Weight — qty × unit wt, matches payload math in DriverAvailability */}
                <div className="px-2 py-2 flex items-center">
                  <span className={`text-sm font-bold ${totalWt > 0 ? 'text-slate-900' : 'text-slate-400'}`}>
                    {totalWt > 0 ? `${totalWt.toLocaleString()} lbs` : '—'}
                  </span>
                </div>
              </div>
            </div>
          );
        })()}
        {load.placementMode && load.placementMode !== 'standard' && (
            <div className="mb-2">
               <Badge className="bg-indigo-100 text-indigo-800 border-indigo-200">Placement: {load.placementMode} {load.linkedLoadId ? '(Linked)' : ''}</Badge>
            </div>
        )}

        {load.cargoDescription && (
            <div>
                <h4 className="font-medium text-xs text-muted-foreground flex items-center"><Box className="h-3 w-3 mr-1.5"/>Cargo Description:</h4>
                <p className="text-xs ml-4">{load.cargoDescription}</p>
            </div>
        )}
        {load.cargoDimensions && (
            <div>
                <h4 className="font-medium text-xs text-muted-foreground flex items-center"><Ruler className="h-3 w-3 mr-1.5"/>Cargo Dimensions:</h4>
                <p className="text-xs ml-4">{load.cargoDimensions}</p>
            </div>
        )}
        {load.cargoWeight && (
            <div>
                <h4 className="font-medium text-xs text-muted-foreground flex items-center"><Weight className="h-3 w-3 mr-1.5"/>Cargo Weight:</h4>
                <p className="text-xs ml-4">{load.cargoWeight}</p>
            </div>
        )}
        {load.requiresTarping !== undefined && (
             <div>
                <h4 className="font-medium text-xs text-muted-foreground flex items-center">
                  {load.requiresTarping ? <ShieldCheck className="h-3 w-3 mr-1.5 text-green-600"/> : <ShieldX className="h-3 w-3 mr-1.5 text-red-600"/>}
                  Tarping Required:
                </h4>
                <p className="text-xs ml-4">{load.requiresTarping ? 'Yes' : 'No'}</p>
            </div>
        )}

        {load.status !== 'delivered' && (
          <>
            <Separator className="my-3" />
            {!isFinancialProfileComplete ? (
              <div className="relative overflow-hidden rounded-md border border-amber-200/80 bg-gradient-to-br from-amber-50/70 via-slate-50/60 to-amber-50/40 p-3.5 backdrop-blur-[2px] space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div className="p-1.5 rounded-md bg-amber-100 text-amber-800 shrink-0">
                      <Lock className="h-3.5 w-3.5" />
                    </div>
                    <span className="font-semibold text-xs text-amber-950 truncate">Projected Financials Locked</span>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setIsFleetFinancialModalOpen(true)}
                    className="h-6 text-[10px] px-2 bg-white hover:bg-amber-100 text-amber-900 border-amber-300 font-semibold shadow-xs"
                  >
                    Setup Fleet
                  </Button>
                </div>
                <div className="p-2 bg-white/80 rounded border border-amber-100 text-center">
                  <p className="text-xs font-semibold text-slate-800">
                    Complete Fleet Financial Setup to unlock rate projections.
                  </p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Rate calculations and projected financials are bound to your verified baseline operating costs. Default placeholder math is disabled.
                  </p>
                </div>
              </div>
            ) : projectedProfit !== null ? (
              <div className="p-3 bg-blue-500/10 rounded-md space-y-2">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <h4 className="font-semibold text-sm flex items-center">
                    <Info className="h-4 w-4 mr-1.5 text-blue-700" /> Projected Financials:
                  </h4>
                  {deckFootprintPercentage < 100 ? (
                    <Badge variant="outline" className={`text-[10px] ${isLtlLoad ? 'bg-purple-100 text-purple-800 border-purple-200 font-bold' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
                      {isLtlLoad ? `LTL Partial (${deckFootprintPercentage}% Share)` : `Partial Load (${deckFootprintPercentage}% Share)`}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] bg-slate-100 text-slate-700 border-slate-300">
                      Full Load (100% Share)
                    </Badge>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <span>Est. Payroll:</span> <span className="text-right">${projectedPayroll.toFixed(2)}</span>
                    <span className="flex items-center gap-1">
                      <span>Est. Fuel:</span>
                      {loggedFuel > 0 && (
                        <span className="text-[9px] font-bold bg-amber-100 text-amber-800 px-1 rounded border border-amber-300">
                          Actual Logged
                        </span>
                      )}
                    </span>
                    <span className="text-right font-medium">${projectedFuelCost.toFixed(2)}</span>

                    <span className="flex items-center gap-1">
                      <span>Est. DEF:</span>
                      {loggedDef > 0 && (
                        <span className="text-[9px] font-bold bg-amber-100 text-amber-800 px-1 rounded border border-amber-300">
                          Actual Logged
                        </span>
                      )}
                    </span>
                    <span className="text-right font-medium">${projectedDefCost.toFixed(2)}</span>

                    <span className="flex items-center gap-1">
                      <span>Est. Maintenance:</span>
                      {loggedMaintenance > 0 && (
                        <span className="text-[9px] font-bold bg-amber-100 text-amber-800 px-1 rounded border border-amber-300">
                          Actual Logged
                        </span>
                      )}
                    </span>
                    <span className="text-right font-medium">${projectedMaintenance.toFixed(2)}</span>

                    <span>Est. Overhead Alloc:</span> <span className="text-right font-medium">${projectedTotalRecurring.toFixed(2)}</span>

                    {loggedTollsAndScales > 0 && (
                      <>
                        <span className="text-amber-900 font-semibold">Tolls & Scales (Actual):</span>
                        <span className="text-right font-semibold text-amber-900">${loggedTollsAndScales.toFixed(2)}</span>
                      </>
                    )}

                    {load.assignedTruckId && calculateVehicleCPM && calculateVehicleCPM(load.assignedTruckId) > 0 && (
                      <>
                        <span className="text-slate-400 italic">Truck CPM (ref):</span>
                        <span className="text-right text-slate-400 italic">${calculateVehicleCPM(load.assignedTruckId).toFixed(2)}/mi avg</span>
                      </>
                    )}
                </div>
                <Separator className="my-1" />
                <div className="flex justify-between items-center font-semibold text-sm">
                  <span>Projected Profit (Post-Payroll):</span>
                  <span className={`flex items-center font-bold ${projectedProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {projectedProfit >= 0 ? <TrendingUp className="h-4 w-4 mr-1" /> : <TrendingDown className="h-4 w-4 mr-1" />}
                    ${projectedProfit.toFixed(2)}
                  </span>
                </div>

                {/* In-Transit Expense Ledger Breakdown (for active loads) */}
                {actualExpensesList.length > 0 && (
                  <div className="pt-2 border-t border-blue-200/60 mt-2">
                    <button
                      type="button"
                      onClick={() => setIsExpenseLedgerOpen(prev => !prev)}
                      className="w-full flex items-center justify-between text-xs font-bold text-blue-900 hover:text-blue-950 py-1"
                    >
                      <span className="flex items-center gap-1.5">
                        <Receipt className="w-3.5 h-3.5 text-amber-600" />
                        In-Transit Receipts Logged ({actualExpensesList.length} item{actualExpensesList.length !== 1 ? 's' : ''} • ${totalLoggedExpenses.toFixed(2)})
                      </span>
                      {isExpenseLedgerOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                    {isExpenseLedgerOpen && (
                      <div className="mt-2 space-y-1.5 bg-white/90 rounded-lg p-2.5 border border-blue-200 max-h-48 overflow-y-auto">
                        {actualExpensesList.map((exp, idx) => (
                          <div key={exp.id || idx} className="flex items-center justify-between text-xs py-1.5 border-b border-slate-100 last:border-0">
                            <div className="min-w-0 pr-2">
                              <div className="font-bold text-slate-800 flex items-center gap-1">
                                <span>{exp.category}</span>
                                {exp.gallonsPurchased ? (
                                  <span className="text-[10px] text-amber-700 bg-amber-100 font-semibold px-1 rounded">
                                    {exp.gallonsPurchased} gal
                                  </span>
                                ) : null}
                              </div>
                              {exp.notes && (
                                <div className="text-[10px] text-slate-500 truncate">{exp.notes}</div>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="font-bold text-slate-900">${exp.amount.toFixed(2)}</span>
                              {exp.receiptUrl && (
                                <a
                                  href={exp.receiptUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold text-blue-700 hover:text-blue-900 bg-blue-50 border border-blue-200 rounded transition-colors"
                                  title="View Uploaded Receipt"
                                >
                                  <Receipt className="w-3 h-3 text-blue-600" /> Receipt <ExternalLink className="w-2.5 h-2.5" />
                                </a>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Proof of Delivery / Signed BOL Status in Projected Financials */}
                <div className="flex items-center justify-between text-xs pt-2 border-t border-blue-200/60 mt-2">
                  <span className="font-semibold text-slate-700">Signed BOL / POD:</span>
                  {load.signedBolUrl ? (
                    <a
                      href={load.signedBolUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center text-xs font-semibold text-purple-700 hover:text-purple-900 bg-purple-50 px-2 py-0.5 rounded border border-purple-200 transition-colors"
                      title="View & Download Signed Bill of Lading"
                    >
                      <FileCheck className="h-3.5 w-3.5 mr-1 text-purple-600" /> View Signed BOL <ExternalLink className="h-3 w-3 ml-1" />
                    </a>
                  ) : (
                    <span className="text-amber-700 italic text-[11px] font-medium">Pending Driver Upload</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground italic mt-1">Estimates based on current settings. Overhead allocated as daily prorated share × {tripCalendarDays} calendar day{tripCalendarDays !== 1 ? 's' : ''}{isLtlLoad ? ` (${deckPercentageUsed}% LTL share)` : ''}.</p>
                <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">⚠️ <strong>Projected values only.</strong> HOS compliance must be verified on the driver's certified ELD. PayloadLogic is not an ELD.</p>
              </div>
            ) : null}
          </>
        )}


        {load.status === 'delivered' && (load.expenses?.calculated || actualExpensesList.length > 0) && (

          <>
            <Separator className="my-3" />
            <div className="p-3 bg-muted/50 rounded-md space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-sm">Actual Expense Breakdown:</h4>
                {actualExpensesList.length > 0 && (
                  <Badge variant="outline" className="bg-amber-100 text-amber-900 border-amber-300 text-[10px] font-bold">
                    Sub-Collection Synced
                  </Badge>
                )}
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <span>Payroll:</span> <span className="text-right">${actualPayrollDelivered.toFixed(2)}</span>
                <span>Recurring:</span> <span className="text-right">${actualRecurringDelivered.toFixed(2)}</span>
                <span className="flex items-center gap-1">
                  <span>Fuel:</span>
                  {loggedFuel > 0 && (
                    <span className="text-[9px] font-bold bg-amber-100 text-amber-800 px-1 rounded border border-amber-300">
                      Actual Logged
                    </span>
                  )}
                </span>
                <span className="text-right font-medium">${actualFuelDelivered.toFixed(2)}</span>

                <span className="flex items-center gap-1">
                  <span>DEF:</span>
                  {loggedDef > 0 && (
                    <span className="text-[9px] font-bold bg-amber-100 text-amber-800 px-1 rounded border border-amber-300">
                      Actual Logged
                    </span>
                  )}
                </span>
                <span className="text-right font-medium">${actualDefDelivered.toFixed(2)}</span>

                {(actualMaintenanceDelivered > 0) && (
                  <>
                    <span className="flex items-center gap-1">
                      <span>Maintenance:</span>
                      {loggedMaintenance > 0 && (
                        <span className="text-[9px] font-bold bg-amber-100 text-amber-800 px-1 rounded border border-amber-300">
                          Actual Logged
                        </span>
                      )}
                    </span>
                    <span className="text-right font-medium">${actualMaintenanceDelivered.toFixed(2)}</span>
                  </>
                )}

                {actualTollsScalesDelivered > 0 && (
                  <>
                    <span className="text-amber-900 font-semibold">Tolls & Scales:</span>
                    <span className="text-right font-semibold text-amber-900">${actualTollsScalesDelivered.toFixed(2)}</span>
                  </>
                )}
              </div>

              <Separator className="my-1" />
              <div className="flex justify-between items-center font-semibold text-sm">
                <span>Actual Profit (Post-Payroll):</span>
                <span className={`font-bold ${actualProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  ${actualProfit.toFixed(2)}
                </span>
              </div>

              {/* In-Transit Expense Ledger Breakdown (for delivered loads) */}
              {actualExpensesList.length > 0 && (
                <div className="pt-2 border-t border-slate-200 mt-2">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-800 mb-1.5">
                    <span className="flex items-center gap-1.5">
                      <Receipt className="w-3.5 h-3.5 text-amber-600" />
                      In-Transit Expense Ledger ({actualExpensesList.length})
                    </span>
                    <span className="text-slate-600 font-extrabold">${totalLoggedExpenses.toFixed(2)}</span>
                  </div>
                  <div className="space-y-1 bg-white/90 rounded-lg p-2 border border-slate-200 max-h-48 overflow-y-auto">
                    {actualExpensesList.map((exp, idx) => (
                      <div key={exp.id || idx} className="flex items-center justify-between text-xs py-1 border-b border-slate-100 last:border-0">
                        <div className="min-w-0 pr-2">
                          <div className="font-bold text-slate-800 flex items-center gap-1">
                            <span>{exp.category}</span>
                            {exp.gallonsPurchased ? (
                              <span className="text-[10px] text-amber-700 bg-amber-100 font-semibold px-1 rounded">
                                {exp.gallonsPurchased} gal
                              </span>
                            ) : null}
                          </div>
                          {exp.notes && (
                            <div className="text-[10px] text-slate-500 truncate">{exp.notes}</div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-bold text-slate-900">${exp.amount.toFixed(2)}</span>
                          {exp.receiptUrl && (
                            <a
                              href={exp.receiptUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold text-blue-700 hover:text-blue-900 bg-blue-50 border border-blue-200 rounded transition-colors"
                              title="View Uploaded Receipt"
                            >
                              <Receipt className="w-3 h-3 text-blue-600" /> View Receipt <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Active Transit Shipping Document (Outbound BOL) */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs pt-2 border-t border-slate-200 mt-2">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-slate-700">Active Transit BOL:</span>
                  {load.outboundBolUrl ? (
                    <Badge variant="outline" className="bg-indigo-50 text-indigo-800 border-indigo-200 text-[10px] font-bold">
                      {load.bolSource === 'system' ? 'Internal Generated' : 'Broker Paperwork'}
                    </Badge>
                  ) : load.bolSource === 'broker' ? (
                    <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-300 text-[10px] font-medium">
                      Broker Document Missing
                    </Badge>
                  ) : (
                    <span className="text-slate-400 italic text-[11px]">Auto-Generated by System</span>
                  )}
                </div>
                {load.outboundBolUrl ? (
                  <a
                    href={load.outboundBolUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center text-xs font-semibold text-indigo-700 hover:text-indigo-900 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200 transition-colors"
                    title="View Outbound Active Shipping Document (Carried by Driver during transit)"
                  >
                    <FileText className="h-3.5 w-3.5 mr-1 text-indigo-600" /> {load.bolSource === 'broker' ? 'View Broker BOL' : 'View Active BOL'} <ExternalLink className="h-3 w-3 ml-1" />
                  </a>
                ) : load.bolSource === 'broker' ? (
                  <span className="text-amber-700 italic text-[11px] font-medium">
                    No Broker BOL attached to this load
                  </span>
                ) : null}
              </div>

              {/* Post-Delivery Paperwork (Signed POD) */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs pt-2 border-t border-slate-200 mt-2">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-slate-700">Signed POD (Proof of Delivery):</span>
                  {load.status === 'delivered' && !load.signedBolUrl && (
                    <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-300 text-[10px] font-bold">
                      Awaiting Paperwork
                    </Badge>
                  )}
                  {load.signedBolUrl && (
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-300 text-[10px] font-bold">
                      Verified for Invoicing
                    </Badge>
                  )}
                </div>
                {load.signedBolUrl ? (
                  <a
                    href={load.signedBolUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center text-xs font-semibold text-purple-700 hover:text-purple-900 bg-purple-50 px-2 py-0.5 rounded border border-purple-200 transition-colors"
                    title="View & Download Receiver Signed Proof of Delivery"
                  >
                    <FileCheck className="h-3.5 w-3.5 mr-1 text-purple-600" /> View Signed POD <ExternalLink className="h-3 w-3 ml-1" />
                  </a>
                ) : (
                  <div className="flex items-center gap-2">
                    <SignedBolUpload 
                      load={load} 
                      className="inline-flex" 
                      label="Upload POD" 
                      compact={true}
                    />
                    <span className="text-amber-700 italic text-[11px] font-medium hidden sm:inline">Pending POD</span>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
        {load.specialTerms && (
            <div>
                <h4 className="font-medium text-xs text-muted-foreground mt-2">Special Terms:</h4>
                <p className="text-xs italic">{load.specialTerms}</p>
            </div>
        )}
      </CardContent>
      <CardFooter className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t mt-auto">
        <div className="flex flex-wrap items-center gap-2">
            {/* ── Workflow Action Buttons ── */}
            {effectiveStatus === 'pending_approval' && (
              <Button
                size="sm"
                onClick={() => onStatusChange(load.id!, 'approved')}
                disabled={isUpdatingStatus}
                className="px-3 h-8 text-xs sm:h-9 sm:text-sm bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-xs transition-colors"
                title="Approve this load and mark ready for dispatch"
              >
                <CheckCircle className="h-3.5 w-3.5 mr-1.5 text-blue-200" /> Approve Load
              </Button>
            )}

            {effectiveStatus === 'approved' && (
              <Button
                size="sm"
                onClick={() => onStatusChange(load.id!, 'dispatched')}
                disabled={isUpdatingStatus || isDotWeightViolation}
                className="px-3 h-8 text-xs sm:h-9 sm:text-sm bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-xs transition-colors"
                title="Dispatch load to assigned driver and trigger alerts"
              >
                <Send className="h-3.5 w-3.5 mr-1.5 text-emerald-200" /> Dispatch to Driver
              </Button>
            )}

            <Button
                variant="outline"
                size="sm"
                onClick={() => onEdit(load)}
                className="px-2 h-8 text-xs sm:px-3 sm:h-9 sm:text-sm"
                disabled={isUpdatingStatus}
            >
                <Pencil className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" /> Edit
            </Button>
            <Button
                variant="destructive"
                size="sm"
                onClick={() => onDelete(load.id!)}
                className="px-2 h-8 text-xs sm:px-3 sm:h-9 sm:text-sm"
                disabled={isUpdatingStatus}
            >
                <Trash2 className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" /> Delete
            </Button>
            {load.status === 'in-transit' && !isTrackingViaTelemetry && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onStatusChange(load.id!, 'arrived')}
                disabled={isUpdatingStatus}
                className="px-2 h-8 text-xs sm:px-3 sm:h-9 sm:text-sm bg-teal-50 hover:bg-teal-100 text-teal-700 border-teal-300 font-semibold transition-colors"
                title="Log arrival and start facility detention clock"
              >
                <MapPin className="h-3.5 w-3.5 mr-1 text-teal-600" /> Mark Arrived
              </Button>
            )}
            <div className="relative inline-flex items-center gap-1.5">
              {isTrackingViaTelemetry && (
                <div 
                  className="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded border border-indigo-200 bg-indigo-50/90 text-indigo-900 shadow-2xs text-[10px] font-semibold"
                  title="Live GPS Telemetry Active — Manual dispatcher changes take immediate precedence and snap telemetry"
                >
                  <span className="flex h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse shrink-0" />
                  <span>GPS Synced</span>
                </div>
              )}
              <Select
                  value={effectiveStatus || 'pending_approval'}
                  onValueChange={(value) => onStatusChange(load.id!, value as Load['status'])}
                  disabled={isUpdatingStatus}
              >
                  <SelectTrigger className="w-[140px] sm:w-[160px] h-8 text-xs sm:h-9 sm:text-sm shrink-0 font-medium">
                  <SelectValue placeholder="Change status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="pending_approval">Pending Approval</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="dispatched" disabled={isDotWeightViolation}>
                        Dispatched / En Route (Driver is heading to pickup) {isDotWeightViolation && '(Blocked: DOT Weight)'}
                      </SelectItem>
                      <SelectItem value="arrived-origin">Arrived at Origin (Driver is at pickup)</SelectItem>
                      <SelectItem value="loading">Loading (Freight is being loaded)</SelectItem>
                      <SelectItem value="in-transit" disabled={isOverHeight || isDotWeightViolation}>
                        In Transit (Loaded) (Driver on road to destination) {isOverHeight && '(Blocked: Over-Height)'}{isDotWeightViolation && !isOverHeight && '(Blocked: DOT Weight)'}
                      </SelectItem>
                      <SelectItem value="arrived-destination">Arrived at Destination (Driver is at drop-off)</SelectItem>
                      <SelectItem value="unloading">Unloading (Freight being unloaded)</SelectItem>
                      <SelectItem value="delivered">
                        Delivered / Completed (Empty and finished)
                      </SelectItem>
                    </SelectGroup>
                    <SelectSeparator className="my-1" />
                    <SelectGroup>
                      <SelectLabel className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-2 py-1">
                        Operational Exceptions
                      </SelectLabel>
                      <SelectItem value="waiting">Waiting / Detention</SelectItem>
                      <SelectItem value="on-break">On Break</SelectItem>
                      <SelectItem value="idle">Idle / Staging</SelectItem>
                    </SelectGroup>
                  </SelectContent>
              </Select>
            </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
            <Button
                variant="outline"
                size="sm"
                onClick={() => onGenerateAgreement(load)}
                className="px-2 h-8 text-xs sm:px-3 sm:h-9 sm:text-sm"
                disabled={!client || isUpdatingStatus}
            >
                <FileText className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" /> Agreement
            </Button>
            {load.signedBolUrl && (
              <a
                href={load.signedBolUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center px-2 h-8 text-xs sm:px-3 sm:h-9 sm:text-sm bg-purple-50 hover:bg-purple-100 border border-purple-300 text-purple-700 font-semibold rounded-md shadow-xs transition-colors"
                title="View & Download Signed Proof of Delivery (POD)"
              >
                <FileCheck className="h-3.5 w-3.5 mr-1 text-purple-600" /> View Signed POD
              </a>
            )}
            {load.status === 'delivered' && (
              <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onGenerateInvoice(load)}
                  className="px-2 h-8 text-xs sm:px-3 sm:h-9 sm:text-sm bg-emerald-50 hover:bg-emerald-100 border-emerald-200 text-emerald-700"
                  disabled={!client || isUpdatingStatus}
              >
                  <DollarSign className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" /> Invoice
              </Button>
            )}
            {load.status === 'delivered' && onGenerateSettlement && (
              <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onGenerateSettlement(load)}
                  className="px-2 h-8 text-xs sm:px-3 sm:h-9 sm:text-sm bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-700"
                  disabled={isUpdatingStatus}
              >
                  <FileText className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" /> Settlement
              </Button>
            )}
            <Button
                variant="outline"
                size="sm"
                onClick={() => onShareLoadPacket ? onShareLoadPacket(load) : setIsSharePacketOpen(true)}
                className="px-2 h-8 text-xs sm:px-3 sm:h-9 sm:text-sm bg-indigo-50 hover:bg-indigo-100 border-indigo-300 text-indigo-700 font-semibold shadow-xs transition-colors"
                disabled={isUpdatingStatus}
                title="Compile and Email Load Packet (Invoice + Signed BOL) to broker/customer"
            >
                <Share2 className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2 text-indigo-600" /> Share Packet
            </Button>
        </div>
      </CardFooter>
      <ShareLoadPacketModal
        load={load}
        client={client}
        settings={settings}
        driver={driver}
        truck={truck}
        trailer={trailer}
        isOpen={isSharePacketOpen}
        onClose={() => setIsSharePacketOpen(false)}
      />
    </Card>
  );
}

