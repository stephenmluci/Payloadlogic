import type { Address, Load } from '@/types';

export interface LoadValidationSection {
  sectionId: string;
  sectionTitle: string;
  missingFields: string[];
}

export interface LoadValidationResult {
  isValid: boolean;
  missingSections: LoadValidationSection[];
  missingFieldKeys: Set<string>;
  totalMissingCount: number;
}

export interface ValidateLoadOptions {
  isEditMode?: boolean;
  existingTripPicked?: boolean;
}

function isValidDateTimeValue(val?: string | null): boolean {
  if (!val || !val.trim()) return false;
  const parsed = new Date(val);
  return !Number.isNaN(parsed.getTime());
}

function parseLegacyDimensions(dimStr?: string): { length: number; width: number } {
  if (!dimStr || typeof dimStr !== 'string') return { length: 0, width: 0 };
  const matches = dimStr.match(/(\d+(?:\.\d+)?)/g);
  if (!matches || matches.length < 2) return { length: 0, width: 0 };
  return {
    length: parseFloat(matches[0]) || 0,
    width: parseFloat(matches[1]) || 0,
  };
}

function parseLegacyWeight(weightStr?: string): number {
  if (!weightStr || typeof weightStr !== 'string') return 0;
  const cleaned = weightStr.replace(/[^0-9.]/g, '');
  return parseFloat(cleaned) || 0;
}

/**
 * Validates all required fields for creating (or updating) a load.
 */
export function validateLoadForm(
  loadForm: Partial<Load>,
  options: ValidateLoadOptions = {},
): LoadValidationResult {
  const { isEditMode = false, existingTripPicked = false } = options;
  const missingSections: LoadValidationSection[] = [];
  const missingFieldKeys = new Set<string>();

  // 1. Client & Route Locations: Origin & Destination (street, city, state, zip)
  const locationMissing: string[] = [];
  const origin = (loadForm.origin || {}) as Partial<Address>;
  const originSubfields: string[] = [];
  if (!origin.street?.trim()) {
    originSubfields.push('Street');
    missingFieldKeys.add('origin.street');
  }
  if (!origin.city?.trim()) {
    originSubfields.push('City');
    missingFieldKeys.add('origin.city');
  }
  if (!origin.state?.trim()) {
    originSubfields.push('State');
    missingFieldKeys.add('origin.state');
  }
  if (!origin.zip?.trim()) {
    originSubfields.push('ZIP Code');
    missingFieldKeys.add('origin.zip');
  }
  if (originSubfields.length > 0) {
    locationMissing.push(`Origin Address (${originSubfields.join(', ')})`);
  }

  const destination = (loadForm.destination || {}) as Partial<Address>;
  const destSubfields: string[] = [];
  if (!destination.street?.trim()) {
    destSubfields.push('Street');
    missingFieldKeys.add('destination.street');
  }
  if (!destination.city?.trim()) {
    destSubfields.push('City');
    missingFieldKeys.add('destination.city');
  }
  if (!destination.state?.trim()) {
    destSubfields.push('State');
    missingFieldKeys.add('destination.state');
  }
  if (!destination.zip?.trim()) {
    destSubfields.push('ZIP Code');
    missingFieldKeys.add('destination.zip');
  }
  if (destSubfields.length > 0) {
    locationMissing.push(`Destination Address (${destSubfields.join(', ')})`);
  }

  if (locationMissing.length > 0) {
    missingSections.push({
      sectionId: 'section-locations',
      sectionTitle: 'Client & Route Locations',
      missingFields: locationMissing,
    });
  }

  // 2. Trip Schedule & Transit Dates: Pickup & Delivery Date/Time
  const scheduleMissing: string[] = [];
  if (!isValidDateTimeValue(loadForm.pickupDateTime)) {
    scheduleMissing.push('Pickup Date & Time');
    missingFieldKeys.add('pickupDateTime');
  }
  if (!isValidDateTimeValue(loadForm.deliveryDateTime)) {
    scheduleMissing.push('Delivery Date & Time');
    missingFieldKeys.add('deliveryDateTime');
  }
  if (scheduleMissing.length > 0) {
    missingSections.push({
      sectionId: 'section-schedule',
      sectionTitle: 'Trip Schedule & Transit Dates',
      missingFields: scheduleMissing,
    });
  }

  // 3. Freight & Cargo Specifications: Quantity, Unit Weight, Length, Width
  const cargoMissing: string[] = [];
  const legacyDims = isEditMode ? parseLegacyDimensions(loadForm.cargoDimensions) : { length: 0, width: 0 };
  const legacyWeight = isEditMode ? parseLegacyWeight(loadForm.cargoWeight) : 0;

  if (!(Number(loadForm.cargoQuantity) >= 1)) {
    cargoMissing.push('Quantity / Units');
    missingFieldKeys.add('cargoQuantity');
  }
  if (!(Number(loadForm.cargoWeightNum) > 0 || legacyWeight > 0)) {
    cargoMissing.push('Unit Weight (lbs)');
    missingFieldKeys.add('cargoWeightNum');
  }
  if (!(Number(loadForm.cargoLength) > 0 || legacyDims.length > 0)) {
    cargoMissing.push('Length (ft)');
    missingFieldKeys.add('cargoLength');
  }
  if (!(Number(loadForm.cargoWidth) > 0 || legacyDims.width > 0)) {
    cargoMissing.push('Width (ft)');
    missingFieldKeys.add('cargoWidth');
  }
  if (cargoMissing.length > 0) {
    missingSections.push({
      sectionId: 'section-cargo',
      sectionTitle: 'Freight & Cargo Specifications',
      missingFields: cargoMissing,
    });
  }

  // 4. Rate & Pricing: Loaded Miles & Rate per Mile (or Total Agreed Rate)
  const pricingMissing: string[] = [];
  const hasDistance = Number(loadForm.distance) > 0;
  const hasRate =
    Number(loadForm.ratePerMile) > 0 ||
    (isEditMode && Number(loadForm.totalAgreedRate) > 0 && !hasDistance);

  if (!hasDistance) {
    pricingMissing.push('Loaded Miles');
    missingFieldKeys.add('distance');
  }
  if (!hasRate) {
    pricingMissing.push('Rate per Mile ($)');
    missingFieldKeys.add('ratePerMile');
  }
  if (pricingMissing.length > 0) {
    missingSections.push({
      sectionId: 'section-pricing',
      sectionTitle: 'Rate & Pricing',
      missingFields: pricingMissing,
    });
  }

  // 5. Fleet Assignment: if "Add to Existing Trip" radio was selected without picking a trip
  if (existingTripPicked && (!loadForm.tripId || loadForm.tripId === 'none')) {
    missingFieldKeys.add('tripId');
    missingSections.push({
      sectionId: 'section-fleet',
      sectionTitle: 'Fleet Assignment & Consolidation',
      missingFields: ['Open Trip Selection (or switch to Independent Load)'],
    });
  }

  return {
    isValid: missingSections.length === 0,
    missingSections,
    missingFieldKeys,
    totalMissingCount: missingFieldKeys.size,
  };
}

export function formatValidationSummary(result: LoadValidationResult): string {
  if (result.isValid) return '';
  return result.missingSections
    .map((sec) => `${sec.sectionTitle}: ${sec.missingFields.join(', ')}`)
    .join(' • ');
}
