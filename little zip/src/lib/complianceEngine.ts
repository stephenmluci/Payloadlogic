/**
 * complianceEngine.ts — Pure compliance computation, no React/UI.
 *
 * Two checks:
 *   1. Payload — cargoWeight vs trailerMaxPayload
 *   2. DOT/CDL — paperGcwr triggers Class A; driver cdlStatus determines compliance
 */
import type { Vehicle, DriverProfile } from '@/types';

export type ComplianceStatus = 'compliant' | 'breach' | 'unknown';

export type ComplianceResult = {
  // Trailer Payload
  payloadStatus: ComplianceStatus;
  cargoWeightLbs: number;
  trailerMaxPayload: number;
  payloadExcessLbs: number;
  hasPayloadData: boolean;

  // DOT / CDL
  cdlStatus: ComplianceStatus;
  requiresClassACdl: boolean;
  driverCdlClass: 'Class A CDL' | 'Non-CDL' | 'unassigned';

  // Paper GCWR (CDL gating)
  paperGcwr: number;
  isCdlRequired: boolean;
};

const CDL_GCWR_THRESHOLD    = 26_000; // 49 CFR S 383.91
const CDL_TRAILER_THRESHOLD = 10_000;

export function computeCompliance(
  truck: Vehicle | undefined,
  trailer: Vehicle | undefined,
  driver: DriverProfile | undefined,
  cargoWeightLbs: number,
): ComplianceResult {
  // Paper GCWR
  const truckGvwr   = truck?.gvwr   ?? 0;
  const trailerGvwr = trailer?.gvwr ?? 0;
  const paperGcwr   = truckGvwr + trailerGvwr;
  const isCdlRequired =
    paperGcwr > CDL_GCWR_THRESHOLD && trailerGvwr > CDL_TRAILER_THRESHOLD;

  // Actual operating weight
  const truckTare   = truck?.emptyWeight   ?? 0;
  const trailerTare = trailer?.emptyWeight ?? 0;
  const actualOperatingWeight = truckTare + trailerTare + cargoWeightLbs;

  // Trailer payload check
  const trailerMaxPayload = trailer
    ? (trailer.payloadCapacity ??
       (trailerGvwr > 0 && trailerTare > 0 ? trailerGvwr - trailerTare : 0))
    : 0;
  const hasPayloadData = !!trailer && trailerMaxPayload > 0;
  let payloadStatus: ComplianceStatus = 'unknown';
  let payloadExcessLbs = 0;
  if (hasPayloadData && cargoWeightLbs > 0) {
    if (cargoWeightLbs <= trailerMaxPayload) {
      payloadStatus = 'compliant';
    } else {
      payloadStatus = 'breach';
      payloadExcessLbs = cargoWeightLbs - trailerMaxPayload;
    }
  }

  // DOT / CDL check
  const driverCdlClass: 'Class A CDL' | 'Non-CDL' | 'unassigned' = driver
    ? (driver.cdlStatus ?? 'Non-CDL')
    : 'unassigned';

  let cdlStatus: ComplianceStatus;
  if (paperGcwr === 0) {
    cdlStatus = 'unknown';
  } else if (!isCdlRequired) {
    cdlStatus = 'compliant';
  } else if (driverCdlClass === 'unassigned') {
    cdlStatus = 'unknown';
  } else if (driverCdlClass === 'Class A CDL') {
    cdlStatus = 'compliant';
  } else {
    cdlStatus = 'breach';
  }

  return {
    payloadStatus,
    cargoWeightLbs,
    trailerMaxPayload,
    payloadExcessLbs,
    hasPayloadData,

    cdlStatus,
    requiresClassACdl: isCdlRequired,
    driverCdlClass,

    paperGcwr,
    isCdlRequired,
  };
}

export interface LoadAssignmentCheck {
  cargoWeight: number;       // e.g. 9500 lbs
  deckLengthFeet: number;    // e.g. 40 ft
  trailerMaxPayload: number; // e.g. 12000 lbs
  truckDriveGawr: number;    // e.g. 9750 lbs
  truckRearTareWeight: number; // e.g. 4200 lbs
}

export type AxleOverloadResult = {
  canAssign: boolean;
  severity: 'OK' | 'WARNING' | 'ERROR';
  message?: string;
  warnings?: string[];
};

export function checkAxleOverloadGuard(data: LoadAssignmentCheck): AxleOverloadResult {
  const warnings: string[] = [];
  let isBlocked = false;

  // 1. Check Gross Trailer Capacity
  if (data.cargoWeight > data.trailerMaxPayload) {
    return {
      canAssign: false,
      severity: 'ERROR',
      message: `Over legal trailer payload by ${data.cargoWeight - data.trailerMaxPayload} lbs.`
    };
  }

  // 2. Concentrated Mass Warning (Axle Pinch)
  const concentratedThreshold = data.trailerMaxPayload * 0.60;
  if (data.cargoWeight >= concentratedThreshold) {
    warnings.push(
      `Concentrated Mass Warning: Piece weighs ${data.cargoWeight} lbs (≥60% capacity). Center over or slightly forward of trailer axles.`
    );
  }

  // 3. Drive Axle Pin-Weight Check (Estimated 22% Pin Weight)
  const estimatedPinWeight = data.cargoWeight * 0.22;
  const estimatedRearDriveWeight = data.truckRearTareWeight + estimatedPinWeight;

  if (estimatedRearDriveWeight > data.truckDriveGawr) {
    isBlocked = true;
    warnings.push(
      `Drive Axle Overload: Estimated pin weight (${Math.round(estimatedPinWeight)} lbs) pushes truck drive axle to ~${Math.round(estimatedRearDriveWeight)} lbs (Exceeds ${data.truckDriveGawr} lbs GAWR).`
    );
  }

  return {
    canAssign: !isBlocked,
    severity: isBlocked ? 'ERROR' : warnings.length > 0 ? 'WARNING' : 'OK',
    warnings
  };
}
