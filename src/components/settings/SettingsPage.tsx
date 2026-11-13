'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { SUPPORT_EMAIL } from '@/lib/support';
import type { RecurringExpenseItem, Address } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { AddressFields } from '../common/AddressFields';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { 
  DollarSign, 
  Truck as TruckIcon, 
  Building, 
  FileText, 
  Repeat, 
  Layers, 
  Save, 
  PlusCircle, 
  Trash2, 
  ShieldCheck, 
  Gauge, 
  GaugeCircle, 
  Fuel, 
  Percent, 
  User, 
  Phone, 
  Mail, 
  Hash, 
  Package, 
  Wrench, 
  TrendingUp, 
  Copy, 
  CheckCircle2, 
  Info, 
  ChevronRight,
  ArrowRight,
  Sparkles,
  Droplet
} from 'lucide-react';
import { cn, sanitizePhoneDigits, handlePhonePaste } from '@/lib/utils';
import { useApp } from '@/context/AppContext';
import { toast } from '@/hooks/use-toast';

type SettingsTab = 'financials' | 'truck-trailer' | 'carrier' | 'contracts' | 'recurring' | 'assets';

export function SettingsPage() {
  const {
    user,
    trial,
    isOwnerOrAdmin,
    activateOwnerRole,
    settingsForm,
    setSettingsForm,
    updateSettings,
    isSubmitting: isAppSubmitting,
    vehicles,
    driverProfiles,
    addVehicle, 
    updateVehicle, 
    deleteVehicle, 
    addDriverProfile, 
    updateDriverProfile, 
    deleteDriverProfile,
    calculateVehicleCPM, 
    archiveVehicleCPM,
    settingsSubTab,
    setSettingsSubTab,
  } = useApp();

  const activeTab = settingsSubTab;
  const setActiveTab = setSettingsSubTab;
  const [activeAssetId, setActiveAssetId] = useState<string>('global');
  const [activeAssetType, setActiveAssetType] = useState<'global' | 'truck' | 'trailer' | 'driver'>('global');
  const [isCloning, setIsCloning] = useState(false);
  const [assetForm, setAssetForm] = useState<any>(null);

  const activeAsset = useMemo(() => {
    const id = activeAssetId.replace('truck-', '').replace('trailer-', '');
    return vehicles.find(v => v.id === id);
  }, [activeAssetId, vehicles]);

  const handleAssetSelect = (value: string) => {
    setActiveAssetId(value);
    setIsCloning(false);

    if (value === 'global') {
      setActiveAssetType('global');
      setAssetForm(null);
    } else if (value.startsWith('truck-')) {
      setActiveAssetType('truck');
      const id = value.replace('truck-', '');
      const truck = vehicles.find(v => v.id === id);
      if (truck) setAssetForm({ 
        monthlyFixedCosts: [],
        mpg: 10,
        averageSpeed: 65,
        ...truck 
      });
    } else if (value.startsWith('trailer-')) {
      setActiveAssetType('trailer');
      const id = value.replace('trailer-', '');
      const trailer = vehicles.find(v => v.id === id);
      if (trailer) setAssetForm({ ...trailer });
    } else if (value.startsWith('driver-')) {
      setActiveAssetType('driver');
      const id = value.replace('driver-', '');
      const driver = driverProfiles.find(d => d.uid === id);
      if (driver) setAssetForm({ 
        payType: 'percentage',
        payRate: driver.payrollPercentage || 25,
        ...driver 
      });
    }
  };

  const handleClone = () => {
    if (activeAssetType === 'global') return;
    
    setIsCloning(true);
    if (activeAssetType === 'truck' || activeAssetType === 'trailer') {
      setAssetForm({
        ...assetForm,
        id: undefined,
        unitNumber: `${assetForm.unitNumber}-CLONE`,
        name: `${assetForm.name} (Copy)`
      });
    } else if (activeAssetType === 'driver') {
      setAssetForm({
        ...assetForm,
        uid: `driver-clone-${Date.now()}`,
        name: `${assetForm.name} (Clone)`
      });
    }
    toast({ title: "Asset Cloned", description: "You are now editing a new copy. Click Save to create it." });
  };

  const handleAssetInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    const numericFields = [
      'payrollPercentage', 'mpg', 'averageSpeed', 'amount', 'year', 'gvwr', 
      'emptyWeight', 'trailerLength', 'trailerWidth', 'maxTongueWeightCapacity', 
      'estimatedMonthlyMiles'
    ];
    
    setAssetForm((prev: any) => ({
      ...prev,
      [name]: numericFields.includes(name) ? (value === '' ? 0 : Number(value)) : value
    }));
  };

  const handleSave = async () => {
    if (activeAssetType === 'global') {
      await updateSettings();
      toast({
        title: "Settings Saved",
        description: "Your operational defaults and fleet settings have been updated.",
      });
    } else if (activeAssetType === 'truck' || activeAssetType === 'trailer') {
      if (isCloning) {
        const { id, ...newVehicle } = assetForm;
        await addVehicle(newVehicle);
        setIsCloning(false);
        setActiveAssetId('global');
        setActiveAssetType('global');
        toast({ title: "Asset Created", description: `${newVehicle.name} added to your fleet.` });
      } else {
        await updateVehicle(assetForm.id, assetForm);
        toast({ title: "Asset Updated", description: `${assetForm.name} saved successfully.` });
      }
    } else if (activeAssetType === 'driver') {
      if (isCloning) {
        await addDriverProfile(assetForm);
        setIsCloning(false);
        setActiveAssetId('global');
        setActiveAssetType('global');
        toast({ title: "Driver Created", description: `${assetForm.name} added to roster.` });
      } else {
        await updateDriverProfile(assetForm.uid, assetForm);
        toast({ title: "Driver Updated", description: `${assetForm.name} saved successfully.` });
      }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    const requiredNumericFields = [
      'payrollPercentage', 
      'targetDailyBusinessProfit', 
      'defaultFuelCostPerGallon', 
      'defCostPerGallon', 
      'truckMpg', 
      'truckAverageSpeed', 
      'defaultOperatingCostPerMile', 
      'cargoSafetyBuffer', 
      'CARGO_SAFETY_BUFFER',
      'maxWeightCapacity',
      'maxLengthCapacity',
      'monthlyMaintenance'
    ];

    const optionalNumericFields = ['loadingFee', 'detentionFeeRate', 'defaultDriverHourlyRate'];

    if (requiredNumericFields.includes(name)) {
      const numVal = value === '' ? 0 : Number(value);
      setSettingsForm(prev => {
        const next = { ...prev, [name]: numVal };
        if (name === 'CARGO_SAFETY_BUFFER') {
          next.cargoSafetyBuffer = numVal;
        } else if (name === 'cargoSafetyBuffer') {
          next.CARGO_SAFETY_BUFFER = numVal;
        }
        return next;
      });
    } else if (optionalNumericFields.includes(name)) {
      setSettingsForm(prev => ({ ...prev, [name]: value === '' ? undefined : Number(value) }));
    } else {
      const cleanVal = name === 'carrierContactPhone' ? sanitizePhoneDigits(value) : value;
      setSettingsForm(prev => ({ ...prev, [name]: cleanVal }));
    }
  };

  const handleRadioChange = (value: string) => {
    setSettingsForm(prev => ({ ...prev, trailerHitchType: value as 'gooseneck' | 'fifth-wheel' | '' }));
  };

  const handleCarrierAddressChange = (field: keyof Address, value: string) => {
    setSettingsForm(prev => ({
      ...prev,
      carrierAddress: {
        ...(prev.carrierAddress || { street: '', city: '', state: '', zip: '' }),
        [field]: value
      }
    }));
  };

  const addRecurringExpense = () => {
    setSettingsForm(prev => ({
      ...prev,
      recurringExpenses: [...(prev.recurringExpenses || []), { name: '', amount: 0, category: 'Administrative' }],
      recurringExpensesLastUpdated: new Date().toISOString()
    }));
  };

  const updateRecurringExpense = (index: number, field: keyof RecurringExpenseItem, value: string | number) => {
    const updatedExpenses = [...(settingsForm.recurringExpenses || [])];
    updatedExpenses[index] = {
      ...updatedExpenses[index],
      [field]: field === 'amount' ? (value === '' ? 0 : Number(value)) : value
    };
    setSettingsForm(prev => ({ 
      ...prev, 
      recurringExpenses: updatedExpenses,
      recurringExpensesLastUpdated: new Date().toISOString()
    }));
  };

  const removeRecurringExpense = (index: number) => {
    setSettingsForm(prev => ({
      ...prev,
      recurringExpenses: (prev.recurringExpenses || []).filter((_, i) => i !== index),
      recurringExpensesLastUpdated: new Date().toISOString()
    }));
  };

  const recurringGrandTotal = useMemo(() => {
    return (settingsForm.recurringExpenses || []).reduce((s, e) => s + (e.amount || 0), 0);
  }, [settingsForm.recurringExpenses]);

  // Tab definitions
  const TABS = [
    { id: 'financials', label: 'Financials & Rates', icon: DollarSign, desc: 'Profit targets, driver pay, operating CPM' },
    { id: 'truck-trailer', label: 'Truck & Trailer Defaults', icon: TruckIcon, desc: 'MPG, speed, trailer specs, cargo buffer' },
    { id: 'carrier', label: 'Carrier Information', icon: Building, desc: 'Company identity, DOT/MC, base address' },
    { id: 'contracts', label: 'Contract & Billing Defaults', icon: FileText, desc: 'Detention, loading fees, legal terms' },
    { id: 'recurring', label: 'Recurring Overhead', icon: Repeat, desc: 'Fixed fleet costs, monthly burn rate' },
    { id: 'assets', label: 'Asset Profile Overrides', icon: Layers, desc: 'Truck, trailer & driver custom settings' },
  ] as const;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6 pb-36 sm:pb-28">
      {/* ── Page Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold font-headline text-slate-900 tracking-tight flex items-center gap-2.5">
            <Building className="h-7 w-7 text-blue-600" />
            System Settings
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Configure business-wide defaults, carrier authority, contract terms, and operational financial targets.
          </p>
        </div>

        {/* Global vs Asset Scope Indicator */}
        <div className="flex items-center gap-2 shrink-0">
          {activeAssetType !== 'global' ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleAssetSelect('global')}
              className="text-xs text-slate-600 border-slate-300"
            >
              ← Back to Global Defaults
            </Button>
          ) : (
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs px-2.5 py-1 font-semibold">
              🏢 Global Fleet Scope
            </Badge>
          )}
        </div>
      </div>

      {/* ── Top Navigation Tabs (Grouped Settings) ─────────────────── */}
      {activeAssetType === 'global' ? (
        <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-100 no-scrollbar">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as SettingsTab)}
                className={cn(
                  "flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border",
                  isActive
                    ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                    : "bg-white text-slate-600 hover:text-slate-900 border-slate-200 hover:bg-slate-50"
                )}
              >
                <Icon className={cn("h-4 w-4", isActive ? "text-white" : "text-slate-400")} />
                <span>{tab.label}</span>
                {tab.id === 'recurring' && (settingsForm.recurringExpenses || []).length > 0 && (
                  <span className={cn(
                    "text-[10px] px-1.5 py-0.2 rounded-full font-bold",
                    isActive ? "bg-blue-500 text-white" : "bg-slate-100 text-slate-600"
                  )}>
                    {(settingsForm.recurringExpenses || []).length}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="flex items-center justify-between p-3 bg-amber-50/80 border border-amber-200 rounded-xl">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-amber-700" />
            <span className="text-xs font-bold text-amber-900">
              Editing Asset Profile: {assetForm?.unitNumber || assetForm?.name || activeAssetType}
            </span>
            {isCloning && (
              <Badge variant="outline" className="text-[10px] bg-blue-100 text-blue-700 border-blue-300">
                New Copy
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleClone} 
              className="h-8 text-xs bg-white border-amber-300 text-amber-900 hover:bg-amber-100"
            >
              <Copy className="h-3.5 w-3.5 mr-1" />
              Clone
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => handleAssetSelect('global')} 
              className="h-8 text-xs text-slate-600 hover:text-slate-900"
            >
              Back to Global Defaults
            </Button>
          </div>
        </div>
      )}

      {/* ── TAB 1: Financials & Profit Targets ──────────────────────── */}
      {activeAssetType === 'global' && activeTab === 'financials' && (
        <Card className="border border-slate-200 shadow-sm bg-white rounded-xl">
          <CardHeader className="pb-4 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
                <DollarSign className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-lg font-bold text-slate-900">Financial Assumptions & Profit Targets</CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Parameters used by the Rate Projection Engine to calculate minimum profitable booking rates.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-5 space-y-6">
            {/* Target Profit & Default Payroll */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Target Daily Profit */}
              <div>
                <Label htmlFor="targetDailyBusinessProfit" className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
                  Target Daily Business Profit ($/day per truck)
                </Label>
                <div className="relative mt-1">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="targetDailyBusinessProfit"
                    name="targetDailyBusinessProfit"
                    type="number"
                    step="any"
                    min="0"
                    inputMode="decimal"
                    value={settingsForm.targetDailyBusinessProfit !== undefined && settingsForm.targetDailyBusinessProfit > 0 ? settingsForm.targetDailyBusinessProfit : ''}
                    placeholder="e.g. 350"
                    onChange={handleInputChange}
                    className="pl-9 h-9 text-xs font-semibold"
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Used by the Rate Projection Engine to calculate the minimum booking rate required for this net business profit per operational day.
                </p>
              </div>

              {/* Default Payroll % */}
              <div>
                <Label htmlFor="payrollPercentage" className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <Percent className="h-3.5 w-3.5 text-blue-600" />
                  Default Payroll Percentage (%)
                </Label>
                <div className="relative mt-1">
                  <Percent className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="payrollPercentage"
                    name="payrollPercentage"
                    type="number"
                    step="1"
                    min="0"
                    max="100"
                    value={settingsForm.payrollPercentage ?? 25}
                    onChange={handleInputChange}
                    className="pl-9 h-9 text-xs font-semibold"
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Fallback driver pay percentage for loads when no specific driver profile is assigned.
                </p>
              </div>
            </div>

            <Separator />

            {/* Operating Cost Per Mile & Monthly Maintenance */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <Label htmlFor="defaultOperatingCostPerMile" className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <Gauge className="h-3.5 w-3.5 text-slate-500" />
                  Default Operating Cost Per Mile ($/mi)
                </Label>
                <div className="relative mt-1">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="defaultOperatingCostPerMile"
                    name="defaultOperatingCostPerMile"
                    type="number"
                    step="0.01"
                    value={settingsForm.defaultOperatingCostPerMile || 0}
                    onChange={handleInputChange}
                    className="pl-9 h-9 text-xs font-semibold"
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Baseline variable operating cost per mile (Loaded + Deadhead) for wear-and-tear and preventative maintenance.
                </p>
              </div>

              <div>
                <Label htmlFor="monthlyMaintenance" className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <Wrench className="h-3.5 w-3.5 text-amber-600" />
                  Monthly Fleet Maintenance Reserve ($/mo)
                </Label>
                <div className="relative mt-1">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="monthlyMaintenance"
                    name="monthlyMaintenance"
                    type="number"
                    step="50"
                    value={settingsForm.monthlyMaintenance || ''}
                    placeholder="e.g. 500"
                    onChange={handleInputChange}
                    className="pl-9 h-9 text-xs font-semibold"
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Monthly allocation set aside across the fleet for commercial tires, brakes, and unexpected repairs.
                </p>
              </div>
            </div>

            <Separator />

            {/* Benchmark Fuel & DEF Prices */}
            <div>
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Fuel className="h-3.5 w-3.5 text-amber-600" />
                Benchmark Fuel & DEF Fallback Prices
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <Label htmlFor="defaultFuelCostPerGallon" className="text-xs font-semibold text-slate-700">
                    Default Diesel Price ($/gal)
                  </Label>
                  <div className="relative mt-1">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      id="defaultFuelCostPerGallon"
                      name="defaultFuelCostPerGallon"
                      type="number"
                      step="0.01"
                      value={settingsForm.defaultFuelCostPerGallon || 0}
                      onChange={handleInputChange}
                      className="pl-9 h-9 text-xs font-semibold"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Used to estimate fuel expense when real-time station prices are unavailable.
                  </p>
                </div>

                <div>
                  <Label htmlFor="defCostPerGallon" className="text-xs font-semibold text-slate-700">
                    Default DEF Price ($/gal)
                  </Label>
                  <div className="relative mt-1">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      id="defCostPerGallon"
                      name="defCostPerGallon"
                      type="number"
                      step="0.01"
                      value={settingsForm.defCostPerGallon || 0}
                      onChange={handleInputChange}
                      className="pl-9 h-9 text-xs font-semibold"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Estimated Diesel Exhaust Fluid price (calculated at 2.5% of diesel consumption).
                  </p>
                </div>
              </div>
            </div>

            <Separator />

            {/* Company Driver Pay Model */}
            <div>
              <Label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-2">
                Default Company Driver Pay Model
              </Label>
              <RadioGroup
                value={settingsForm.defaultDriverPayType || 'percentage'}
                onValueChange={(val) =>
                  setSettingsForm(prev => ({ ...prev, defaultDriverPayType: val as 'percentage' | 'per-mile' | 'hourly' }))
                }
                className="flex flex-wrap gap-x-6 gap-y-2 mt-1"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="percentage" id="pay-model-pct" />
                  <Label htmlFor="pay-model-pct" className="font-normal text-xs cursor-pointer">% of Load Gross (Standard)</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="per-mile" id="pay-model-mile" />
                  <Label htmlFor="pay-model-mile" className="font-normal text-xs cursor-pointer">Cents Per Mile (CPM)</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="hourly" id="pay-model-hourly" />
                  <Label htmlFor="pay-model-hourly" className="font-normal text-xs cursor-pointer">Hourly Rate</Label>
                </div>
              </RadioGroup>

              {settingsForm.defaultDriverPayType === 'hourly' && (
                <div className="mt-3 max-w-xs">
                  <Label htmlFor="defaultDriverHourlyRate" className="text-xs font-medium text-slate-700">
                    Default Driver Hourly Rate ($/hr)
                  </Label>
                  <div className="relative mt-1">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      id="defaultDriverHourlyRate"
                      name="defaultDriverHourlyRate"
                      type="number"
                      step="0.50"
                      min="0"
                      value={settingsForm.defaultDriverHourlyRate ?? 25}
                      onChange={handleInputChange}
                      className="pl-9 h-9 text-xs font-semibold"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Trip hours estimated from miles ÷ average speed when driver has no explicit hours.
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── TAB 2: Truck & Trailer Defaults ─────────────────────────── */}
      {activeAssetType === 'global' && activeTab === 'truck-trailer' && (
        <Card className="border border-slate-200 shadow-sm bg-white rounded-xl">
          <CardHeader className="pb-4 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
                <TruckIcon className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-lg font-bold text-slate-900">Truck &amp; Trailer Defaults</CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Global equipment specifications, highway speeds, fuel mileage, and cargo deck buffers.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-5 space-y-6">
            {/* Speed, MPG, and Cargo Buffer */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* Truck MPG */}
              <div>
                <Label htmlFor="truckMpg" className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <Fuel className="h-3.5 w-3.5 text-amber-600" />
                  Default Truck Fuel Efficiency (MPG)
                </Label>
                <div className="relative mt-1">
                  <Fuel className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="truckMpg"
                    name="truckMpg"
                    type="number"
                    step="0.1"
                    value={settingsForm.truckMpg || 10}
                    onChange={handleInputChange}
                    className="pl-9 h-9 text-xs font-semibold"
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Average loaded diesel fuel economy (e.g. 10.5 MPG) used to calculate trip fuel burn.
                </p>
              </div>

              {/* Truck Average Speed */}
              <div>
                <Label htmlFor="truckAverageSpeed" className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <GaugeCircle className="h-3.5 w-3.5 text-blue-600" />
                  Average Highway Speed (MPH)
                </Label>
                <div className="relative mt-1">
                  <GaugeCircle className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="truckAverageSpeed"
                    name="truckAverageSpeed"
                    type="number"
                    value={settingsForm.truckAverageSpeed || 62}
                    onChange={handleInputChange}
                    className="pl-9 h-9 text-xs font-semibold"
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Used to estimate driving duration, delivery dates, and HOS driving shifts.
                </p>
              </div>

              {/* Cargo Safety Buffer */}
              <div>
                <Label htmlFor="CARGO_SAFETY_BUFFER" className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <Package className="h-3.5 w-3.5 text-indigo-600" />
                  Cargo Safety Buffer (ft)
                </Label>
                <div className="relative mt-1">
                  <Package className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="CARGO_SAFETY_BUFFER"
                    name="CARGO_SAFETY_BUFFER"
                    type="number"
                    step="0.01"
                    value={settingsForm.CARGO_SAFETY_BUFFER ?? settingsForm.cargoSafetyBuffer ?? 0.33}
                    onChange={handleInputChange}
                    className="pl-9 h-9 text-xs font-semibold"
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Spacing added between units (e.g. 0.33 ft = 4 inches) for tie-downs and chains.
                </p>
              </div>
            </div>

            <Separator />

            {/* Trailer Default Specifications */}
            <div>
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <TruckIcon className="h-3.5 w-3.5 text-blue-600" />
                Default Trailer Configuration
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <Label htmlFor="trailerType" className="text-xs font-semibold text-slate-700">
                    Trailer Type Description
                  </Label>
                  <Input
                    id="trailerType"
                    name="trailerType"
                    value={settingsForm.trailerType || ''}
                    onChange={handleInputChange}
                    placeholder="e.g. 40ft Gooseneck Flatbed with Mega Ramps"
                    className="mt-1 h-9 text-xs"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">General trailer classification for load matching.</p>
                </div>

                <div>
                  <Label htmlFor="trailerDimensions" className="text-xs font-semibold text-slate-700">
                    Trailer Dimensions (Length x Width)
                  </Label>
                  <Input
                    id="trailerDimensions"
                    name="trailerDimensions"
                    value={settingsForm.trailerDimensions || ''}
                    onChange={handleInputChange}
                    placeholder="e.g. 40ft x 102in"
                    className="mt-1 h-9 text-xs"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">Usable deck dimensions.</p>
                </div>

                <div>
                  <Label htmlFor="trailerDeckHeight" className="text-xs font-semibold text-slate-700">
                    Deck Height (inches)
                  </Label>
                  <Input
                    id="trailerDeckHeight"
                    name="trailerDeckHeight"
                    value={settingsForm.trailerDeckHeight || ''}
                    onChange={handleInputChange}
                    placeholder="e.g. 36"
                    className="mt-1 h-9 text-xs"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Used to calculate legal 13.5 ft maximum height clearance (Cargo Height + Deck Height).
                  </p>
                </div>

                <div>
                  <Label className="text-xs font-semibold text-slate-700 block mb-1.5">
                    Hitch Type
                  </Label>
                  <RadioGroup
                    value={settingsForm.trailerHitchType || 'gooseneck'}
                    onValueChange={handleRadioChange}
                    className="flex items-center gap-6 mt-2"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="gooseneck" id="hitch-gn" />
                      <Label htmlFor="hitch-gn" className="font-normal text-xs cursor-pointer">Gooseneck (Standard Hotshot)</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="fifth-wheel" id="hitch-5th" />
                      <Label htmlFor="hitch-5th" className="font-normal text-xs cursor-pointer">Fifth Wheel</Label>
                    </div>
                  </RadioGroup>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── TAB 3: Carrier Information ─────────────────────────────── */}
      {activeAssetType === 'global' && activeTab === 'carrier' && (
        <Card className="border border-slate-200 shadow-sm bg-white rounded-xl">
          <CardHeader className="pb-4 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100">
                <Building className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-lg font-bold text-slate-900">Carrier Authority &amp; Contact Information</CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Business name, US DOT, MC number, and contact details printed on BOLs, rate confirmations, and invoices.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-5 space-y-5">
            {isOwnerOrAdmin && (
              <div className="p-3.5 rounded-xl bg-blue-50/80 border border-blue-200 flex items-start justify-between gap-3 text-xs">
                <div className="flex items-start gap-2.5">
                  <ShieldCheck className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-blue-900 block">Owner / Developer Bypass Active</span>
                    <span className="text-blue-800 text-[11px] leading-relaxed">
                      This authenticated session ({user?.email}) has full Fleet Pro access at no cost, unlimited trucks &amp; drivers, and USDOT exemption. This rule persists across all domains.
                    </span>
                  </div>
                </div>
                <Badge className="bg-blue-600 text-white shrink-0 text-[10px]">Owner</Badge>
              </div>
            )}

            {/* Carrier Name */}
            <div>
              <Label htmlFor="carrierName" className="text-xs font-semibold text-slate-700">
                Carrier Legal Business Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="carrierName"
                name="carrierName"
                value={settingsForm.carrierName || ''}
                onChange={handleInputChange}
                placeholder="e.g. Swift Shot Transport LLC"
                className="mt-1 h-9 text-xs font-medium"
              />
            </div>

            {/* DOT & MC Numbers */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label htmlFor="carrierDotNumber" className="text-xs font-semibold text-slate-700">
                    US DOT Number
                  </Label>
                  {isOwnerOrAdmin ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                      <ShieldCheck className="h-3 w-3 text-blue-600" />
                      Owner Bypass (DOT Exempt)
                    </span>
                  ) : settingsForm.carrierDotNumber && (
                    trial.verificationStatus === 'valid_verified' || trial.dotVerification === 'verified' || user?.dotVerificationStatus === 'valid_verified' ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                        Verified Carrier
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200" title="We couldn't verify this DOT right now. You can continue, and we may re-check later.">
                        <Info className="h-3 w-3 text-amber-600" />
                        Verification Pending
                      </span>
                    )
                  )}
                </div>
                <div className="relative mt-1">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="carrierDotNumber"
                    name="carrierDotNumber"
                    value={settingsForm.carrierDotNumber || ''}
                    onChange={handleInputChange}
                    placeholder="e.g. 1234567"
                    className="pl-9 h-9 text-xs font-mono"
                  />
                </div>
                {(trial.carrierLegalName || user?.carrierLegalName) && (
                  <p className="text-[10px] text-slate-500 mt-1">
                    FMCSA Record: <span className="font-semibold text-slate-700">{trial.carrierLegalName || user?.carrierLegalName}</span> {trial.carrierState || user?.carrierState ? `(${trial.carrierState || user?.carrierState})` : ''}
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="carrierMcNumber" className="text-xs font-semibold text-slate-700">
                  MC / Docket Number
                </Label>
                <div className="relative mt-1">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="carrierMcNumber"
                    name="carrierMcNumber"
                    value={settingsForm.carrierMcNumber || ''}
                    onChange={handleInputChange}
                    placeholder="e.g. 987654"
                    className="pl-9 h-9 text-xs font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Carrier Physical Address */}
            <div className="pt-1">
              <Label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-2">
                Carrier Base Address
              </Label>
              <div className="bg-slate-50/70 border border-slate-200/80 rounded-lg p-3">
                <AddressFields 
                  label="Carrier Address"
                  address={settingsForm.carrierAddress}
                  onChange={handleCarrierAddressChange}
                  hideCompany={true}
                  hideContact={true}
                  enableAutocomplete={true}
                />
              </div>
            </div>

            <Separator />

            {/* Contact Person */}
            <div>
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-blue-600" />
                Authorized Dispatch &amp; Billing Contact
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="carrierContactName" className="text-xs font-medium text-slate-700">
                    Contact Full Name
                  </Label>
                  <div className="relative mt-1">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      id="carrierContactName"
                      name="carrierContactName"
                      value={settingsForm.carrierContactName || ''}
                      onChange={handleInputChange}
                      placeholder="e.g. John Doe"
                      className="pl-9 h-9 text-xs"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="carrierContactPhone" className="text-xs font-medium text-slate-700">
                    Contact Phone
                  </Label>
                  <div className="relative mt-1">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      id="carrierContactPhone"
                      name="carrierContactPhone"
                      type="tel"
                      value={settingsForm.carrierContactPhone || ''}
                      onChange={handleInputChange}
                      onPaste={(e) => handlePhonePaste(e, (sanitized) => setSettingsForm(prev => ({ ...prev, carrierContactPhone: sanitized })))}
                      placeholder="e.g. 555-123-4567"
                      maxLength={14}
                      className="pl-9 h-9 text-xs"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="carrierContactEmail" className="text-xs font-medium text-slate-700">
                    Contact Email
                  </Label>
                  <div className="relative mt-1">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      id="carrierContactEmail"
                      name="carrierContactEmail"
                      type="email"
                      value={settingsForm.carrierContactEmail || ''}
                      onChange={handleInputChange}
                      placeholder="e.g. dispatch@carrier.com"
                      className="pl-9 h-9 text-xs"
                    />
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── TAB 4: Contract Defaults & Billing Terms ─────────────────── */}
      {activeAssetType === 'global' && activeTab === 'contracts' && (
        <Card className="border border-slate-200 shadow-sm bg-white rounded-xl">
          <CardHeader className="pb-4 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-100">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-lg font-bold text-slate-900">Contract &amp; Billing Defaults</CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Standard loading fees, detention hourly rates, and contractual clauses included in rate confirmations.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-5 space-y-5">
            {/* Loading Fee & Detention Rate */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <Label htmlFor="loadingFee" className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <DollarSign className="h-3.5 w-3.5 text-slate-500" />
                  Default Loading / Tarping Fee ($)
                </Label>
                <div className="relative mt-1">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="loadingFee"
                    name="loadingFee"
                    type="number"
                    step="0.01"
                    value={settingsForm.loadingFee === undefined ? '' : settingsForm.loadingFee}
                    onChange={handleInputChange}
                    placeholder="e.g. 50.00"
                    className="pl-9 h-9 text-xs font-semibold"
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Optional standard accessorial fee for specialized tarping, forklift assistance, or ramp work.
                </p>
              </div>

              <div>
                <Label htmlFor="detentionFeeRate" className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <DollarSign className="h-3.5 w-3.5 text-slate-500" />
                  Default Detention Rate ($/hr)
                </Label>
                <div className="relative mt-1">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="detentionFeeRate"
                    name="detentionFeeRate"
                    type="number"
                    step="0.01"
                    value={settingsForm.detentionFeeRate === undefined ? '' : settingsForm.detentionFeeRate}
                    onChange={handleInputChange}
                    placeholder="e.g. 75.00"
                    className="pl-9 h-9 text-xs font-semibold"
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Hourly fee billed to brokers/shippers when shipper wait time exceeds the standard 2-hour free time window.
                </p>
              </div>
            </div>

            <Separator />

            {/* Special Terms Textarea */}
            <div>
              <Label htmlFor="defaultSpecialTerms" className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-purple-600" />
                Default Special Terms for Contracts &amp; Confirmations
              </Label>
              <Textarea
                id="defaultSpecialTerms"
                name="defaultSpecialTerms"
                value={settingsForm.defaultSpecialTerms || ''}
                onChange={handleInputChange}
                placeholder="Enter standard terms, payment conditions, cargo claims protocols, and cancellation policies that apply to all dispatch agreements..."
                rows={5}
                className="mt-1 text-xs resize-y"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                These terms are automatically attached to generated rate agreements, broker packets, and shipper confirmation PDFs.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── TAB 5: Recurring Fleet Overhead ─────────────────────────── */}
      {activeAssetType === 'global' && activeTab === 'recurring' && (
        <Card className="border border-slate-200 shadow-sm bg-white rounded-xl">
          <CardHeader className="pb-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-2.5 min-w-0">
              <div className="h-9 w-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100 shrink-0">
                <Repeat className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <CardTitle className="text-lg font-bold text-slate-900">Fleet-Level Recurring Overhead</CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Fixed company-wide expenses (yard rent, software, legal, insurance) factored into fleet break-even calculations.
                </CardDescription>
              </div>
            </div>

            <Button 
              type="button"
              variant="outline" 
              size="sm" 
              onClick={addRecurringExpense} 
              className="h-8 text-xs font-semibold bg-white border-slate-300 text-slate-700 hover:bg-slate-50 gap-1.5 self-start sm:self-auto shrink-0"
            >
              <PlusCircle className="h-3.5 w-3.5 text-emerald-600" />
              Add Expense Line
            </Button>
          </CardHeader>

          <CardContent className="pt-5 space-y-4">
            <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-lg text-xs text-blue-900 leading-relaxed flex items-start gap-2">
              <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
              <span>
                <strong>Fleet Overhead vs. Vehicle Costs:</strong> Configure company-wide flat overhead here. Per-truck costs (specific truck loans, truck insurance, ELD per unit) belong on each individual vehicle card in <strong>Drivers &amp; Fleet</strong>.
              </span>
            </div>

            {/* Recurring Expenses List */}
            {(!settingsForm.recurringExpenses || settingsForm.recurringExpenses.length === 0) ? (
              <div className="text-center py-10 px-4 bg-slate-50 border border-dashed border-slate-200 rounded-xl">
                <Repeat className="h-10 w-10 text-slate-400 mx-auto mb-2" />
                <h4 className="text-sm font-semibold text-slate-700">No recurring overhead added yet</h4>
                <p className="text-xs text-slate-400 mt-0.5 max-w-sm mx-auto">
                  Add flat monthly expenses (yard rent, dispatch software, bookkeeping) to ensure accurate rate projections.
                </p>
                <Button
                  type="button"
                  size="sm"
                  onClick={addRecurringExpense}
                  className="mt-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold h-8 shadow-xs gap-1"
                >
                  <PlusCircle className="h-3.5 w-3.5" />
                  Add First Recurring Line
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {(() => {
                  const CATEGORY_META: Record<string, { color: string; bg: string; border: string }> = {
                    'Facility & Base':    { color: 'text-blue-700',   bg: 'bg-blue-50',   border: 'border-blue-200' },
                    'Tech & Comms':       { color: 'text-violet-700', bg: 'bg-violet-50', border: 'border-violet-200' },
                    'Corporate & Legal':  { color: 'text-rose-700',   bg: 'bg-rose-50',   border: 'border-rose-200' },
                    'Administrative':     { color: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-200' },
                  };
                  const CATEGORY_ORDER = ['Facility & Base', 'Tech & Comms', 'Corporate & Legal', 'Administrative'];

                  const categorized: Record<string, { item: RecurringExpenseItem; index: number }[]> = {};
                  const uncategorized: { item: RecurringExpenseItem; index: number }[] = [];

                  (settingsForm.recurringExpenses || []).forEach((item, index) => {
                    const cat = item.category || '';
                    if (CATEGORY_ORDER.includes(cat)) {
                      if (!categorized[cat]) categorized[cat] = [];
                      categorized[cat].push({ item, index });
                    } else {
                      uncategorized.push({ item, index });
                    }
                  });

                  const renderSection = (cat: string, entries: { item: RecurringExpenseItem; index: number }[]) => {
                    const meta = CATEGORY_META[cat] || { color: 'text-slate-700', bg: 'bg-slate-50', border: 'border-slate-200' };
                    const subtotal = entries.reduce((s, { item }) => s + (item.amount || 0), 0);
                    return (
                      <div key={cat} className={`rounded-xl border ${meta.border} overflow-hidden shadow-2xs`}>
                        <div className={`flex items-center justify-between px-3.5 py-2 ${meta.bg}`}>
                          <span className={`text-[11px] font-bold uppercase tracking-wider ${meta.color}`}>{cat}</span>
                          <span className={`text-xs font-bold ${meta.color}`}>${subtotal.toLocaleString()}/mo</span>
                        </div>
                        <div className="divide-y divide-slate-100 bg-white">
                          {entries.map(({ item, index }) => (
                            <div key={index} className="flex flex-col sm:flex-row sm:items-center gap-2 px-3 py-2.5 hover:bg-slate-50/70 transition-colors">
                              <div className="flex items-center gap-2 w-full sm:w-auto sm:shrink-0">
                                <select
                                  value={item.category || ''}
                                  onChange={(e) => updateRecurringExpense(index, 'category', e.target.value)}
                                  className="text-[11px] border border-slate-200 rounded-md px-2 py-1 bg-white text-slate-700 flex-1 min-w-0 sm:flex-none sm:w-36 h-9 sm:h-8 font-medium"
                                >
                                  {CATEGORY_ORDER.map(c => <option key={c} value={c}>{c}</option>)}
                                  <option value="">Uncategorized</option>
                                </select>
                                <Button 
                                  type="button"
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-9 w-9 sm:hidden shrink-0 text-slate-400 hover:text-red-600 hover:bg-red-50" 
                                  onClick={() => removeRecurringExpense(index)} 
                                  title="Remove Line"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                              <div className="flex items-center gap-2 w-full sm:flex-1 sm:min-w-0">
                                <Input
                                  value={item.name}
                                  onChange={(e) => updateRecurringExpense(index, 'name', e.target.value)}
                                  placeholder="Expense description (e.g. Yard Lease)"
                                  className="flex-1 min-w-0 h-9 sm:h-8 text-xs"
                                />
                                <div className="relative shrink-0 w-28 sm:w-32">
                                  <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                                  <Input
                                    type="number"
                                    inputMode="decimal"
                                    step="any"
                                    value={item.amount === 0 ? '' : item.amount}
                                    onChange={(e) => updateRecurringExpense(index, 'amount', e.target.value)}
                                    placeholder="0.00"
                                    className="pl-7 h-9 sm:h-8 text-xs font-semibold"
                                  />
                                </div>
                              </div>
                              <Button 
                                type="button"
                                variant="ghost" 
                                size="icon" 
                                className="hidden sm:inline-flex h-8 w-8 shrink-0 text-slate-400 hover:text-red-600 hover:bg-red-50" 
                                onClick={() => removeRecurringExpense(index)} 
                                title="Remove Line"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  };

                  return (
                    <div className="space-y-3.5">
                      {CATEGORY_ORDER.map(cat =>
                        (categorized[cat]?.length ?? 0) > 0
                          ? renderSection(cat, categorized[cat])
                          : null
                      )}
                      {uncategorized.length > 0 && renderSection('Uncategorized', uncategorized)}

                      {/* Total Bar */}
                      <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-slate-900 text-white shadow-sm mt-4">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-300">Total Monthly Fleet Overhead</span>
                        <span className="text-base font-extrabold tabular-nums">
                          ${recurringGrandTotal.toLocaleString()}<span className="text-slate-400 font-normal text-xs">/mo</span>
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── TAB 6: Asset Profile Overrides Selector ─────────────────── */}
      {activeAssetType === 'global' && activeTab === 'assets' && (
        <Card className="border border-slate-200 shadow-sm bg-white rounded-xl">
          <CardHeader className="pb-4 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
                <Layers className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-lg font-bold text-slate-900">Fleet Asset Overrides</CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Select a specific truck, trailer, or driver to edit asset-specific CPM, insurance burn rate, or pay logic.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-5 space-y-6">
            {/* Trucks */}
            <div>
              <Label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-2">
                Power Units (Trucks)
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {vehicles.filter(v => v.type === 'truck').map(truck => (
                  <button
                    key={truck.id}
                    type="button"
                    onClick={() => handleAssetSelect(`truck-${truck.id}`)}
                    className="p-3 rounded-xl border border-slate-200 hover:border-blue-500 hover:shadow-xs transition-all text-left bg-white group flex items-center justify-between"
                  >
                    <div>
                      <div className="text-xs font-bold text-slate-900 group-hover:text-blue-600">
                        #{truck.unitNumber} {truck.name}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {truck.make} {truck.model} • {truck.mpg || 10} MPG
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-blue-600" />
                  </button>
                ))}
              </div>
            </div>

            <Separator />

            {/* Trailers */}
            <div>
              <Label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-2">
                Trailers
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {vehicles.filter(v => v.type === 'trailer').map(trailer => (
                  <button
                    key={trailer.id}
                    type="button"
                    onClick={() => handleAssetSelect(`trailer-${trailer.id}`)}
                    className="p-3 rounded-xl border border-slate-200 hover:border-blue-500 hover:shadow-xs transition-all text-left bg-white group flex items-center justify-between"
                  >
                    <div>
                      <div className="text-xs font-bold text-slate-900 group-hover:text-blue-600">
                        TRL-#{trailer.unitNumber} {trailer.name}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {trailer.trailerLength || 40}ft • {trailer.payloadCapacity ? `${trailer.payloadCapacity} lbs` : 'Flatbed'}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-blue-600" />
                  </button>
                ))}
              </div>
            </div>

            <Separator />

            {/* Drivers */}
            <div>
              <Label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-2">
                Driver Compensation Profiles
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {driverProfiles.map(driver => (
                  <button
                    key={driver.uid}
                    type="button"
                    onClick={() => handleAssetSelect(`driver-${driver.uid}`)}
                    className="p-3 rounded-xl border border-slate-200 hover:border-blue-500 hover:shadow-xs transition-all text-left bg-white group flex items-center justify-between"
                  >
                    <div>
                      <div className="text-xs font-bold text-slate-900 group-hover:text-blue-600">
                        {driver.name}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {driver.payType === 'hourly' ? `$${driver.payRate || 25}/hr` : `${driver.payRate || driver.payrollPercentage || 25}% of Gross`}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-blue-600" />
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── ASSET SPECIFIC EDIT VIEW (Truck / Trailer / Driver) ──────── */}
      {activeAssetType !== 'global' && (
        <Card className="border border-slate-200 shadow-sm bg-white rounded-xl">
          <CardHeader className="pb-4 border-b border-slate-100 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
                {activeAssetType === 'truck' ? <TruckIcon className="h-5 w-5" /> : activeAssetType === 'trailer' ? <Package className="h-5 w-5" /> : <User className="h-5 w-5" />}
              </div>
              <div>
                <CardTitle className="text-lg font-bold text-slate-900">
                  {activeAssetType === 'truck' ? `Truck Profile: ${assetForm?.unitNumber || 'New'}` : 
                   activeAssetType === 'trailer' ? `Trailer Profile: ${assetForm?.unitNumber || 'New'}` : 
                   `Driver Profile: ${assetForm?.name || 'New'}`}
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Configure asset specifications, monthly burn rates, and compensation overrides.
                </CardDescription>
              </div>
            </div>

            <Button variant="ghost" size="sm" onClick={() => handleAssetSelect('global')} className="text-xs text-slate-500">
              Back to Global Defaults
            </Button>
          </CardHeader>

          <CardContent className="pt-5 space-y-6">
            {/* TRUCK PROFILE EDIT */}
            {activeAssetType === 'truck' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="unitNumber" className="text-xs font-semibold text-slate-700">Unit Number</Label>
                    <Input id="unitNumber" name="unitNumber" value={assetForm?.unitNumber || ''} onChange={handleAssetInputChange} className="mt-1 h-9 text-xs" />
                  </div>
                  <div className="md:col-span-2">
                    <Label htmlFor="name" className="text-xs font-semibold text-slate-700">Description</Label>
                    <Input id="name" name="name" value={assetForm?.name || ''} onChange={handleAssetInputChange} className="mt-1 h-9 text-xs" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="gvwr" className="text-xs font-semibold text-slate-700">GVWR (lbs)</Label>
                    <Input id="gvwr" name="gvwr" type="number" value={assetForm?.gvwr || ''} onChange={handleAssetInputChange} className="mt-1 h-9 text-xs" placeholder="14000" />
                  </div>
                  <div>
                    <Label htmlFor="emptyWeight" className="text-xs font-semibold text-slate-700">Empty Tare Weight (lbs)</Label>
                    <Input id="emptyWeight" name="emptyWeight" type="number" value={assetForm?.emptyWeight || ''} onChange={handleAssetInputChange} className="mt-1 h-9 text-xs" placeholder="8000" />
                  </div>
                  <div>
                    <Label htmlFor="mpg" className="text-xs font-semibold text-slate-700">Fuel Efficiency (MPG)</Label>
                    <Input id="mpg" name="mpg" type="number" step="0.1" value={assetForm?.mpg || ''} onChange={handleAssetInputChange} className="mt-1 h-9 text-xs" />
                  </div>
                </div>

                <Separator />

                {/* Operating CPM Summary */}
                <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">Calculated Operating CPM</p>
                    <p className="text-2xl font-extrabold text-blue-700 mt-0.5">
                      ${calculateVehicleCPM(activeAssetId).toFixed(2)}/mi
                    </p>
                  </div>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="text-xs bg-white border-blue-200"
                    onClick={() => archiveVehicleCPM(activeAssetId)}
                  >
                    Archive Month
                  </Button>
                </div>

                {/* Monthly Recurring Expenses */}
                <div>
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
                    Monthly Recurring Asset Burn Rate
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <Label className="text-xs font-medium text-slate-600">Insurance ($/mo)</Label>
                      <Input 
                        type="number" 
                        value={assetForm?.monthlyRecurringExpenses?.insurance || 0} 
                        onChange={(e) => setAssetForm({ 
                          ...assetForm, 
                          monthlyRecurringExpenses: { ...assetForm.monthlyRecurringExpenses, insurance: Number(e.target.value) } 
                        })} 
                        className="mt-1 h-9 text-xs font-semibold"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-slate-600">Payment ($/mo)</Label>
                      <Input 
                        type="number" 
                        value={assetForm?.monthlyRecurringExpenses?.payment || 0} 
                        onChange={(e) => setAssetForm({ 
                          ...assetForm, 
                          monthlyRecurringExpenses: { ...assetForm.monthlyRecurringExpenses, payment: Number(e.target.value) } 
                        })} 
                        className="mt-1 h-9 text-xs font-semibold"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-slate-600">Maintenance ($/mo)</Label>
                      <Input 
                        type="number" 
                        value={assetForm?.monthlyRecurringExpenses?.maintenanceFund || 0} 
                        onChange={(e) => setAssetForm({ 
                          ...assetForm, 
                          monthlyRecurringExpenses: { ...assetForm.monthlyRecurringExpenses, maintenanceFund: Number(e.target.value) } 
                        })} 
                        className="mt-1 h-9 text-xs font-semibold"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-slate-600">ELD Telematics ($/mo)</Label>
                      <Input 
                        type="number" 
                        value={assetForm?.eldCostPerMonth || 0} 
                        onChange={(e) => setAssetForm({ ...assetForm, eldCostPerMonth: Number(e.target.value) })} 
                        className="mt-1 h-9 text-xs font-semibold"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TRAILER PROFILE EDIT */}
            {activeAssetType === 'trailer' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label className="text-xs font-semibold text-slate-700">Unit Number</Label>
                    <Input name="unitNumber" value={assetForm?.unitNumber || ''} onChange={handleAssetInputChange} className="mt-1 h-9 text-xs" />
                  </div>
                  <div className="md:col-span-2">
                    <Label className="text-xs font-semibold text-slate-700">Description</Label>
                    <Input name="name" value={assetForm?.name || ''} onChange={handleAssetInputChange} className="mt-1 h-9 text-xs" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <Label className="text-xs font-semibold text-slate-700">GVWR (lbs)</Label>
                    <Input name="gvwr" type="number" value={assetForm?.gvwr || ''} onChange={handleAssetInputChange} className="mt-1 h-9 text-xs" />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-slate-700">Tare Weight (lbs)</Label>
                    <Input name="emptyWeight" type="number" value={assetForm?.emptyWeight || ''} onChange={handleAssetInputChange} className="mt-1 h-9 text-xs" />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-slate-700">Deck Length (ft)</Label>
                    <Input name="trailerLength" type="number" value={assetForm?.trailerLength || ''} onChange={handleAssetInputChange} className="mt-1 h-9 text-xs" />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-slate-700">Deck Width (ft)</Label>
                    <Input name="trailerWidth" type="number" value={assetForm?.trailerWidth || ''} onChange={handleAssetInputChange} className="mt-1 h-9 text-xs" />
                  </div>
                </div>

                <Separator />

                <div>
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
                    Monthly Recurring Trailer Expenses
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label className="text-xs font-medium text-slate-600">Insurance ($/mo)</Label>
                      <Input 
                        type="number" 
                        value={assetForm?.monthlyRecurringExpenses?.insurance || 0} 
                        onChange={(e) => setAssetForm({ 
                          ...assetForm, 
                          monthlyRecurringExpenses: { ...assetForm.monthlyRecurringExpenses, insurance: Number(e.target.value) } 
                        })} 
                        className="mt-1 h-9 text-xs font-semibold"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-slate-600">Payment ($/mo)</Label>
                      <Input 
                        type="number" 
                        value={assetForm?.monthlyRecurringExpenses?.payment || 0} 
                        onChange={(e) => setAssetForm({ 
                          ...assetForm, 
                          monthlyRecurringExpenses: { ...assetForm.monthlyRecurringExpenses, payment: Number(e.target.value) } 
                        })} 
                        className="mt-1 h-9 text-xs font-semibold"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-slate-600">Maintenance ($/mo)</Label>
                      <Input 
                        type="number" 
                        value={assetForm?.monthlyRecurringExpenses?.maintenanceFund || 0} 
                        onChange={(e) => setAssetForm({ 
                          ...assetForm, 
                          monthlyRecurringExpenses: { ...assetForm.monthlyRecurringExpenses, maintenanceFund: Number(e.target.value) } 
                        })} 
                        className="mt-1 h-9 text-xs font-semibold"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* DRIVER PROFILE EDIT */}
            {activeAssetType === 'driver' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs font-semibold text-slate-700">Driver Name</Label>
                    <Input name="name" value={assetForm?.name || ''} onChange={handleAssetInputChange} className="mt-1 h-9 text-xs font-semibold" />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-slate-700 block mb-1.5">Pay Model</Label>
                    <RadioGroup 
                      value={assetForm?.payType || 'percentage'} 
                      onValueChange={(val) => setAssetForm({ ...assetForm, payType: val })}
                      className="flex items-center gap-4 mt-2"
                    >
                      <div className="flex items-center space-x-1.5">
                        <RadioGroupItem value="percentage" id="pay-pct-d" />
                        <Label htmlFor="pay-pct-d" className="text-xs cursor-pointer">% of Gross</Label>
                      </div>
                      <div className="flex items-center space-x-1.5">
                        <RadioGroupItem value="per-mile" id="pay-mile-d" />
                        <Label htmlFor="pay-mile-d" className="text-xs cursor-pointer">Per Mile</Label>
                      </div>
                      <div className="flex items-center space-x-1.5">
                        <RadioGroupItem value="hourly" id="pay-hr-d" />
                        <Label htmlFor="pay-hr-d" className="text-xs cursor-pointer">Hourly</Label>
                      </div>
                    </RadioGroup>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs font-semibold text-slate-700">
                      {assetForm?.payType === 'per-mile' ? 'Pay Rate ($/mi)' : assetForm?.payType === 'hourly' ? 'Hourly Rate ($/hr)' : 'Payroll Percentage (%)'}
                    </Label>
                    <Input 
                      type="number" 
                      value={assetForm?.payRate ?? assetForm?.payrollPercentage ?? ''} 
                      onChange={(e) => setAssetForm({ 
                        ...assetForm, 
                        payRate: Number(e.target.value), 
                        payrollPercentage: Number(e.target.value) 
                      })} 
                      className="mt-1 h-9 text-xs font-semibold"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-slate-700">Driver Unit / ID</Label>
                    <Input name="idNumber" value={assetForm?.idNumber || ''} onChange={handleAssetInputChange} className="mt-1 h-9 text-xs" />
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Platform Support & Legal Information ─────────────────────── */}
      {activeAssetType === 'global' && (
        <Card className="border border-slate-200 shadow-2xs bg-white rounded-2xl overflow-hidden mb-12">
          <CardHeader className="pb-3 border-b border-slate-100 bg-slate-50/50">
            <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-blue-600" />
              Platform Support &amp; Legal
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              PayloadLogic platform support escalation channels and active legal agreements.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-5 space-y-3 text-xs text-slate-600">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200/80">
              <div>
                <span className="font-bold text-slate-800 block">Fleet Technical &amp; Dispatch Support</span>
                <span className="text-slate-500 text-[11px]">Direct dispatcher support for rate formulas, break-even CPM calculations, or account issues.</span>
              </div>
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-blue-600 hover:text-blue-700 font-semibold text-xs shadow-2xs hover:bg-slate-50 shrink-0"
              >
                <Mail className="h-3.5 w-3.5" />
                {SUPPORT_EMAIL}
              </a>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px] text-slate-500">
              <span>PayloadLogic TMS &middot; All rights reserved</span>
              <div className="flex items-center gap-4">
                <Link href="/terms-of-service" target="_blank" className="hover:text-blue-600 underline">
                  Terms of Service
                </Link>
                <Link href="/privacy-policy" target="_blank" className="hover:text-blue-600 underline">
                  Privacy Policy
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Sticky Bottom Save Bar ───────────────────────────────────── */}
      <div className="fixed bottom-14 md:bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200 py-3 px-4 md:px-8 shadow-lg">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-semibold text-slate-700">
              {activeAssetType === 'global' ? 'Global Fleet Settings' : `Editing ${activeAssetType.toUpperCase()}: ${assetForm?.unitNumber || assetForm?.name || 'Asset'}`}
            </span>
          </div>
          <Button 
            onClick={handleSave} 
            disabled={isAppSubmitting}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-xs h-9 px-5 gap-1.5 rounded-lg"
          >
            <Save className="h-4 w-4" />
            {isAppSubmitting ? 'Saving Settings...' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </div>
  );
}
