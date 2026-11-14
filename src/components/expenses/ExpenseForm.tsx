import React, { useEffect, useState } from 'react';
import type { DriverProfile, Expense, Load, Settings } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { 
  CalendarDays, 
  Tag, 
  DollarSign, 
  Link2, 
  Truck, 
  Package, 
  FileText, 
  CheckCircle2, 
  RotateCcw, 
  ChevronDown, 
  ChevronUp,
  Receipt,
  Info
} from 'lucide-react';
import { formatAddress } from '@/lib/utils';

type ExpenseFormProps = {
  expenseForm: Omit<Expense, 'id'>;
  setExpenseForm: React.Dispatch<React.SetStateAction<Omit<Expense, 'id'>>>;
  loads: Load[];
  vehicles: any[];
  settings: Settings;
  driverProfiles?: DriverProfile[];
  onSubmit: (e: React.FormEvent) => void;
  isSubmitting?: boolean;
  onCancel?: () => void;
};

const NO_LOAD_VALUE = "_NO_LOAD_SELECTED_";
const NO_ASSET_VALUE = "_NO_ASSET_SELECTED_";

const POPULAR_CATEGORIES = [
  'Fuel',
  'DEF',
  'Maintenance / Repair',
  'Payroll',
  'Tolls',
  'Scale Ticket',
  'Tires',
  'Insurance',
  'Parts & Supplies',
  'Other'
];

export function ExpenseForm({ 
  expenseForm, 
  setExpenseForm, 
  loads, 
  vehicles, 
  settings, 
  driverProfiles = [],
  onSubmit, 
  isSubmitting,
  onCancel 
}: ExpenseFormProps) {
  const [showAssetAssignment, setShowAssetAssignment] = useState(
    Boolean(expenseForm.truckId || expenseForm.trailerId)
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setExpenseForm(prev => ({ 
      ...prev, 
      [name]: type === 'number' ? (value === '' ? 0 : Number(value)) : value 
    }));
  };

  const handleCategorySelect = (cat: string) => {
    setExpenseForm(prev => ({ ...prev, category: cat }));
  };

  const handleLoadIdChange = (selectedValue: string) => {
    const cleanLoadId = selectedValue === NO_LOAD_VALUE ? '' : selectedValue;
    setExpenseForm(prev => ({
      ...prev,
      loadId: cleanLoadId
    }));
  };

  const handleAssetChange = (type: 'truck' | 'trailer', selectedValue: string) => {
    setExpenseForm(prev => ({
      ...prev,
      truckId: type === 'truck' ? (selectedValue === NO_ASSET_VALUE ? '' : selectedValue) : prev.truckId,
      trailerId: type === 'trailer' ? (selectedValue === NO_ASSET_VALUE ? '' : selectedValue) : prev.trailerId
    }));
  };

  const handleReset = () => {
    setExpenseForm({
      date: new Date().toISOString().split('T')[0],
      category: '',
      amount: 0,
      loadId: '',
      notes: '',
      truckId: '',
      trailerId: ''
    });
  };

  // Auto-calculate payroll from the assigned driver's pay profile (or fleet default) when category is payroll and a load is linked
  useEffect(() => {
    if (expenseForm.category.toLowerCase().includes('payroll') && expenseForm.loadId && expenseForm.loadId !== NO_LOAD_VALUE) {
      const selectedLoad = loads.find(load => load.id === expenseForm.loadId);
      if (!selectedLoad) return;

      const miles = (selectedLoad.distance || 0) + (selectedLoad.deadheadMiles || 0);
      const driver = selectedLoad.assignedDriverId
        ? driverProfiles.find(d => d.uid === selectedLoad.assignedDriverId || (d as any).id === selectedLoad.assignedDriverId)
        : undefined;

      let calculatedPayroll = 0;
      let rateSummary = '';
      if (driver) {
        if (driver.payType === 'per-mile') {
          const rate = driver.payRate || 0;
          calculatedPayroll = miles * rate;
          rateSummary = `${driver.name} · $${rate.toFixed(2)}/mi × ${miles} mi`;
        } else if (driver.payType === 'hourly') {
          const rate = driver.payRate || settings.defaultDriverHourlyRate || 25;
          const estHrs = driver.estimatedTripHours || (miles > 0 ? miles / (settings.truckAverageSpeed || 55) : 0);
          calculatedPayroll = estHrs * rate;
          rateSummary = `${driver.name} · $${rate.toFixed(2)}/hr × ${estHrs.toFixed(1)} hrs`;
        } else {
          const pct = driver.payRate ?? driver.payrollPercentage ?? settings.payrollPercentage ?? 0;
          calculatedPayroll = (selectedLoad.totalAgreedRate * pct) / 100;
          rateSummary = `${driver.name} · ${pct}% of gross`;
        }
      } else if (settings.payrollPercentage > 0) {
        calculatedPayroll = (selectedLoad.totalAgreedRate * settings.payrollPercentage) / 100;
        rateSummary = `${selectedLoad.assignedDriverName || 'Driver'} · ${settings.payrollPercentage}% default`;
      }

      setExpenseForm(prev => ({
        ...prev,
        amount: parseFloat(calculatedPayroll.toFixed(2)),
        notes: prev.notes?.trim() ? prev.notes : (rateSummary ? `Payroll (${rateSummary})` : prev.notes),
      }));
    }
  }, [expenseForm.category, expenseForm.loadId, loads, driverProfiles, settings, setExpenseForm]);

  // Selected load details for informative feedback
  const linkedLoad = loads.find(l => l.id === expenseForm.loadId);

  return (
    <Card className="border border-slate-200 shadow-sm bg-white rounded-xl">
      <CardHeader className="pb-4 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
              <Receipt className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-lg font-bold text-slate-900">Log Business Expense</CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Record operating costs, fuel purchases, or link expenses directly to loads for profit calculations.
              </CardDescription>
            </div>
          </div>
          {onCancel && (
            <Button variant="ghost" size="sm" onClick={onCancel} className="text-xs text-slate-500">
              Cancel
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-5">
        <form onSubmit={onSubmit} className="space-y-5">
          {/* ── 1. Date & 2. Category ─────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Field 1: Date */}
            <div>
              <Label htmlFor="date" className="text-xs font-semibold text-slate-700">
                Date <span className="text-red-500">*</span>
              </Label>
              <div className="relative mt-1">
                <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  id="date"
                  name="date"
                  type="date"
                  value={expenseForm.date}
                  onChange={handleInputChange}
                  className="pl-9 h-9 text-xs"
                  required
                />
              </div>
            </div>

            {/* Field 2: Category */}
            <div>
              <Label htmlFor="category" className="text-xs font-semibold text-slate-700">
                Category <span className="text-red-500">*</span>
              </Label>
              <div className="relative mt-1">
                <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  id="category"
                  name="category"
                  value={expenseForm.category}
                  onChange={handleInputChange}
                  placeholder="e.g. Fuel, Maintenance, Payroll, Tolls"
                  className="pl-9 h-9 text-xs"
                  required
                />
              </div>
              {/* Quick Category Chips */}
              <div className="flex items-center gap-1.5 flex-wrap mt-2">
                <span className="text-[10px] text-slate-400 font-medium">Quick Select:</span>
                {POPULAR_CATEGORIES.slice(0, 5).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => handleCategorySelect(cat)}
                    className={`text-[10px] px-2 py-0.5 rounded-md font-medium transition-colors border ${
                      expenseForm.category.toLowerCase() === cat.toLowerCase()
                        ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── 3. Amount & 4. Linked Load (Optional) ──────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Field 3: Amount */}
            <div>
              <Label htmlFor="amount" className="text-xs font-semibold text-slate-700">
                Amount ($) <span className="text-red-500">*</span>
              </Label>
              <div className="relative mt-1">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  id="amount"
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={expenseForm.amount === 0 ? '' : expenseForm.amount}
                  onChange={handleInputChange}
                  placeholder="0.00"
                  className="pl-9 h-9 text-xs font-semibold"
                  required
                />
              </div>
              {expenseForm.category.toLowerCase() === 'payroll' && settings.payrollPercentage > 0 && expenseForm.loadId && (
                <p className="text-[11px] text-emerald-600 mt-1 flex items-center gap-1 font-medium">
                  <CheckCircle2 className="h-3 w-3" />
                  Auto-calculated at {settings.payrollPercentage}% of load revenue.
                </p>
              )}
            </div>

            {/* Field 4: Linked Load (Optional) */}
            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="loadId" className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                  <Link2 className="h-3.5 w-3.5 text-blue-600" />
                  Link to Load <span className="text-slate-400 font-normal">(Optional)</span>
                </Label>
              </div>
              <div className="relative mt-1">
                <Select
                  value={expenseForm.loadId || NO_LOAD_VALUE}
                  onValueChange={handleLoadIdChange}
                >
                  <SelectTrigger id="loadId" className="h-9 text-xs w-full">
                    <SelectValue placeholder="General fleet expense (No load linked)" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    <SelectItem value={NO_LOAD_VALUE}>
                      <span className="text-slate-500 font-medium">General Overhead (No Load Linked)</span>
                    </SelectItem>
                    {loads.map(load => {
                      const originCity = load.origin?.city || 'Origin';
                      const destCity = load.destination?.city || 'Destination';
                      const label = load.loadNumber 
                        ? `Load #${load.loadNumber}: ${originCity} → ${destCity}` 
                        : `Load #${load.id?.substring(0, 6)}: ${originCity} → ${destCity}`;
                      return (
                        <SelectItem key={load.id} value={load.id!}>
                          {label}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              {/* Helpful Guidance */}
              <p className="text-[11px] text-slate-500 mt-1 flex items-start gap-1 leading-snug">
                <Info className="h-3 w-3 text-blue-500 shrink-0 mt-0.5" />
                <span>
                  Linking deducts this cost directly from the load&apos;s net profit on settlement reports.
                </span>
              </p>
            </div>
          </div>

          {/* ── 5. Notes (Optional) ──────────────────────────────────── */}
          <div>
            <Label htmlFor="notes" className="text-xs font-semibold text-slate-700">
              Notes & Description <span className="text-slate-400 font-normal">(Optional)</span>
            </Label>
            <div className="relative mt-1">
              <FileText className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Textarea
                id="notes"
                name="notes"
                value={expenseForm.notes || ''}
                onChange={handleInputChange}
                placeholder="e.g. Love's Travel Stop #420, 55 gal diesel, emergency tire repair..."
                rows={2}
                className="pl-9 text-xs resize-none"
              />
            </div>
          </div>

          {/* ── Progressive Disclosure: Optional Vehicle / Asset Assignment ── */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowAssetAssignment(prev => !prev)}
              className="text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1.5 transition-colors"
            >
              {showAssetAssignment ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              <span>Vehicle & Equipment Assignment (Optional)</span>
              {(expenseForm.truckId || expenseForm.trailerId) && (
                <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.2 rounded-full font-bold">
                  Assigned
                </span>
              )}
            </button>

            {showAssetAssignment && (
              <div className="mt-3 p-3.5 bg-slate-50/80 border border-slate-200/80 rounded-lg grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in fade-in duration-150">
                {/* Truck */}
                <div>
                  <Label htmlFor="truckId" className="text-xs font-medium text-slate-600 flex items-center gap-1">
                    <Truck className="h-3.5 w-3.5 text-slate-400" />
                    Truck / Power Unit
                  </Label>
                  <div className="mt-1">
                    <Select
                      value={expenseForm.truckId || NO_ASSET_VALUE}
                      onValueChange={(val) => handleAssetChange('truck', val)}
                    >
                      <SelectTrigger id="truckId" className="h-8 text-xs bg-white">
                        <SelectValue placeholder="No truck assigned" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_ASSET_VALUE}>None</SelectItem>
                        {vehicles.filter(v => v.type === 'truck').map(truck => (
                          <SelectItem key={truck.id} value={truck.id}>
                            #{truck.unitNumber} - {truck.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Trailer */}
                <div>
                  <Label htmlFor="trailerId" className="text-xs font-medium text-slate-600 flex items-center gap-1">
                    <Package className="h-3.5 w-3.5 text-slate-400" />
                    Trailer
                  </Label>
                  <div className="mt-1">
                    <Select
                      value={expenseForm.trailerId || NO_ASSET_VALUE}
                      onValueChange={(val) => handleAssetChange('trailer', val)}
                    >
                      <SelectTrigger id="trailerId" className="h-8 text-xs bg-white">
                        <SelectValue placeholder="No trailer assigned" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_ASSET_VALUE}>None</SelectItem>
                        {vehicles.filter(v => v.type === 'trailer').map(trailer => (
                          <SelectItem key={trailer.id} value={trailer.id}>
                            #{trailer.unitNumber} - {trailer.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Action Buttons ────────────────────────────────────────── */}
          <div className="pt-3 flex items-center justify-between gap-3 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleReset}
              disabled={isSubmitting}
              className="text-xs text-slate-600 hover:text-slate-800"
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1.5 text-slate-400" />
              Reset Form
            </Button>

            <div className="flex items-center gap-2">
              {onCancel && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onCancel}
                  disabled={isSubmitting}
                  className="text-xs"
                >
                  Cancel
                </Button>
              )}
              <Button 
                type="submit" 
                size="sm" 
                disabled={isSubmitting} 
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-xs h-9 px-4 gap-1.5"
              >
                <CheckCircle2 className="h-4 w-4" />
                {isSubmitting ? 'Saving Expense...' : 'Save Expense'}
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
