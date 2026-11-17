import type { ActualExpense, Load } from '@/types';

export interface LoadFuelSummary {
  /** Original estimated fuel cost before actual receipts replaced it. */
  estimatedFuel: number;
  /** Sum of all actual fuel receipt amounts uploaded for this load. */
  actualFuel: number;
  /** Count of actual fuel receipts uploaded for this load. */
  actualFuelCount: number;
  /** True when at least one actual fuel receipt has replaced the estimate. */
  hasActualFuel: boolean;
  /** Effective fuel cost used in profit calculations (actualFuel when > 0, else estimatedFuel). */
  effectiveFuel: number;
}

/**
 * Computes the fuel cost summary for a load.
 * Actual fuel receipts (summed across all Fuel entries) REPLACE the estimated fuel cost —
 * they are never added on top of the estimate.
 */
export function summarizeLoadFuelExpenses(
  load: Pick<Load, 'actualExpenses' | 'expenses'>,
  fallbackEstimatedFuel = 0,
): LoadFuelSummary {
  const fuelReceipts: ActualExpense[] = (load.actualExpenses || []).filter(
    (e) => (e.category || '').toLowerCase() === 'fuel',
  );
  const actualFuel = parseFloat(
    fuelReceipts.reduce((sum, e) => sum + (Number(e.amount) || 0), 0).toFixed(2),
  );
  const actualFuelCount = fuelReceipts.length;
  const hasActualFuel = actualFuelCount > 0 && actualFuel > 0;

  const storedEstimated = load.expenses?.estimatedFuel;
  const estimatedFuel = parseFloat(
    (
      storedEstimated !== undefined
        ? storedEstimated
        : fallbackEstimatedFuel > 0
          ? fallbackEstimatedFuel
          : !hasActualFuel
            ? (load.expenses?.fuel || 0)
            : 0
    ).toFixed(2),
  );

  const effectiveFuel = hasActualFuel ? actualFuel : estimatedFuel;

  return {
    estimatedFuel,
    actualFuel,
    actualFuelCount,
    hasActualFuel,
    effectiveFuel,
  };
}
