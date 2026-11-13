'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { ExpenseForm } from './ExpenseForm';
import { AdminExpenseDashboard } from './AdminExpenseDashboard';
import { buildUnifiedExpenses, type UnifiedExpenseItem } from '@/lib/expenseLedger';
import { useApp } from '@/context/AppContext';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { PlusCircle, Receipt, RefreshCw, ChevronUp, ChevronDown, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ExpensesPage() {
  const { 
    expenses, 
    loads, 
    vehicles,
    settings, 
    expenseForm, 
    setExpenseForm, 
    addExpense,
    isSubmitting: isSubmittingExpense,
    user,
    driverProfiles
  } = useApp();

  const [downtimeExpenses, setDowntimeExpenses] = useState<any[]>([]);
  const [subcollExpenses, setSubcollExpenses] = useState<any[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);

  // Fetch non-load downtime expenses stored at users/{ownerUid}/actualExpenses
  // and check actualExpenses subcollections if any loads didn't sync arrayUnion
  const fetchDriverActualExpenses = async () => {
    if (!user?.uid) return;
    setIsRefreshing(true);
    try {
      // 1. Fetch downtime expenses: users/{uid}/actualExpenses
      const downtimeRef = collection(db, `users/${user.uid}/actualExpenses`);
      const snap = await getDocs(downtimeRef);
      const fetchedDowntime = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setDowntimeExpenses(fetchedDowntime);

      // 2. Fetch all sub-collection actualExpenses across loads
      const subcollPromises = loads.slice(0, 30).map(async (load) => {
        if (!load.id) return [];
        try {
          const subRef = collection(db, `users/${user.uid}/loads/${load.id}/actualExpenses`);
          const subSnap = await getDocs(subRef);
          return subSnap.docs.map(d => ({ id: d.id, loadId: load.id, ...d.data() }));
        } catch {
          return [];
        }
      });
      const subResults = await Promise.all(subcollPromises);
      setSubcollExpenses(subResults.flat());
    } catch (err) {
      console.warn('Error fetching Firestore actual expenses:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDriverActualExpenses();
  }, [user?.uid, loads.length]);

  const handleExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await addExpense();
    setIsAddFormOpen(false);
    fetchDriverActualExpenses();
  };

  // Build unified list of all expenses ordered by date descending
  const unifiedExpenses: UnifiedExpenseItem[] = useMemo(() => {
    const map = new Map<string, UnifiedExpenseItem>();

    // 1. In-transit driver actual expenses attached to loads
    loads.forEach((load) => {
      (load.actualExpenses || []).forEach((exp, idx) => {
        const id = exp.id || `load-${load.id}-exp-${idx}`;
        let driverName = exp.submittedByDriverName;
        if (!driverName && exp.driverId) {
          const found = driverProfiles.find(d => d.uid === exp.driverId);
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
          const found = driverProfiles.find(d => d.uid === exp.driverId);
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
          const found = driverProfiles.find(d => d.uid === exp.driverId);
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
        const truck = load.assignedTruckId ? vehicles.find((v) => v.id === load.assignedTruckId) : undefined;
        const mpg = (truck?.mpg && truck.mpg > 0)
          ? truck.mpg
          : (settings.truckMpg && settings.truckMpg > 0 ? settings.truckMpg : 10);
        const fuelPrice = (settings.defaultFuelCostPerGallon && settings.defaultFuelCostPerGallon > 0)
          ? settings.defaultFuelCostPerGallon
          : 4.0;
        const fuelAmt = (load.expenses?.fuel && load.expenses.fuel > 0)
          ? load.expenses.fuel
          : (miles > 0 ? parseFloat(((miles / mpg) * fuelPrice).toFixed(2)) : 0);

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
          ? driverProfiles.find((d) => d.uid === load.assignedDriverId || (d as any).id === load.assignedDriverId)
          : undefined;
        let payrollAmt = (load.expenses?.payroll && load.expenses.payroll > 0) ? load.expenses.payroll : 0;
        if (payrollAmt <= 0) {
          if (driver) {
            if (driver.payType === 'per-mile') {
              payrollAmt = miles * (driver.payRate || 0);
            } else if (driver.payType === 'hourly') {
              const estHrs = driver.estimatedTripHours || (miles > 0 ? miles / (settings.truckAverageSpeed || 55) : 0);
              payrollAmt = estHrs * (driver.payRate || settings.defaultDriverHourlyRate || 25);
            } else {
              const pct = driver.payRate ?? driver.payrollPercentage ?? settings.payrollPercentage ?? 0;
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
          notes: 'Monthly Fleet Maintenance Reserve (Recurring)',
          loadId: null,
          source: 'auto_estimated',
        });
      }
    }

    // Sort by date descending
    return Array.from(map.values()).sort((a, b) => {
      const dateA = new Date(a.date).getTime() || 0;
      const dateB = new Date(b.date).getTime() || 0;
      return dateB - dateA;
    });
  }, [loads, subcollExpenses, downtimeExpenses, expenses, driverProfiles, vehicles, settings]);

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      {/* ── Top Page Header ─────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold font-headline text-slate-900 tracking-tight flex items-center gap-2.5">
            <DollarSign className="h-7 w-7 text-emerald-600" />
            Expense Tracking & Ledger
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Log fleet operating costs, review driver fuel receipts, and link expenses to loads for net profit calculations.
          </p>
        </div>

        {/* Header Action Shortcuts */}
        <div className="flex items-center gap-2 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={fetchDriverActualExpenses}
            disabled={isRefreshing}
            className="h-9 px-3 text-xs font-semibold rounded-lg border-slate-300 text-slate-700 hover:bg-slate-100 flex items-center gap-1.5"
            title="Re-sync driver logged receipts from Firestore"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-blue-600' : ''}`} />
            <span>Refresh</span>
          </Button>

          <Button
            onClick={() => setIsAddFormOpen(prev => !prev)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs h-9 shadow-xs gap-1.5 rounded-lg"
          >
            {isAddFormOpen ? (
              <>
                <ChevronUp className="h-4 w-4" />
                Hide Form
              </>
            ) : (
              <>
                <PlusCircle className="h-4 w-4" />
                Log Expense
              </>
            )}
          </Button>
        </div>
      </div>

      {/* ── Expandable / Collapsible Add Expense Form ───────────────── */}
      {isAddFormOpen && (
        <div className="transition-all animate-in fade-in duration-200">
          <ExpenseForm 
            expenseForm={expenseForm}
            setExpenseForm={setExpenseForm}
            loads={loads}
            vehicles={vehicles}
            settings={settings}
            onSubmit={handleExpenseSubmit}
            isSubmitting={isSubmittingExpense}
            onCancel={() => setIsAddFormOpen(false)}
          />
        </div>
      )}

      {/* ── Main Expense Ledger & Financial KPIs ────────────────────── */}
      <AdminExpenseDashboard 
        expenses={unifiedExpenses} 
        loads={loads} 
        isLoading={isRefreshing} 
        onAddExpenseClick={() => setIsAddFormOpen(true)}
      />
    </div>
  );
}
