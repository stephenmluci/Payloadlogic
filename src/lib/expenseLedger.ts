import type { DriverProfile, Expense, Load, Settings, Vehicle } from '@/types';

export interface UnifiedExpenseItem {
  id: string;
  driverName: string;
  driverId?: string;
  category: string;
  amount: number;
  notes?: string;
  date: string;
  receiptUrl?: string;
  loadId?: string | null;
  loadNumber?: string;
  gallonsPurchased?: number;
  source: 'driver_actual' | 'manual_ledger' | 'auto_estimated';
}

export interface BuildUnifiedExpensesInput {
  loads: Load[];
  expenses: Expense[];
  vehicles: Vehicle[];
  settings: Settings;
  driverProfiles: DriverProfile[];
  subcollExpenses?: any[];
  downtimeExpenses?: any[];
}

/**
 * Builds the unified expense ledger combining driver actual receipts,
 * manual ledger entries, auto-estimated fuel & driver payroll per load,
 * and the current month's fleet maintenance reserve.
 */
export function buildUnifiedExpenses({
  loads,
  expenses,
  vehicles,
  settings,
  driverProfiles,
  subcollExpenses = [],
  downtimeExpenses = [],
}: BuildUnifiedExpensesInput): UnifiedExpenseItem[] {
  const map = new Map<string, UnifiedExpenseItem>();

  // 1. In-transit driver actual expenses attached to loads
  loads.forEach((load) => {
    (load.actualExpenses || []).forEach((exp, idx) => {
      const id = exp.id || `load-${load.id}-exp-${idx}`;
      let driverName = exp.submittedByDriverName;
      if (!driverName && exp.driverId) {
        const found = driverProfiles.find((d) => d.uid === exp.driverId);
        if (found) driverName = found.name;
      }

      map.set(id, {
        id,
        driverName: driverName || 'Driver',
        driverId: exp.driverId,
        category: exp.category,
        amount: Number(exp.amount) || 0,
        notes: exp.notes,
        date: exp.createdAt || exp.receiptUploadedAt || new Date().toISOString(),
        receiptUrl: exp.receiptUrl,
        loadId: load.id,
        loadNumber: load.loadNumber,
        gallonsPurchased: exp.gallonsPurchased,
        source: 'driver_actual',
      });
    });
  });

  // 2. Sub-collection actual expenses (if any were not denormalized to load doc)
  subcollExpenses.forEach((exp) => {
    if (!map.has(exp.id)) {
      let driverName = exp.submittedByDriverName;
      if (!driverName && exp.driverId) {
        const found = driverProfiles.find((d) => d.uid === exp.driverId);
        if (found) driverName = found.name;
      }
      map.set(exp.id, {
        id: exp.id,
        driverName: driverName || 'Driver',
        driverId: exp.driverId,
        category: exp.category || 'Other',
        amount: Number(exp.amount) || 0,
        notes: exp.notes,
        date: exp.createdAt || exp.receiptUploadedAt || new Date().toISOString(),
        receiptUrl: exp.receiptUrl,
        loadId: exp.loadId,
        gallonsPurchased: exp.gallonsPurchased,
        source: 'driver_actual',
      });
    }
  });

  // 3. Downtime actual expenses (non-load expenses logged at users/{uid}/actualExpenses)
  downtimeExpenses.forEach((exp) => {
    if (!map.has(exp.id)) {
      let driverName = exp.submittedByDriverName;
      if (!driverName && exp.driverId) {
        const found = driverProfiles.find((d) => d.uid === exp.driverId);
        if (found) driverName = found.name;
      }
      map.set(exp.id, {
        id: exp.id,
        driverName: driverName || 'Driver',
        driverId: exp.driverId,
        category: exp.category || 'Other',
        amount: Number(exp.amount) || 0,
        notes: exp.notes,
        date: exp.createdAt || exp.receiptUploadedAt || new Date().toISOString(),
        receiptUrl: exp.receiptUrl,
        loadId: null,
        gallonsPurchased: exp.gallonsPurchased,
        source: 'driver_actual',
      });
    }
  });

  // 4. Traditional manual accounting expenses
  expenses.forEach((exp) => {
    const expId = exp.id || `manual-${exp.date}-${exp.amount}`;
    if (!map.has(expId)) {
      map.set(expId, {
        id: expId,
        driverName: 'Fleet Admin',
        category: exp.category,
        amount: Number(exp.amount) || 0,
        date: exp.date,
        notes: exp.notes,
        loadId: exp.loadId,
        source: 'manual_ledger',
      });
    }
  });

  // 5. Auto-generated Fuel & Driver Payroll entries from loads (when not already logged)
  const existingList = Array.from(map.values());
  loads.forEach((load) => {
    const loadKey = load.id || load.loadNumber || '';
    if (!loadKey) return;
    const loadDate = load.deliveryDateTime || load.pickupDateTime || new Date().toISOString();
    const miles = (load.distance || 0) + (load.deadheadMiles || 0);

    // 5a. Estimated Fuel
    const hasLoggedFuel = existingList.some(
      (e) => e.loadId === load.id && e.category?.toLowerCase().includes('fuel')
    );
    if (!hasLoggedFuel) {
      const truck = load.assignedTruckId
        ? vehicles.find((v) => v.id === load.assignedTruckId)
        : undefined;
      const mpg =
        truck?.mpg && truck.mpg > 0
          ? truck.mpg
          : settings.truckMpg && settings.truckMpg > 0
            ? settings.truckMpg
            : 10;
      const fuelPrice =
        settings.defaultFuelCostPerGallon && settings.defaultFuelCostPerGallon > 0
          ? settings.defaultFuelCostPerGallon
          : 4.0;
      const fuelAmt =
        load.expenses?.fuel && load.expenses.fuel > 0
          ? load.expenses.fuel
          : miles > 0
            ? parseFloat(((miles / mpg) * fuelPrice).toFixed(2))
            : 0;

      if (fuelAmt > 0) {
        const fuelId = `auto-fuel-${loadKey}`;
        map.set(fuelId, {
          id: fuelId,
          driverName: load.assignedDriverName || 'Auto-Estimated',
          category: 'Fuel',
          amount: Number(fuelAmt.toFixed(2)),
          date: loadDate,
          notes: `Estimated fuel (${miles} mi @ ${mpg} MPG, $${fuelPrice.toFixed(2)}/gal)`,
          loadId: load.id,
          loadNumber: load.loadNumber,
          source: 'auto_estimated',
        });
      }
    }

    // 5b. Driver Payroll
    const hasLoggedPayroll = existingList.some(
      (e) => e.loadId === load.id && e.category?.toLowerCase().includes('payroll')
    );
    if (!hasLoggedPayroll) {
      const driver = load.assignedDriverId
        ? driverProfiles.find(
            (d) => d.uid === load.assignedDriverId || (d as any).id === load.assignedDriverId
          )
        : undefined;
      let payrollAmt =
        load.expenses?.payroll && load.expenses.payroll > 0 ? load.expenses.payroll : 0;
      if (payrollAmt <= 0) {
        if (driver) {
          if (driver.payType === 'per-mile') {
            payrollAmt = miles * (driver.payRate || 0);
          } else if (driver.payType === 'hourly') {
            const estHrs =
              driver.estimatedTripHours ||
              (miles > 0 ? miles / (settings.truckAverageSpeed || 55) : 0);
            payrollAmt = estHrs * (driver.payRate || settings.defaultDriverHourlyRate || 25);
          } else {
            const pct =
              driver.payRate ?? driver.payrollPercentage ?? settings.payrollPercentage ?? 0;
            payrollAmt = (load.totalAgreedRate || 0) * (pct / 100);
          }
        } else if ((load.totalAgreedRate || 0) > 0 && (settings.payrollPercentage || 0) > 0) {
          payrollAmt = (load.totalAgreedRate || 0) * (settings.payrollPercentage / 100);
        }
      }

      if (payrollAmt > 0) {
        const payId = `auto-payroll-${loadKey}`;
        map.set(payId, {
          id: payId,
          driverName: driver?.name || load.assignedDriverName || 'Driver',
          driverId: driver?.uid,
          category: 'Driver Payroll',
          amount: parseFloat(payrollAmt.toFixed(2)),
          date: loadDate,
          notes: `Driver pay for Load #${load.loadNumber || loadKey}`,
          loadId: load.id,
          loadNumber: load.loadNumber,
          source: 'auto_estimated',
        });
      }
    }
  });

  // 6. Monthly Fleet Maintenance Reserve (recurring entry for current month)
  const maintReserve = Number(settings.monthlyMaintenance) || 0;
  if (maintReserve > 0) {
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const maintId = `auto-maint-reserve-${ym}`;
    if (!map.has(maintId)) {
      map.set(maintId, {
        id: maintId,
        driverName: 'Fleet Settings',
        category: 'Maintenance Reserve',
        amount: parseFloat(maintReserve.toFixed(2)),
        date: new Date(now.getFullYear(), now.getMonth(), 1, 12, 0, 0).toISOString(),
        notes: 'Monthly fleet maintenance reserve from System Settings',
        loadId: null,
        source: 'auto_estimated',
      });
    }
  }

  return Array.from(map.values()).sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}
