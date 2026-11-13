// logisticsEngine.ts
// PayloadLogic — Centralized trip computation engine.
// Pure functions only — no React, no side effects, no app-type imports.
//
// Key weight field distinctions:
//   Truck.gvwr                    — Door-sticker GVWR; paper/regulatory number, no cap (Class 3–8+)
//   Truck.towingCapacity          — SAE J2807 full pulling capability (e.g., 30,000 lbs)
//   Truck.maxTongueWeightCapacity — Max hitch/gooseneck tongue load the truck can accept
//   Trailer.gvwr                  — Paper structural rating (e.g., 20,000 lbs)
//   Trailer.emptyWeight           — Physical scale weight of trailer empty
//   paperGcwr                     — truck.gvwr + trailer.gvwr (49 CFR § 383.91 sticker math only)
//   CDL gating                    — paperGcwr > 26,000 AND trailer.gvwr > 10,000 (two-rule FMCSA test)

export interface Truck {
  id: string;
  description: string;
  gvwr: number;                    // Paper/sticker GVWR — regulatory number, unrestricted entry (Class 3–8+)

  maxTongueWeightCapacity: number; // Max hitch/gooseneck tongue load the truck can accept
  opCostPerMile: number;           // Vehicle operational cost per mile
  insuranceMo: number;             // Monthly insurance premium
  monthlyPayment: number;          // Monthly vehicle loan/lease payment
  maintFundMo: number;             // Monthly maintenance reserve
}

export interface Trailer {
  id: string;
  description: string;
  gvwr: number;           // Total trailer structural rating (e.g., 20,000 lbs)
  emptyWeight: number;    // Physical weight of the empty trailer (e.g., 9,000 lbs)
  monthlyPayment: number; // Fixed monthly asset cost
  maintFundMo: number;    // Monthly maintenance allocation
  insuranceMo: number;    // $0 if wrapped into truck's primary policy
  deckLength: number;     // Linear feet of deck space (e.g., 40 ft)
  deckWidth: number;      // Total deck width (e.g., 8.5 ft)
}

export interface CargoItem {
  quantity: number;
  length: number; // Single unit length (ft)
  width: number;  // Single unit width (ft)
  height: number; // Single unit height (in)
  weight: number; // Single unit weight (lbs)
  placementMode?: 'standard' | 'stacked' | 'nested';
}

/**
 * Computes linear deck feet consumed by a cargo item on a trailer of given deckWidth,
 * respecting standard (floor), stacked (2-high), and nested / compact placement modes.
 */
export function computeCargoLinearFootprint(
  item: {
    quantity?: number;
    length?: number; // ft
    width?: number;  // ft
    height?: number; // in
    placementMode?: 'standard' | 'stacked' | 'nested';
  },
  deckWidth: number = 8.5,
  safetyBuffer: number = 0.33
): {
  linearFeet: number;
  rows: number;
  unitsPerRow: number;
  tiers: number;
} {
  const quantity = Math.max(1, item.quantity ?? 1);
  const length = Math.max(0, item.length ?? 0);
  const width = Math.max(0, item.width ?? 0);
  const heightInches = item.height ?? 0;
  const mode = item.placementMode || 'standard';

  if (length === 0 || width === 0) {
    return { linearFeet: 0, rows: 0, unitsPerRow: 1, tiers: 1 };
  }

  // Length with longitudinal clearance buffer
  const effLength = length + safetyBuffer;

  if (mode === 'nested') {
    // ── Nested / Compact Mode (e.g. Bundled Pipes, Cylinders, Tubing, Nested Crates) ──
    // In nested cylindrical / bundle geometry, units nest tightly against each other.
    const unitsAcross = Math.max(1, Math.floor(deckWidth / Math.max(0.05, width)));
    
    // Determine maximum safe vertical tiers (standard deck allows ~8ft / 96in height or height / width ratio)
    const unitHeightInches = heightInches > 0 ? heightInches : Math.max(2, width * 12);
    const maxTiers = Math.max(1, Math.min(20, Math.floor(96 / unitHeightInches)));
    
    // Calculate capacity of a single longitudinal stack/bundle:
    let bundleCapacity = 0;
    for (let t = 0; t < maxTiers; t++) {
      const tierUnits = (t % 2 === 1 && unitsAcross > 1) ? unitsAcross - 1 : unitsAcross;
      bundleCapacity += tierUnits;
    }
    bundleCapacity = Math.max(unitsAcross, bundleCapacity);

    // Number of sequential longitudinal blocks required along the trailer deck length
    const longitudinalSections = Math.ceil(quantity / bundleCapacity);
    const linearFeet = parseFloat((longitudinalSections * effLength).toFixed(1));
    const activeTiers = Math.min(maxTiers, Math.ceil(quantity / unitsAcross));

    return {
      linearFeet,
      rows: longitudinalSections,
      unitsPerRow: unitsAcross,
      tiers: activeTiers,
    };
  } else if (mode === 'stacked') {
    // ── Stacked Mode (e.g. Pallets 2-High) ──
    const effWidth = width + safetyBuffer;
    const unitsAcross = Math.max(1, Math.floor(deckWidth / Math.max(0.1, effWidth)));
    
    const unitHeightInches = heightInches > 0 ? heightInches : 48;
    const tiers = unitHeightInches * 2 <= 108 ? 2 : 1;
    const unitsPerLongitudinalRow = unitsAcross * tiers;
    
    const rows = Math.ceil(quantity / unitsPerLongitudinalRow);
    const linearFeet = parseFloat((rows * effLength).toFixed(1));

    return {
      linearFeet,
      rows,
      unitsPerRow: unitsAcross,
      tiers,
    };
  } else {
    // ── Standard Floor Mode (1-High) ──
    const effWidth = width + safetyBuffer;
    const unitsAcross = Math.max(1, Math.floor(deckWidth / Math.max(0.1, effWidth)));
    const rows = Math.ceil(quantity / unitsAcross);
    const linearFeet = parseFloat((rows * effLength).toFixed(1));

    return {
      linearFeet,
      rows,
      unitsPerRow: unitsAcross,
      tiers: 1,
    };
  }
}

export interface TripInputs {
  truck: Truck;
  trailer: Trailer;
  cargo: CargoItem[];
  loadedMiles: number;
  deadheadMiles: number;
  pickupDate: string;   // ISO date string
  deliveryDate: string; // ISO date string
  projectedFuel: number;
  projectedDef: number;
  averageMonthlyMiles: number;           // Denominator for monthly-to-per-mile conversion; defaults to 5,000 if zero
  businessNetProfitTargetPerDay: number; // e.g., 300.00
  driverPayrollTargetPerDay: number;     // e.g., 250.00
  userEnteredRatePerMile?: number;       // Manual override for rate scenario testing
  costShareRatio?: number;               // Proration factor (0 < ratio <= 1) for partial / consolidated loads
}

export interface CalculationResults {
  // ── Capacity & Physical Floor Output ────────────────────────────────────
  maxPayloadCapacity: number;
  totalCargoWeight: number;
  totalLinearFeetConsumed: number;
  remainingDeckSpace: number;
  weightOverload: boolean;

  // ── Regulatory Weight Metrics (Sticker / Paperwork Compliance) ────────────
  paperGcwr: number;           // truck.gvwr + trailer.gvwr (paper sticker sum)
  isCdlRequired: boolean;      // paperGcwr > 26,000 AND trailer.gvwr > 10,000
  complianceMessage: string | null;

  // ── Trip Financial Ledger ─────────────────────────────────────────────────
  trailerOpCostPerMile: number;
  totalOpCostPerMile: number;
  operationalDays: number;
  costShareRatio: number;
  marginTarget: number;
  trueExpenseAccumulation: number;
  grossMinimumRevenueRequired: number;
  suggestedRatePerMile: number;
  estimatedNetProfit: number;
  profitWarning: string | null;
}

/**
 * calculateTripMetrics
 *
 * Pure function — no side effects. Returns a fully-populated CalculationResults
 * object covering:
 *   1. Cargo layout & payload verification (towing capacity check)
 *   2. CDL regulatory compliance (FMCSA 49 CFR § 383.91 two-rule test)
 *   3. Expense accumulation & minimum rate calculation
 */
export function calculateTripMetrics(inputs: TripInputs): CalculationResults {
  const {
    truck,
    trailer,
    cargo,
    loadedMiles,
    deadheadMiles,
    pickupDate,
    deliveryDate,
    projectedFuel,
    projectedDef,
    averageMonthlyMiles,
    businessNetProfitTargetPerDay,
    driverPayrollTargetPerDay,
    userEnteredRatePerMile,
    costShareRatio,
  } = inputs;

  /** 4 inches expressed as linear feet — mandatory gap between cargo units */
  const CARGO_SAFETY_BUFFER = 0.33;
  const totalMiles = loadedMiles + deadheadMiles;

  // Proration factor for consolidated/partial loads (defaults to 1.0 for independent full loads)
  const effectiveCostShare = (costShareRatio !== undefined && costShareRatio > 0 && costShareRatio <= 1)
    ? costShareRatio
    : 1.0;

  // ── 1. Trailer Payload Accounting (Structural Limit) ─────────────────────
  const maxPayloadCapacity = trailer.gvwr - trailer.emptyWeight;

  // ── 2. Spatial Layout & Footprint Capacity Check ─────────────────────────
  let totalLinearFeetConsumed = 0;
  let totalCargoWeight = 0;

  cargo.forEach((item) => {
    const footprint = computeCargoLinearFootprint(item, trailer.deckWidth || 8.5, CARGO_SAFETY_BUFFER);
    totalLinearFeetConsumed += footprint.linearFeet;
    totalCargoWeight        += (item.quantity || 1) * (item.weight || 0);
  });

  const remainingDeckSpace     = Math.max(0, trailer.deckLength - totalLinearFeetConsumed);
  const weightOverload         = totalCargoWeight > maxPayloadCapacity;

  // ── 3. FMCSA Class A CDL Compliance Gatekeeper (Pure Paper / Sticker Math) ──
  // Rule A: trailer.gvwr > 10,000 lbs  AND
  // Rule B: truck.gvwr + trailer.gvwr > 26,000 lbs
  // Compliance uses sticker ratings only — no actual scale weight needed here.
  const paperGcwr = Number(truck.gvwr || 0) + Number(trailer.gvwr || 0);

  const isCdlRequired = paperGcwr > 26_000 && trailer.gvwr > 10_000;

  let complianceMessage: string | null = null;
  if (isCdlRequired) {
    complianceMessage =
      `🛑 REGULATORY COMPLIANCE REQUIRED: Combined sticker weight ratings ` +
      `(${paperGcwr.toLocaleString()} lbs) exceed 26,000 lbs. ` +
      'Class A CDL rules apply for commercial operations.';
  }

  // ── 4. Automated Fixed Asset Cost Conversions ─────────────────────────────
  // 8,500 mi/month is the benchmark fallback for a hotshot operation when no
  // fleet utilization data is set — prevents inflated per-mile overhead on
  // low-mileage months.
  const fleetMilesDenominator = averageMonthlyMiles > 0 ? averageMonthlyMiles : 8_500;
  const totalMonthlyTruckFixed =
    Number(truck.monthlyPayment || 0) +
    Number(truck.insuranceMo    || 0);
  const totalMonthlyTrailerFixed =
    Number(trailer.monthlyPayment || 0) +
    Number(trailer.insuranceMo    || 0);
  const fixedOverheadPerMile = (totalMonthlyTruckFixed + totalMonthlyTrailerFixed) / fleetMilesDenominator;
  const trailerOpCostPerMile = totalMonthlyTrailerFixed / fleetMilesDenominator;
  const totalOpCostPerMile   = Number(truck.opCostPerMile || 0.20) + fixedOverheadPerMile;

  // ── 5. Fractional Operational Day Rounding Logic ──────────────────────────
  // Fractions ≥ 12 hours round up; minimum floor is 1 day
  // Date fallback guards against empty form fields during live preview
  const startMs  = new Date(pickupDate  || Date.now()).getTime();
  const endMs    = new Date(deliveryDate || Date.now()).getTime();
  const deltaDays = (endMs - startMs) / (1000 * 60 * 60 * 24);

  let operationalDays = Math.floor(deltaDays);
  const remainingHours = (deltaDays - operationalDays) * 24;
  if (remainingHours >= 12 || operationalDays === 0) {
    operationalDays += 1;
  }

  // ── 6. Margin & Profit Target Matrix (Prorated for Partial / Consolidated Loads) ──
  const targetBusinessProfit = businessNetProfitTargetPerDay * operationalDays * effectiveCostShare;
  const targetDriverPayroll  = driverPayrollTargetPerDay     * operationalDays * effectiveCostShare;
  const marginTarget         = targetBusinessProfit + targetDriverPayroll;

  const proratedOpCost = totalOpCostPerMile * totalMiles * effectiveCostShare;
  const proratedFuel   = Number(projectedFuel || 0) * effectiveCostShare;
  const proratedDef    = Number(projectedDef  || 0) * effectiveCostShare;

  const trueExpenseAccumulation = proratedOpCost + proratedFuel + proratedDef;

  const grossMinimumRevenueRequired = marginTarget + trueExpenseAccumulation;
  const suggestedRatePerMile =
    loadedMiles > 0 ? grossMinimumRevenueRequired / loadedMiles : (totalMiles > 0 ? grossMinimumRevenueRequired / totalMiles : 0);

  const activeRate      = userEnteredRatePerMile ?? suggestedRatePerMile;
  const currentRevenue  = loadedMiles * activeRate;
  const estimatedNetProfit = currentRevenue - trueExpenseAccumulation - targetDriverPayroll;

  let profitWarning: string | null = null;
  if (estimatedNetProfit < targetBusinessProfit) {
    profitWarning =
      `Warning: Rate does not meet the minimum ` +
      `$${businessNetProfitTargetPerDay.toFixed(2)}/day business profit target. ` +
      `Current Est. Net Profit: $${estimatedNetProfit.toFixed(2)} ` +
      `vs Target: $${targetBusinessProfit.toFixed(2)}`;
  }

  return {
    maxPayloadCapacity,
    totalCargoWeight,
    totalLinearFeetConsumed,
    remainingDeckSpace,
    weightOverload,
    paperGcwr,
    isCdlRequired,
    complianceMessage,
    trailerOpCostPerMile,
    totalOpCostPerMile,
    operationalDays,
    costShareRatio: effectiveCostShare,
    marginTarget,
    trueExpenseAccumulation,
    grossMinimumRevenueRequired,
    suggestedRatePerMile,
    estimatedNetProfit,
    profitWarning,
  };
}

export interface AssignedLoadSlot {
  load_id: string;
  weight_lbs: number;
  length_ft: number;
  deck_start_ft: number;
  deck_end_ft: number;
  zone: 'A' | 'B' | 'C';
}

export interface AvailableSlot {
  position: string;
  length_ft: number;
  max_weight_lbs: number;
}

export interface DeckZoneState {
  trailer_id: string;
  deck_length_ft: number;
  max_payload_lbs: number;
  assigned_loads: AssignedLoadSlot[];
  available_slots: AvailableSlot[];
}

/**
 * calculateTrailerDeckZones
 * Computes deck zones (Zone A: Front, Zone B: Axles, Zone C: Tail) and returns assigned load slots and remaining deck capacity.
 */
export function calculateTrailerDeckZones(
  trailerId: string,
  deckLengthFt: number,
  maxPayloadLbs: number,
  assignedLoads: Array<{ id: string; weight: number; length: number; deckStartFt?: number }>
): DeckZoneState {
  const zoneAWingFt = Math.round(deckLengthFt * 0.45); // Zone A: Front 0 to ~18ft on 40ft
  const zoneBWingFt = Math.round(deckLengthFt * 0.70); // Zone B: Axle group ~18 to ~28ft
  // Zone C: Tail ~28 to 40ft

  let currentStartFt = 0;
  let totalCargoWeight = 0;

  const assigned_loads: AssignedLoadSlot[] = assignedLoads.map((load) => {
    const startFt = load.deckStartFt ?? currentStartFt;
    const endFt = startFt + load.length;
    currentStartFt = endFt;
    totalCargoWeight += load.weight;

    let zone: 'A' | 'B' | 'C' = 'A';
    if (startFt >= zoneAWingFt && endFt <= zoneBWingFt) {
      zone = 'B';
    } else if (startFt >= zoneBWingFt) {
      zone = 'C';
    } else if (startFt < zoneAWingFt && endFt > zoneAWingFt) {
      zone = 'B';
    }

    return {
      load_id: load.id,
      weight_lbs: load.weight,
      length_ft: load.length,
      deck_start_ft: startFt,
      deck_end_ft: endFt,
      zone,
    };
  });

  const availablePayload = Math.max(0, maxPayloadLbs - totalCargoWeight);

  const available_slots: AvailableSlot[] = [];
  
  // Calculate open space in Zone A (Front)
  const zoneAOccupiedEnd = Math.max(0, ...assigned_loads.filter(l => l.deck_start_ft < zoneAWingFt).map(l => l.deck_end_ft));
  const frontOpenFt = Math.max(0, zoneAWingFt - zoneAOccupiedEnd);
  if (frontOpenFt > 0) {
    available_slots.push({
      position: 'Front (Zone A)',
      length_ft: frontOpenFt,
      max_weight_lbs: Math.min(availablePayload, Math.round(maxPayloadLbs * 0.35)),
    });
  }

  // Calculate open space in Zone C (Tail)
  const zoneCOccupiedStart = Math.min(deckLengthFt, ...assigned_loads.filter(l => l.deck_end_ft > zoneBWingFt).map(l => l.deck_start_ft));
  const tailOpenFt = Math.max(0, deckLengthFt - Math.max(zoneBWingFt, zoneAOccupiedEnd));
  if (tailOpenFt > 0) {
    available_slots.push({
      position: 'Tail (Zone C)',
      length_ft: tailOpenFt,
      max_weight_lbs: Math.min(availablePayload, Math.round(maxPayloadLbs * 0.20)),
    });
  }

  return {
    trailer_id: trailerId,
    deck_length_ft: deckLengthFt,
    max_payload_lbs: maxPayloadLbs,
    assigned_loads,
    available_slots,
  };
}
