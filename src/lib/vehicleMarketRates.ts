export type VehicleTransportType = 'open' | 'enclosed';

export type VehicleMarketReference = {
  distanceMiles: number;
  transportType: VehicleTransportType;
  tierLabel: string;
  openPerMileMin: number;
  openPerMileMax: number;
  enclosedPerMileMin: number;
  enclosedPerMileMax: number;
  openTotalMin: number;
  openTotalMax: number;
  enclosedTotalMin: number;
  enclosedTotalMax: number;
  selectedPerMileMin: number;
  selectedPerMileMax: number;
  selectedTotalMin: number;
  selectedTotalMax: number;
};

const VEHICLE_KEYWORDS_REGEX =
  /\b(vehicle|vehicles|car|cars|auto|autos|automobile|sedan|suv|coupe|pickup|jeep|van|minivan|truck|hatchback|crossover|tesla|ford|chevy|chevrolet|toyota|honda|bmw|mercedes|audi|nissan|ram|gmc)\b/i;

/**
 * Returns true if the load's cargo type is explicitly 'vehicle' or its description clearly refers to a vehicle.
 */
export function isVehicleCargo(cargoType?: string, cargoDescription?: string): boolean {
  if (cargoType === 'vehicle') return true;
  if (cargoType === 'general') return false;
  return Boolean(cargoDescription && VEHICLE_KEYWORDS_REGEX.test(cargoDescription));
}

/**
 * Calculates a realistic market reference range for single-vehicle hauls based on loaded distance.
 * Shorter trips carry noticeably higher per-mile rates; 900+ mile hauls taper to $0.70–$1.15/mi (open)
 * and $1.05–$1.70/mi (enclosed). Informational context only.
 */
export function calculateVehicleMarketReference(
  distanceMiles: number,
  transportType: VehicleTransportType = 'open',
): VehicleMarketReference | null {
  if (!distanceMiles || distanceMiles <= 0) return null;

  let tierLabel: string;
  let openPerMileMin: number;
  let openPerMileMax: number;
  let enclosedPerMileMin: number;
  let enclosedPerMileMax: number;

  if (distanceMiles <= 150) {
    tierLabel = 'Short Haul (≤ 150 mi)';
    openPerMileMin = 2.25;
    openPerMileMax = 3.50;
    enclosedPerMileMin = 3.00;
    enclosedPerMileMax = 4.50;
  } else if (distanceMiles <= 400) {
    tierLabel = 'Regional (151–400 mi)';
    openPerMileMin = 1.35;
    openPerMileMax = 2.05;
    enclosedPerMileMin = 1.90;
    enclosedPerMileMax = 2.80;
  } else if (distanceMiles < 900) {
    tierLabel = 'Mid-Haul (401–899 mi)';
    openPerMileMin = 0.95;
    openPerMileMax = 1.45;
    enclosedPerMileMin = 1.40;
    enclosedPerMileMax = 2.10;
  } else {
    tierLabel = 'Long Haul (900+ mi)';
    openPerMileMin = 0.70;
    openPerMileMax = 1.15;
    enclosedPerMileMin = 1.05;
    enclosedPerMileMax = 1.70;
  }

  const openTotalMin = Math.round(distanceMiles * openPerMileMin);
  const openTotalMax = Math.round(distanceMiles * openPerMileMax);
  const enclosedTotalMin = Math.round(distanceMiles * enclosedPerMileMin);
  const enclosedTotalMax = Math.round(distanceMiles * enclosedPerMileMax);

  const isEnclosed = transportType === 'enclosed';

  return {
    distanceMiles,
    transportType,
    tierLabel,
    openPerMileMin,
    openPerMileMax,
    enclosedPerMileMin,
    enclosedPerMileMax,
    openTotalMin,
    openTotalMax,
    enclosedTotalMin,
    enclosedTotalMax,
    selectedPerMileMin: isEnclosed ? enclosedPerMileMin : openPerMileMin,
    selectedPerMileMax: isEnclosed ? enclosedPerMileMax : openPerMileMax,
    selectedTotalMin: isEnclosed ? enclosedTotalMin : openTotalMin,
    selectedTotalMax: isEnclosed ? enclosedTotalMax : openTotalMax,
  };
}
