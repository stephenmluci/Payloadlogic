import type { Address, Load, LoadStop } from '@/types';

export type DeliveryStopView = {
  /** 1-based stop number shown to dispatcher/driver */
  stopNumber: number;
  /** Stable id (primary destination uses 'primary') */
  id: string;
  address: Address;
  isPrimary: boolean;
  isFinal: boolean;
  cargoDescription?: string;
  cargoQuantity?: number;
  cargoWeight?: number;
  legMiles?: number;
};

export function createEmptyStop(): LoadStop {
  return {
    id: `stop-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    address: { street: '', city: '', state: '', zip: '' },
  };
}

/** Defensive accessor: Firestore sanitizing can turn an undefined array into ''. */
export function getAdditionalStops(load?: Pick<Load, 'additionalStops'> | null): LoadStop[] {
  const stops = load?.additionalStops as unknown;
  return Array.isArray(stops) ? (stops as LoadStop[]) : [];
}

export function isMultiDropLoad(load?: Pick<Load, 'additionalStops'> | null): boolean {
  return getAdditionalStops(load).length > 0;
}

/** Sum of leg miles for the additional stops (primary destination leg excluded). */
export function sumStopLegMiles(stops: LoadStop[] | undefined | null): number {
  if (!Array.isArray(stops)) return 0;
  return stops.reduce((sum, s) => sum + (Number(s.legMiles) > 0 ? Number(s.legMiles) : 0), 0);
}

/** Total loaded miles across every leg: origin→Stop 1 plus each following leg. */
export function computeTotalLoadedMiles(firstLegMiles: number | undefined | null, stops: LoadStop[] | undefined | null): number {
  const first = Number(firstLegMiles) > 0 ? Number(firstLegMiles) : 0;
  return parseFloat((first + sumStopLegMiles(stops)).toFixed(1));
}

/**
 * Ordered delivery stops for a load: the primary destination is Stop 1, followed by
 * additional stops. Single-destination loads return exactly one stop.
 */
export function getLoadDeliveryStops(load: Pick<Load, 'destination' | 'additionalStops' | 'cargoDescription' | 'cargoQuantity'>): DeliveryStopView[] {
  const extra = getAdditionalStops(load);
  const result: DeliveryStopView[] = [];

  if (load.destination) {
    result.push({
      stopNumber: 1,
      id: 'primary',
      address: load.destination,
      isPrimary: true,
      isFinal: extra.length === 0,
    });
  }

  extra.forEach((stop, idx) => {
    result.push({
      stopNumber: result.length + 1,
      id: stop.id,
      address: stop.address,
      isPrimary: false,
      isFinal: idx === extra.length - 1,
      cargoDescription: stop.cargoDescription,
      cargoQuantity: stop.cargoQuantity,
      cargoWeight: stop.cargoWeight,
      legMiles: stop.legMiles,
    });
  });

  return result;
}

/** True when the stop address has enough info (city + state) to route to. */
export function isStopAddressRoutable(address?: Partial<Address> | null): boolean {
  return Boolean(address?.city?.trim() && address?.state?.trim());
}

/** Drops blank stops and normalizes values before saving to Firestore. */
export function cleanStopsForSave(stops: LoadStop[] | undefined | null): LoadStop[] {
  if (!Array.isArray(stops)) return [];
  return stops
    .filter((s) => s && s.address && (s.address.street?.trim() || s.address.city?.trim()))
    .map((s) => ({
      id: s.id,
      address: {
        street: s.address.street || '',
        city: s.address.city || '',
        state: s.address.state || '',
        zip: s.address.zip || '',
        companyName: s.address.companyName || '',
        contactName: s.address.contactName || '',
        contactPhone: s.address.contactPhone || '',
        ...(typeof s.address.lat === 'number' ? { lat: s.address.lat } : {}),
        ...(typeof s.address.lng === 'number' ? { lng: s.address.lng } : {}),
      },
      cargoDescription: s.cargoDescription || '',
      ...(Number(s.cargoQuantity) > 0 ? { cargoQuantity: Number(s.cargoQuantity) } : {}),
      ...(Number(s.cargoWeight) > 0 ? { cargoWeight: Number(s.cargoWeight) } : {}),
      ...(Number(s.legMiles) > 0 ? { legMiles: Number(s.legMiles) } : {}),
    }));
}
