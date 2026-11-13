/**
 * logisticsAdapters.ts
 *
 * Maps the app's Vehicle / Load types to the logisticsEngine interfaces.
 * Keeps the engine 100% pure (no app-type imports) and the Vehicle schema
 * unchanged — adapters fill any missing fields with safe defaults.
 */

import type { Vehicle, Load } from '@/types';
import type {
  Truck    as EngineTruck,
  Trailer  as EngineTrailer,
  CargoItem as EngineCargoItem,
} from './logisticsEngine';

// ── Vehicle → Engine Truck ────────────────────────────────────────────────────
export function vehicleToEngineTruck(
  v: Vehicle,
  _averageMonthlyMiles = 5_000 // reserved — kept for call-site compat
): EngineTruck {
  return {
    id:                      v.id,
    description:             v.name ?? v.unitNumber ?? 'Truck',
    gvwr:                    v.gvwr ?? 0,
    maxTongueWeightCapacity: v.maxTongueWeightCapacity ?? 0,
    opCostPerMile:           v.operatingCostPerMile    ?? 0.20,
    insuranceMo:             v.monthlyRecurringExpenses?.insurance       ?? 0,
    monthlyPayment:          v.monthlyRecurringExpenses?.payment         ?? 0,
    maintFundMo:             v.monthlyRecurringExpenses?.maintenanceFund ?? 0,
  };
}

// ── Vehicle → Engine Trailer ───────────────────────────────────────────────────
export function vehicleToEngineTrailer(v: Vehicle): EngineTrailer {
  return {
    id:           v.id,
    description:  v.name ?? v.unitNumber ?? 'Trailer',
    gvwr:         v.gvwr ?? 20_000,
    emptyWeight:  v.emptyWeight ?? 0,
    monthlyPayment: v.monthlyRecurringExpenses?.payment        ?? 0,
    maintFundMo:    v.monthlyRecurringExpenses?.maintenanceFund ?? 0,
    insuranceMo:    v.monthlyRecurringExpenses?.insurance       ?? 0,
    deckLength:   v.trailerLength ?? 40,
    deckWidth:    v.trailerWidth  ?? 8.5,
  };
}

// ── Load → Engine CargoItem ───────────────────────────────────────────────────
// A single Load maps to a single CargoItem. Pass an array of these when
// multiple loads share a trailer so the engine totals deck space correctly.
export function loadToCargoItem(load: Partial<Load>): EngineCargoItem {
  let weight = load.cargoWeightNum ?? 0;
  if (!weight && load.cargoWeight) {
    const parsed = parseFloat(String(load.cargoWeight).replace(/[^0-9.]/g, ''));
    if (!isNaN(parsed)) weight = parsed;
  }

  let length = load.cargoLength ?? 0;
  let width = load.cargoWidth ?? 0;
  let height = load.cargoHeight ? (load.cargoHeight > 20 ? load.cargoHeight : load.cargoHeight * 12) : 0;

  if ((!length || !width) && load.cargoDimensions) {
    const matches = String(load.cargoDimensions).match(/(\d+(?:\.\d+)?)/g);
    if (matches && matches.length >= 2) {
      if (!length) length = parseFloat(matches[0]);
      if (!width) width = parseFloat(matches[1]);
      if (!height && matches[2]) height = parseFloat(matches[2]) * 12;
    }
  }

  return {
    quantity: load.cargoQuantity ?? 1,
    length,
    width,
    height,
    weight,
    placementMode: load.placementMode ?? 'standard',
  };
}
