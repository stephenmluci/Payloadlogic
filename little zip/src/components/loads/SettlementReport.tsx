
import React from 'react';
import type { Load, DriverProfile, Vehicle, Settings } from '@/types';
import { format as formatDate } from 'date-fns';
import { ExternalLink, Receipt } from 'lucide-react';

type SettlementReportProps = {
  load: Load;
  driver: DriverProfile | undefined;
  truck: Vehicle | undefined;
  trailer: Vehicle | undefined;
  settings: Settings;
};

export const SettlementReport = React.forwardRef<HTMLDivElement, SettlementReportProps>(
  ({ load, driver, truck, trailer, settings }, ref) => {
    const totalMiles = (load.distance || 0) + (load.deadheadMiles || 0);
    const revenue = load.totalAgreedRate;
    
    // Calculate payroll
    let driverPay = 0;
    if (driver) {
      if (driver.payType === 'per-mile') {
        driverPay = totalMiles * (driver.payRate || 0);
      } else {
        const percentage = driver.payPercentageOfGross ?? driver.payrollPercentage ?? settings.payrollPercentage;
        driverPay = revenue * (percentage / 100);
      }
    }

    const expenses = load.expenses || { fuel: 0, def: 0, maintenance: 0, recurring: 0, payroll: driverPay };
    const actualExpensesList = load.actualExpenses || [];

    // Sum actual expenses logged in sub-collection
    const loggedFuel = actualExpensesList
      .filter((e) => e.category === 'Fuel')
      .reduce((sum, e) => sum + (e.amount || 0), 0);

    const loggedDef = actualExpensesList
      .filter((e) => e.category === 'DEF')
      .reduce((sum, e) => sum + (e.amount || 0), 0);

    const loggedMaintenance = actualExpensesList
      .filter((e) => e.category === 'Maintenance/Repair')
      .reduce((sum, e) => sum + (e.amount || 0), 0);

    const loggedTollsAndScales = actualExpensesList
      .filter((e) => ['Tolls', 'Scale Ticket', 'Other'].includes(e.category))
      .reduce((sum, e) => sum + (e.amount || 0), 0);

    const totalLoggedExpenses = actualExpensesList.reduce((sum, e) => sum + (e.amount || 0), 0);

    // Dynamic actual operational costs
    const effectiveFuel = loggedFuel > 0 ? loggedFuel : (expenses.fuel || 0);
    const effectiveDef = loggedDef > 0 ? loggedDef : (expenses.def || 0);
    const effectiveMaintenance = loggedMaintenance > 0 ? loggedMaintenance : (expenses.maintenance || 0);
    const effectiveRecurring = expenses.recurring || 0;
    const effectiveTollsAndScales = loggedTollsAndScales;

    const totalOperatingCosts = effectiveFuel + effectiveDef + effectiveMaintenance + effectiveRecurring + effectiveTollsAndScales;
    const actualPostPayrollProfit = revenue - (driverPay + totalOperatingCosts);

    return (
      <div ref={ref} className="p-8 max-w-4xl mx-auto bg-white text-slate-900 font-sans">
        {/* Header */}
        <div className="flex justify-between items-start border-b-2 border-slate-900 pb-6 mb-8">
          <div>
            <h1 className="text-3xl font-bold uppercase tracking-tight text-slate-900">Driver Settlement Report</h1>
            <p className="text-slate-500 mt-1">Generated on {formatDate(new Date(), 'PPpp')}</p>
          </div>
          <div className="text-right">
            <div className="font-bold text-xl">{settings.carrierName}</div>
            <div className="text-sm text-slate-500">
              {settings.carrierAddress?.street}<br />
              {settings.carrierAddress?.city}, {settings.carrierAddress?.state} {settings.carrierAddress?.zip}
            </div>
          </div>
        </div>

        {/* Load Info */}
        <div className="grid grid-cols-2 gap-8 mb-8">
          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
            <h2 className="text-xs font-bold uppercase text-slate-500 mb-3 tracking-wider">Load Details</h2>
            <div className="grid grid-cols-2 gap-y-2 text-sm">
              <span className="font-medium">Load Number:</span> <span>{load.loadNumber || 'N/A'}</span>
              <span className="font-medium">Origin:</span> <span>{load.origin.city}, {load.origin.state}</span>
              <span className="font-medium">Destination:</span> <span>{load.destination.city}, {load.destination.state}</span>
              <span className="font-medium">Pickup Date:</span> <span>{load.pickupDateTime ? formatDate(new Date(load.pickupDateTime), 'PP') : 'N/A'}</span>
              <span className="font-medium">Delivery Date:</span> <span>{load.deliveryDateTime ? formatDate(new Date(load.deliveryDateTime), 'PP') : 'N/A'}</span>
              <span className="font-medium">Signed BOL / POD:</span> <span className={load.signedBolUrl ? "text-emerald-700 font-semibold" : "text-amber-600 font-semibold"}>{load.signedBolUrl ? 'Verified & Attached' : 'Pending Driver Upload'}</span>
            </div>
          </div>
          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
            <h2 className="text-xs font-bold uppercase text-slate-500 mb-3 tracking-wider">Asset Info</h2>
            <div className="grid grid-cols-2 gap-y-2 text-sm">
              <span className="font-medium">Driver:</span> <span>{driver?.name || 'N/A'}</span>
              <span className="font-medium">Truck:</span> <span>{truck ? `[T-${truck.unitNumber}] ${truck.name}` : 'N/A'}</span>
              <span className="font-medium">Trailer:</span> <span>{trailer ? `[TRL-${trailer.unitNumber}] ${trailer.name}` : 'N/A'}</span>
              <span className="font-medium">Loaded Miles:</span> <span>{load.distance}</span>
              <span className="font-medium">Deadhead Miles:</span> <span>{load.deadheadMiles || 0}</span>
              <span className="font-medium font-bold">Total Miles:</span> <span className="font-bold">{totalMiles}</span>
            </div>
          </div>
        </div>

        {/* Earnings */}
        <div className="mb-8">
          <h2 className="text-lg font-bold border-b border-slate-200 pb-2 mb-4">Earnings Summary</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 uppercase text-[10px] tracking-widest">
                <th className="pb-3">Description</th>
                <th className="pb-3 text-right">Rate</th>
                <th className="pb-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className="py-3">Gross Load Revenue</td>
                <td className="py-3 text-right">${load.ratePerMile.toFixed(2)}/mi</td>
                <td className="py-3 text-right font-bold">${revenue.toFixed(2)}</td>
              </tr>
              {!!(load.tarpingFee && load.tarpingFee > 0) && (
                <tr>
                  <td className="py-3">Tarping Fee</td>
                  <td className="py-3 text-right">-</td>
                  <td className="py-3 text-right">${load.tarpingFee.toFixed(2)}</td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="bg-slate-900 text-white font-bold">
                <td className="py-3 px-3 rounded-l-md">Total Gross Earnings</td>
                <td></td>
                <td className="py-3 px-3 text-right rounded-r-md">${revenue.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Driver Payroll Breakdown */}
        <div className="mb-8">
          <h2 className="text-lg font-bold border-b border-slate-200 pb-2 mb-4">Driver Payroll Breakdown</h2>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className="py-3">
                  Driver Pay ({driver?.payType === 'per-mile' ? `$${driver.payRate}/mi` : `${driver?.payPercentageOfGross ?? driver?.payrollPercentage ?? settings.payrollPercentage}% of Gross`})
                </td>
                <td className="py-3 text-right font-bold text-emerald-600">${driverPay.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ── In-Transit Actual Expenses & Receipts Table ── */}
        <div className="mb-8">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-4">
            <div className="flex items-center gap-2">
              <Receipt className="w-5 h-5 text-amber-600" />
              <h2 className="text-lg font-bold text-slate-900">In-Transit Actual Expenses & Receipts</h2>
            </div>
            <span className="text-xs font-semibold text-slate-600">
              {actualExpensesList.length} item{actualExpensesList.length !== 1 ? 's' : ''} submitted • Total: ${totalLoggedExpenses.toFixed(2)}
            </span>
          </div>

          {actualExpensesList.length === 0 ? (
            <div className="p-4 bg-slate-50 rounded-lg border border-dashed border-slate-200 text-center text-sm text-slate-500">
              No in-transit expenses submitted for this load.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr className="text-left text-slate-600 uppercase text-[10px] tracking-wider">
                    <th className="py-2.5 px-3 font-bold">Category</th>
                    <th className="py-2.5 px-3 font-bold text-right">Amount ($)</th>
                    <th className="py-2.5 px-3 font-bold text-center">Gallons (IFTA)</th>
                    <th className="py-2.5 px-3 font-bold">Notes / Description</th>
                    <th className="py-2.5 px-3 font-bold text-right">Receipt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {actualExpensesList.map((exp, idx) => (
                    <tr key={exp.id || `exp-${idx}`} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-3 font-semibold text-slate-800">
                        {exp.category}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                        ${exp.amount.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-center text-slate-700">
                        {exp.gallonsPurchased !== undefined && exp.gallonsPurchased !== null
                          ? `${exp.gallonsPurchased} gal`
                          : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-xs text-slate-600 max-w-xs truncate">
                        {exp.notes || '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {exp.receiptUrl ? (
                          <a
                            href={exp.receiptUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md transition-colors shadow-2xs"
                            title="View full receipt image"
                          >
                            <Receipt className="w-3.5 h-3.5 text-blue-600" />
                            <span>View Receipt</span>
                            <ExternalLink className="w-3 h-3 ml-0.5" />
                          </a>
                        ) : (
                          <span className="text-xs text-slate-400 italic">No receipt attached</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 border-t border-slate-200 font-bold text-xs">
                  <tr>
                    <td className="py-2.5 px-3 text-slate-700">Total Actual Route Expenses</td>
                    <td className="py-2.5 px-3 text-right text-slate-900 font-extrabold">
                      ${totalLoggedExpenses.toFixed(2)}
                    </td>
                    <td colSpan={3}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* Company Expense Analysis (Internal Only) */}
        <div className="mt-8 pt-6 border-t-2 border-slate-200 bg-slate-50 p-6 rounded-xl">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold uppercase text-slate-500 tracking-widest">
              Administrative Analysis & Financial Ledger (Internal Use Only)
            </h2>
            {actualExpensesList.length > 0 && (
              <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
                Synchronized with Actual In-Transit Ledger
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-x-12 gap-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">
                Fuel Expense {loggedFuel > 0 ? '(Actual Logged)' : '(Estimated)'}:
              </span>
              <span className="font-medium">${effectiveFuel.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">
                DEF Expense {loggedDef > 0 ? '(Actual Logged)' : '(Estimated)'}:
              </span>
              <span className="font-medium">${effectiveDef.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">
                Maintenance/Operating {loggedMaintenance > 0 ? '(Actual Logged)' : '(Reserve)'}:
              </span>
              <span className="font-medium">${effectiveMaintenance.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Fixed/Recurring Overhead:</span>
              <span className="font-medium">${effectiveRecurring.toFixed(2)}</span>
            </div>
            {effectiveTollsAndScales > 0 && (
              <div className="flex justify-between">
                <span className="text-slate-500">Tolls & Scale Tickets (Actual):</span>
                <span className="font-medium">${effectiveTollsAndScales.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between col-span-2 pt-3 border-t border-slate-200 font-bold">
              <span>Actual Load Profit (Post-Payroll):</span>
              <span className={`text-lg ${actualPostPayrollProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                ${actualPostPayrollProfit.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-16 text-center text-[10px] text-slate-400 uppercase tracking-widest">
          End of Settlement Report - Confirmed for Load #{load.loadNumber || 'N/A'}
        </div>
      </div>
    );
  }
);

SettlementReport.displayName = 'SettlementReport';

