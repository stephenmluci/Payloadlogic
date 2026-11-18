import type { DriverProfile } from '@/types';

export interface CustomerRateBreakdown {
  loadedMiles: number;
  deadheadMiles: number;
  ratePerMile: number;
  tarpingFee: number;
  loadedCharge: number;
  deadheadCharge: number;
  totalAgreedRate: number;
}

/**
 * Calculates the customer-facing rate breakdown keeping loaded miles and
 * deadhead miles separate, and summing both (plus tarping fee) into totalAgreedRate.
 */
export function calculateCustomerRateBreakdown(params: {
  distance?: number | null;
  deadheadMiles?: number | null;
  ratePerMile?: number | null;
  tarpingFee?: number | null;
}): CustomerRateBreakdown {
  const loadedMiles = Math.max(0, Number(params.distance) || 0);
  const deadheadMiles = Math.max(0, Number(params.deadheadMiles) || 0);
  const ratePerMile = Math.max(0, Number(params.ratePerMile) || 0);
  const tarpingFee = Math.max(0, Number(params.tarpingFee) || 0);

  const loadedCharge = parseFloat((loadedMiles * ratePerMile).toFixed(2));
  const deadheadCharge = parseFloat((deadheadMiles * ratePerMile).toFixed(2));
  const totalAgreedRate = parseFloat((loadedCharge + deadheadCharge + tarpingFee).toFixed(2));

  return {
    loadedMiles,
    deadheadMiles,
    ratePerMile,
    tarpingFee,
    loadedCharge,
    deadheadCharge,
    totalAgreedRate,
  };
}

/**
 * Resolves the driver's most recent GPS coordinates if available.
 * Checks live telemetry first, then profile currentLat/currentLng.
 */
export function getDriverGpsCoords(
  driver?: Partial<DriverProfile> | null,
): { lat: number; lng: number } | null {
  if (!driver) return null;
  const lat = driver.telemetry?.lat ?? driver.currentLat;
  const lng = driver.telemetry?.lng ?? driver.currentLng;
  if (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    (lat !== 0 || lng !== 0)
  ) {
    return { lat, lng };
  }
  return null;
}

/**
 * Estimates road driving miles between two GPS coordinates using Haversine
 * distance with a 1.15 road-circuity factor, rounded to the nearest mile.
 */
export function estimateRoadMilesBetweenCoords(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R_MILES = 3958.8;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const straightMiles = 2 * R_MILES * Math.asin(Math.min(1, Math.sqrt(a)));
  return Math.max(0, Math.round(straightMiles * 1.15));
}
