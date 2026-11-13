'use client';

import React, { useState, useEffect, useCallback } from 'react';

// ── localStorage helpers ─────────────────────────────────────────────────────
const LS_TRUCK   = 'agy_fleet_truck_draft';
const LS_TRAILER = 'agy_fleet_trailer_draft';
const LS_DRIVER  = 'agy_fleet_driver_draft';

function lsGet<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function lsSet(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

function lsClear(...keys: string[]) {
  keys.forEach(k => { try { localStorage.removeItem(k); } catch {} });
}
import { useApp } from '@/context/AppContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Truck, Users, Plus, Trash2, Edit2, CheckCircle2, AlertCircle, Fuel, DollarSign, Calendar, ShieldCheck, ShieldAlert, RotateCcw, Clock, Mail, Copy, Eye, Route, ChevronRight, Sparkles, Lock, Info, Send, Phone, MapPin, HeartHandshake, Loader2, UserCheck } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { format, isValid } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { GcwrBlockModal } from './GcwrBlockModal';
import { sanitizePhoneDigits, handlePhonePaste, cn } from '@/lib/utils';
import { isDriverOffDuty, type DriverProfile, type DriverStatus } from '@/types';

const CDL_THRESHOLD = 26_000; // lbs — federal FMCSA / 49 CFR § 383.91

/**
 * Inline Pay Compensation editor for a driver card or detail modal.
 * Updates only payroll fields via updateDriverProfile so self-onboarded
 * compliance, license, and document data remain untouched.
 */
function DriverPayEditor({
  driver,
  onSavePay,
}: {
  driver: DriverProfile;
  onSavePay: (updates: Partial<DriverProfile>) => Promise<void>;
}) {
  const [payType, setPayType] = useState<'percentage' | 'per-mile' | 'hourly'>(
    driver.payType || 'percentage'
  );
  const initialRate =
    driver.payRate !== undefined && driver.payRate !== null
      ? String(driver.payRate)
      : driver.payrollPercentage !== undefined && driver.payrollPercentage !== null
      ? String(driver.payrollPercentage)
      : '';
  const [payRateStr, setPayRateStr] = useState<string>(initialRate);
  const [tripHoursStr, setTripHoursStr] = useState<string>(
    driver.estimatedTripHours !== undefined && driver.estimatedTripHours !== null
      ? String(driver.estimatedTripHours)
      : ''
  );
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setPayType(driver.payType || 'percentage');
    const nextRate =
      driver.payRate !== undefined && driver.payRate !== null
        ? String(driver.payRate)
        : driver.payrollPercentage !== undefined && driver.payrollPercentage !== null
        ? String(driver.payrollPercentage)
        : '';
    setPayRateStr(nextRate);
    setTripHoursStr(
      driver.estimatedTripHours !== undefined && driver.estimatedTripHours !== null
        ? String(driver.estimatedTripHours)
        : ''
    );
  }, [driver.uid, driver.payType, driver.payRate, driver.payrollPercentage, driver.estimatedTripHours]);

  const currentRate =
    driver.payRate !== undefined && driver.payRate !== null
      ? driver.payRate
      : driver.payrollPercentage;
  const hasSavedPay = currentRate !== undefined && currentRate !== null && !isNaN(Number(currentRate));
  const summaryLabel = !hasSavedPay
    ? 'Not Set'
    : (driver.payType || 'percentage') === 'per-mile'
    ? `$${Number(currentRate).toFixed(2)}/mi`
    : (driver.payType || 'percentage') === 'hourly'
    ? `$${Number(currentRate).toFixed(2)}/hr`
    : `${Number(currentRate)}% Gross`;

  const handleSave = async () => {
    const parsedRate = parseFloat(payRateStr);
    if (isNaN(parsedRate) || parsedRate < 0) return;

    const updates: Partial<DriverProfile> = {
      payType,
      payRate: parsedRate,
    };
    if (payType === 'percentage') {
      updates.payrollPercentage = parsedRate;
    }
    if (payType === 'hourly' && tripHoursStr.trim() !== '') {
      const parsedHours = parseFloat(tripHoursStr);
      if (!isNaN(parsedHours) && parsedHours >= 0) {
        updates.estimatedTripHours = parsedHours;
      }
    }

    setIsSaving(true);
    try {
      await onSavePay(updates);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-3 rounded-xl bg-emerald-50/50 border border-emerald-200/80 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-900 flex items-center gap-1">
          <DollarSign className="h-3 w-3 text-emerald-600" />
          Pay Compensation
        </span>
        <span
          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
            hasSavedPay
              ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
              : 'bg-amber-100 text-amber-800 border-amber-300'
          }`}
        >
          {summaryLabel}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="min-w-0">
          <label className="text-[10px] font-semibold text-slate-600 block mb-1">
            Pay Model
          </label>
          <select
            value={payType}
            onChange={(e) => setPayType(e.target.value as 'percentage' | 'per-mile' | 'hourly')}
            className="w-full h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="percentage">% of Load Gross</option>
            <option value="per-mile">Per Mile ($/mi)</option>
            <option value="hourly">Hourly Rate ($/hr)</option>
          </select>
        </div>

        <div className="min-w-0">
          <label className="text-[10px] font-semibold text-slate-600 block mb-1">
            {payType === 'per-mile'
              ? 'Rate ($ per mile)'
              : payType === 'hourly'
              ? 'Hourly Rate ($/hr)'
              : 'Payroll % of Gross'}
          </label>
          <Input
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            value={payRateStr}
            onChange={(e) => setPayRateStr(e.target.value)}
            placeholder={payType === 'percentage' ? 'e.g. 25' : payType === 'per-mile' ? 'e.g. 0.65' : 'e.g. 28'}
            className="h-8 text-xs font-semibold bg-white"
          />
        </div>
      </div>

      {payType === 'hourly' && (
        <div>
          <label className="text-[10px] font-semibold text-slate-600 block mb-1">
            Est. Trip Hours (optional)
          </label>
          <Input
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            value={tripHoursStr}
            onChange={(e) => setTripHoursStr(e.target.value)}
            placeholder="Auto-calculated if blank"
            className="h-8 text-xs bg-white"
          />
        </div>
      )}

      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          disabled={isSaving || payRateStr.trim() === '' || isNaN(parseFloat(payRateStr)) || parseFloat(payRateStr) < 0}
          onClick={handleSave}
          className="h-7 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
        >
          {isSaving ? 'Saving...' : 'Save Pay'}
        </Button>
      </div>
    </div>
  );
}

/**
 * Inline Contact & Basic Profile editor for a driver card or detail modal.
 * Updates only name, phone, email, and driverNotes so self-onboarded
 * compliance, license, and document data remain untouched.
 */
function DriverContactEditor({
  driver,
  onSaveContact,
}: {
  driver: DriverProfile;
  onSaveContact: (updates: Partial<DriverProfile>) => Promise<void>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(driver.name || '');
  const [phone, setPhone] = useState(driver.phone || '');
  const [email, setEmail] = useState(driver.email || '');
  const [notes, setNotes] = useState(driver.driverNotes || '');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setName(driver.name || '');
    setPhone(driver.phone || '');
    setEmail(driver.email || '');
    setNotes(driver.driverNotes || '');
  }, [driver.uid, driver.name, driver.phone, driver.email, driver.driverNotes]);

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    setIsSaving(true);
    try {
      await onSaveContact({
        name: trimmedName,
        phone: phone.trim(),
        email: email.trim(),
        driverNotes: notes.trim(),
      });
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isEditing) {
    return (
      <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1">
            <Phone className="h-3 w-3 text-blue-600" />
            Contact Info
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setIsEditing(true)}
            className="h-6 px-2 text-[11px] font-semibold text-blue-600 hover:text-blue-700 hover:bg-blue-50"
          >
            <Edit2 className="h-3 w-3 mr-1" />
            Edit
          </Button>
        </div>
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="text-slate-500">Phone:</span>
          <span className="font-semibold text-slate-800 truncate">{driver.phone || 'Not set'}</span>
        </div>
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="text-slate-500">Email:</span>
          <span className="font-semibold text-slate-800 truncate">{driver.email || 'Not set'}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 rounded-xl bg-blue-50/50 border border-blue-200 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-blue-900 flex items-center gap-1">
          <Edit2 className="h-3 w-3 text-blue-600" />
          Edit Contact &amp; Profile
        </span>
      </div>

      <div className="space-y-2">
        <div>
          <label className="text-[10px] font-semibold text-slate-600 block mb-1">Full Name</label>
          <Input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Driver full name"
            className="h-8 text-xs bg-white"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-semibold text-slate-600 block mb-1">Phone Number</label>
            <Input
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(555) 123-4567"
              className="h-8 text-xs bg-white"
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-slate-600 block mb-1">Email</label>
            <Input
              type="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="driver@email.com"
              className="h-8 text-xs bg-white"
            />
          </div>
        </div>
        <div>
          <label className="text-[10px] font-semibold text-slate-600 block mb-1">Notes (optional)</label>
          <Input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Driver notes..."
            className="h-8 text-xs bg-white"
          />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isSaving}
          onClick={() => {
            setName(driver.name || '');
            setPhone(driver.phone || '');
            setEmail(driver.email || '');
            setNotes(driver.driverNotes || '');
            setIsEditing(false);
          }}
          className="h-7 px-2.5 text-xs"
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={isSaving || !name.trim()}
          onClick={handleSave}
          className="h-7 px-3 text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold"
        >
          {isSaving ? 'Saving...' : 'Save Info'}
        </Button>
      </div>
    </div>
  );
}

export function DriverFleetPage() {
  const { toast } = useToast();
  const { 
    vehicles, driverProfiles, addVehicle, updateVehicle, deleteVehicle,
    addDriverProfile, updateDriverProfile, deleteDriverProfile,
    isSubmitting, setIsSubmitting, createDriverAccount,
    fleetSubTab, setFleetSubTab,
    trips,
    subscriptionTier,
    planLimits,
    trial,
    isOwnerOrAdmin,
    approveExtraTruck,
    setActiveTab: setNavTab,
    user,
    settingsForm,
  } = useApp();

  const activeTab = fleetSubTab;
  const setActiveTab = setFleetSubTab as (value: string) => void;
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [editingDriverUid, setEditingDriverUid] = useState<string | null>(null);
  const [gcwrBlock, setGcwrBlock] = useState<{ driverName: string; gcwr: number } | null>(null);
  const [editingHosDriverUid, setEditingHosDriverUid] = useState<string | null>(null);
  const [editingHosValue, setEditingHosValue] = useState<string>('');
  const [viewDetailsVehicle, setViewDetailsVehicle] = useState<any | null>(null);
  const [viewDetailsDriver, setViewDetailsDriver] = useState<any | null>(null);
  const [driverToDelete, setDriverToDelete] = useState<DriverProfile | null>(null);
  const [isDeletingDriver, setIsDeletingDriver] = useState(false);

  // Driver self-onboarding state
  const [isOnboardingModalOpen, setIsOnboardingModalOpen] = useState<boolean>(false);
  const [onboardingModalData, setOnboardingModalData] = useState<{
    driverName: string;
    inviteUrl: string;
    expiresAt: string;
    emailSent: boolean;
    driverEmail: string;
    driverPhone: string;
    companyName: string;
    previewUrl?: string;
  } | null>(null);
  const [isGeneratingOnboardingLink, setIsGeneratingOnboardingLink] = useState<boolean>(false);
  const [isSendInvitePromptOpen, setIsSendInvitePromptOpen] = useState<boolean>(false);
  const [quickInviteName, setQuickInviteName] = useState<string>('');
  const [quickInviteEmail, setQuickInviteEmail] = useState<string>('');
  const [quickInvitePhone, setQuickInvitePhone] = useState<string>('');

  // Plan limit dialog states
  const [showUpgradeModal, setShowUpgradeModal] = useState<boolean>(false);
  const [showExtraTruckConfirmModal, setShowExtraTruckConfirmModal] = useState<boolean>(false);

  const registeredTrucks = vehicles.filter(v => v.type === 'truck');
  const registeredTrailers = vehicles.filter(v => v.type === 'trailer');
  const truckCount = registeredTrucks.length;
  const driverCount = driverProfiles.length;
  const isStarter = subscriptionTier === 'starter';

  // ── Default blank shapes ──────────────────────────────────────────────────
  const defaultTruckForm = {
    unitNumber: '',
    name: '',
    isPaidOff: false,
    recurringExpenses: [] as { id: string; name: string; amount: number }[],
    monthlyRecurringExpenses: { insurance: 0, payment: 0, maintenanceFund: 0 },
    operatingCostPerMile: 0,
    estimatedMonthlyMiles: 10000,
    avgFuelPrice: 3.50,
    avgDefCostPerGallon: 4.50,
    mpg: 10,
    averageSpeed: 65,
    gvwr: 0,           // Truck GVWR — paper/sticker rating for CDL / weight compliance
  };

  const defaultTrailerForm = {
    unitNumber: '',
    name: '',
    isPaidOff: false,
    recurringExpenses: [] as { id: string; name: string; amount: number }[],
    monthlyRecurringExpenses: { insurance: 0, payment: 0, maintenanceFund: 0 },
    operatingCostPerMile: 0,
    mpg: 10,
    averageSpeed: 65,
    gvwr: 0,
    emptyWeight: 0,
    deckHeight: 0,
    trailerLength: 0,
    trailerWidth: 0,
    axleConfiguration: ''
  };

  const defaultDriverForm = {
    name: '',
    email: '',
    phone: '',
    cdlExpirationDate: '',
    medicalCardExpirationDate: '',
    assignedTruckId: '',
    assignedTrailerId: '',
    status: 'active' as DriverStatus,
    cdlStatus: 'Non-CDL' as 'Class A CDL' | 'Non-CDL',
    estimatedHosRemaining: 11.0,
    cdlNumber: '',
    licenseIssuingState: '',
    endorsements: [] as string[],
    additionalEndorsements: '',
    licenseFrontUrl: '',
    licenseFrontName: '',
    licenseBackUrl: '',
    licenseBackName: '',
    medicalCardUrl: '',
    medicalCardName: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    emergencyContactRelationship: '',
    homeAddress: '',
    homeCity: '',
    homeState: '',
    homeZip: '',
    driverNotes: '',
  };

  // ── Fleet Form State — pre-populated from localStorage on mount ───────────
  const [truckForm, setTruckForm] = useState(() =>
    lsGet(LS_TRUCK, defaultTruckForm)
  );

  const [trailerForm, setTrailerForm] = useState(() =>
    lsGet(LS_TRAILER, defaultTrailerForm)
  );

  const [activeAssetType, setActiveAssetType] = useState<'truck' | 'trailer'>('truck');

  // Driver Form State — pre-populated from localStorage on mount
  const [driverForm, setDriverForm] = useState(() =>
    lsGet(LS_DRIVER, defaultDriverForm)
  );

  // ── Sync form state → localStorage on every change ────────────────────────
  useEffect(() => { lsSet(LS_TRUCK,   truckForm);   }, [truckForm]);
  useEffect(() => { lsSet(LS_TRAILER, trailerForm); }, [trailerForm]);
  useEffect(() => { lsSet(LS_DRIVER,  driverForm);  }, [driverForm]);

  // ── Reset all fleet drafts ────────────────────────────────────────────────
  const handleResetFleetForms = useCallback(() => {
    lsClear(LS_TRUCK, LS_TRAILER, LS_DRIVER);
    setTruckForm(defaultTruckForm);
    setTrailerForm(defaultTrailerForm);
    setDriverForm(defaultDriverForm);
    toast({ title: 'Forms Reset', description: 'All fleet draft data cleared.' });
  }, []);
  useEffect(() => {
    if (activeAssetType === 'truck') {
      // ── operatingCostPerMile = MAINTENANCE RESERVE RATE ONLY ─────────────
      // This value is used as the "Maintenance" expense line on load cards and invoices.
      // It must NOT include fuel (fuel is calculated per-trip from miles/MPG).
      // It must NOT include insurance/payment (those are in the Overhead proration).
      // Formula: maintenanceFund per month ÷ estimated monthly miles = $/mi reserve
      //
      // The "Total CPM" (including fuel and all fixed costs) is shown below as an
      // informational display only and is not saved to this field.
      const maintenanceReserveRate = truckForm.estimatedMonthlyMiles > 0 && (truckForm.monthlyRecurringExpenses.maintenanceFund || 0) > 0
        ? (truckForm.monthlyRecurringExpenses.maintenanceFund || 0) / truckForm.estimatedMonthlyMiles
        : 0.20; // Default $0.20/mi maintenance reserve

      const roundedRate = Math.round(maintenanceReserveRate * 1000) / 1000;

      if (truckForm.operatingCostPerMile !== roundedRate) {
        setTruckForm(prev => ({ ...prev, operatingCostPerMile: roundedRate }));
      }
    }
  }, [
    truckForm.monthlyRecurringExpenses.maintenanceFund,
    truckForm.estimatedMonthlyMiles,
    activeAssetType,
    truckForm.operatingCostPerMile
  ]);


  const handleAddRecurringExpense = (type: 'truck' | 'trailer') => {
    const newExp = { id: Math.random().toString(36).substr(2, 9), name: '', amount: 0 };
    if (type === 'truck') {
      setTruckForm({ ...truckForm, recurringExpenses: [...truckForm.recurringExpenses, newExp] });
    } else {
      setTrailerForm({ ...trailerForm, recurringExpenses: [...trailerForm.recurringExpenses, newExp] });
    }
  };

  const handleUpdateRecurringExpense = (type: 'truck' | 'trailer', id: string, field: 'name' | 'amount', value: string | number) => {
    const processedValue = field === 'amount' ? (value === '' || isNaN(Number(value)) ? 0 : Number(value)) : value;
    if (type === 'truck') {
      setTruckForm({
        ...truckForm,
        recurringExpenses: truckForm.recurringExpenses.map(exp => exp.id === id ? { ...exp, [field]: processedValue } : exp)
      });
    } else {
      setTrailerForm({
        ...trailerForm,
        recurringExpenses: trailerForm.recurringExpenses.map(exp => exp.id === id ? { ...exp, [field]: processedValue } : exp)
      });
    }
  };


  const handleRemoveRecurringExpense = (type: 'truck' | 'trailer', id: string) => {
    if (type === 'truck') {
      setTruckForm({ ...truckForm, recurringExpenses: truckForm.recurringExpenses.filter(exp => exp.id !== id) });
    } else {
      setTrailerForm({ ...trailerForm, recurringExpenses: trailerForm.recurringExpenses.filter(exp => exp.id !== id) });
    }
  };

  const handleSaveAsset = async (type: 'truck' | 'trailer') => {
    console.log(`Attempting to save ${type}:`, type === 'truck' ? truckForm : trailerForm);
    
    const form = type === 'truck' ? truckForm : trailerForm;
    if (!form.unitNumber || !form.name) {
      console.warn("Validation failed: Unit # and Description are required.");
      toast({ variant: "destructive", title: "Error", description: "Unit # and Description are required." });
      return;
    }

    try {
      if (editingVehicleId) {
        console.log("Updating existing vehicle:", editingVehicleId);
        const submitForm = type === 'trailer' ? { ...form, payloadCapacity: trailerForm.gvwr - trailerForm.emptyWeight } : form;
        await updateVehicle(editingVehicleId, { ...submitForm, type });
        setEditingVehicleId(null);
      } else {
        console.log("Adding new vehicle to Firestore...");
        const submitForm = type === 'trailer' ? { ...form, payloadCapacity: trailerForm.gvwr - trailerForm.emptyWeight } : form;
        await addVehicle({ ...submitForm, type });
      }
      
      console.log("Resetting form after successful save.");
      if (type === 'truck') {
        lsClear(LS_TRUCK);
        setTruckForm(defaultTruckForm);
      } else {
        lsClear(LS_TRAILER);
        setTrailerForm(defaultTrailerForm);
      }
    } catch (error: any) {
      console.error("CRITICAL ERROR in handleSaveAsset:", error);
      toast({ variant: "destructive", title: "Save Failed", description: error.message || "An unexpected error occurred." });
    }
  };

  // ── Driver Login Account State ──
  const [driverLoginEmail, setDriverLoginEmail] = useState('');
  const [driverLoginPassword, setDriverLoginPassword] = useState('');
  const [isCreatingLogin, setIsCreatingLogin] = useState(false);
  const [generatedInviteLink, setGeneratedInviteLink] = useState<string | null>(null);
  const [driverCredentialsModal, setDriverCredentialsModal] = useState<{
    driverName: string;
    loginEmail: string;
    tempPassword: string;
    driverPortalUrl: string;
    loginUrl: string;
    emailSent?: boolean;
    smsShareUrl?: string | null;
    phone?: string;
    email?: string;
  } | null>(null);
  const [copiedCredField, setCopiedCredField] = useState('');

  const handleOpenOrProvisionCredentials = async (driver: any) => {
    if (driver.driverPortalUrl && driver.loginEmail && driver.tempPassword) {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const smsText = `PayloadLogic — Your limited Driver View account is ready!\n\nDirect Driver View Link:\n${driver.driverPortalUrl}\n\nOr sign in at ${origin}/login\nLogin: ${driver.loginEmail}\nPassword: ${driver.tempPassword}`;
      setDriverCredentialsModal({
        driverName: driver.name,
        loginEmail: driver.loginEmail,
        tempPassword: driver.tempPassword,
        driverPortalUrl: driver.driverPortalUrl,
        loginUrl: `${origin}/login`,
        emailSent: Boolean(driver.email && driver.email.includes('@')),
        smsShareUrl: driver.phone ? `sms:${driver.phone}?body=${encodeURIComponent(smsText)}` : null,
        phone: driver.phone,
        email: driver.email,
      });
      return;
    }

    try {
      setIsCreatingLogin(true);
      const result = await createDriverAccount(driver.email || '', '', driver);
      if ('code' in result) {
        toast({ variant: 'destructive', title: 'Could Not Provision Login', description: result.message });
        return;
      }
      setDriverCredentialsModal({
        driverName: driver.name,
        loginEmail: result.loginEmail || driver.email || '',
        tempPassword: result.tempPassword || '',
        driverPortalUrl: result.driverPortalUrl || '',
        loginUrl: result.loginUrl || '/login',
        emailSent: result.emailSent,
        smsShareUrl: result.smsShareUrl,
        phone: driver.phone,
        email: driver.email,
      });
    } finally {
      setIsCreatingLogin(false);
    }
  };


  const handleSaveDriver = async () => {
    console.log("Attempting to save driver profile:", driverForm);
    
    if (!driverForm.name) {
      console.warn("Validation failed: Driver Name is required.");
      toast({ variant: "destructive", title: "Validation Error", description: "Driver Name is required." });
      return;
    }

    // ── FMCSA Class A CDL Compliance Check ──────────────────────────────────────
    // FMCSA 49 CFR § 383.91 — Class A CDL required when:
    //   Rule A: Towed unit (trailer) GVWR > 10,000 lbs  AND
    //   Rule B: Combined GCWR (truck + trailer) > 26,000 lbs
    const effectiveCdlStatus = driverForm.cdlStatus ?? 'Non-CDL';
    if (effectiveCdlStatus === 'Non-CDL' && driverForm.assignedTruckId && driverForm.assignedTrailerId) {
      const assignedTruck   = vehicles.find(v => v.id === driverForm.assignedTruckId && v.type === 'truck');
      const assignedTrailer = vehicles.find(v => v.id === driverForm.assignedTrailerId && v.type === 'trailer');
      const truckGvwr   = (assignedTruck as any)?.gvwr ?? 0;
      const trailerGvwr = assignedTrailer?.gvwr ?? 0;
      if (truckGvwr > 0 && trailerGvwr > 0) {
        const gcwr = truckGvwr + trailerGvwr;
        // Require BOTH FMCSA rules to trigger the block
        const ruleA = trailerGvwr > 10_000;
        const ruleB = gcwr > CDL_THRESHOLD;
        if (ruleA && ruleB) {
          setGcwrBlock({ driverName: driverForm.name, gcwr });
          return; // Hard block — do not proceed to save
        }
      }
    }

    try {
      if (editingDriverUid) {
        console.log("Updating existing driver:", editingDriverUid);
        await updateDriverProfile(editingDriverUid, { ...driverForm, cdlStatus: driverForm.cdlStatus ?? 'Non-CDL' });
        setEditingDriverUid(null);
      } else {
        // ── Always create driver profile + limited Driver View account ──────────
        setIsCreatingLogin(true);
        const effectiveEmail = (driverLoginEmail || driverForm.email || '').trim();
        const profileForAccount = {
          ...driverForm,
          email: effectiveEmail,
          uid: '',
          cdlStatus: (driverForm.cdlStatus ?? 'Non-CDL') as 'Class A CDL' | 'Non-CDL',
        };
        const result = await createDriverAccount(effectiveEmail, driverLoginPassword, profileForAccount);
        if ('code' in result) {
          toast({ variant: 'destructive', title: 'Account Creation Failed', description: result.message });
          return;
        }
        if (result.driverPortalUrl) {
          setGeneratedInviteLink(result.driverPortalUrl);
          setDriverCredentialsModal({
            driverName: driverForm.name,
            loginEmail: result.loginEmail || effectiveEmail,
            tempPassword: result.tempPassword || '',
            driverPortalUrl: result.driverPortalUrl,
            loginUrl: result.loginUrl || '/login',
            emailSent: result.emailSent,
            smsShareUrl: result.smsShareUrl,
            phone: driverForm.phone,
            email: effectiveEmail,
          });
        }
        setDriverLoginEmail('');
        setDriverLoginPassword('');
      }
      lsClear(LS_DRIVER);
      setDriverForm(defaultDriverForm);
    } catch (error: any) {
      console.error("CRITICAL ERROR in handleSaveDriver:", error);
      toast({ variant: "destructive", title: "Save Failed", description: error.message || "An unexpected error occurred." });
    } finally {
      setIsCreatingLogin(false);
    }
  };




  const startEditVehicle = (v: any) => {
    setEditingVehicleId(v.id);
    setActiveAssetType(v.type);
    const formData = {
      unitNumber: v.unitNumber || '',
      name: v.name,
      isPaidOff: v.isPaidOff,
      recurringExpenses: v.recurringExpenses || [],
      monthlyRecurringExpenses: v.monthlyRecurringExpenses || { insurance: 0, payment: 0, maintenanceFund: 0 },
      operatingCostPerMile: v.operatingCostPerMile || 0,
      mpg: v.mpg || 10,
      averageSpeed: v.averageSpeed || 65
    };
    if (v.type === 'truck') {
      setTruckForm({ 
        ...formData, 
        estimatedMonthlyMiles: v.estimatedMonthlyMiles || 10000,
        avgFuelPrice: v.avgFuelPrice || 3.50,
        avgDefCostPerGallon: v.avgDefCostPerGallon ?? 4.50,
        gvwr: v.gvwr || 0,
        emptyWeight: v.emptyWeight || 0,
      } as any);
    } else {
      setTrailerForm({
        ...formData,
        gvwr: v.gvwr || 0,
        emptyWeight: v.emptyWeight || 0,
        deckHeight: v.deckHeight || 0,
        trailerLength: v.trailerLength || 0,
        trailerWidth: v.trailerWidth || 0,
        axleConfiguration: v.axleConfiguration || ''
      });
    }
  };


  const startEditDriver = (d: any) => {
    setEditingDriverUid(d.uid);
    setDriverForm({
      name: d.name,
      email: d.email,
      phone: d.phone,
      cdlExpirationDate: d.cdlExpirationDate,
      medicalCardExpirationDate: d.medicalCardExpirationDate,
      assignedTruckId: d.assignedTruckId || '',
      assignedTrailerId: d.assignedTrailerId || '',
      status: d.status,
      cdlStatus: d.cdlStatus ?? 'Non-CDL',
      payType: d.payType || 'percentage',
      payRate: d.payRate ?? d.payrollPercentage ?? undefined,
      estimatedTripHours: d.estimatedTripHours ?? undefined,
      estimatedHosRemaining: d.estimatedHosRemaining ?? 11.0,
      cdlNumber: d.cdlNumber || d.idNumber || '',
      licenseIssuingState: d.licenseIssuingState || '',
      endorsements: Array.isArray(d.endorsements) ? d.endorsements : [],
      additionalEndorsements: d.additionalEndorsements || '',
      licenseFrontUrl: d.licenseFrontUrl || '',
      licenseFrontName: d.licenseFrontName || '',
      licenseBackUrl: d.licenseBackUrl || '',
      licenseBackName: d.licenseBackName || '',
      medicalCardUrl: d.medicalCardUrl || '',
      medicalCardName: d.medicalCardName || '',
      emergencyContactName: d.emergencyContactName || '',
      emergencyContactPhone: d.emergencyContactPhone || '',
      emergencyContactRelationship: d.emergencyContactRelationship || '',
      homeAddress: d.homeAddress || '',
      homeCity: d.homeCity || '',
      homeState: d.homeState || '',
      homeZip: d.homeZip || '',
      driverNotes: d.driverNotes || '',
    } as any);
  };

  const executeSendSelfOnboarding = async (params: {
    name: string;
    email?: string;
    phone?: string;
    uid?: string;
  }) => {
    const cleanName = params.name?.trim();
    const cleanEmail = params.email?.trim() || '';
    const cleanPhone = params.phone?.trim() || '';
    const uid = params.uid;

    if (!cleanName) {
      toast({
        variant: 'destructive',
        title: 'Driver Name Required',
        description: "Please enter the driver's name before sending an onboarding link.",
      });
      return;
    }

    if (!cleanEmail && !cleanPhone) {
      toast({
        variant: 'destructive',
        title: 'Contact Required',
        description: "Please enter either an email or phone number to send the onboarding link.",
      });
      return;
    }

    try {
      setIsGeneratingOnboardingLink(true);
      const res = await fetch('/api/driver-onboarding/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminUid: user?.uid,
          driverUid: uid,
          driverName: cleanName,
          driverEmail: cleanEmail,
          driverPhone: cleanPhone,
          companyName: settingsForm?.carrierName || 'PayloadLogic',
        }),
      });

      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error || 'Failed to generate onboarding link.');
      }

      // If this was an existing driver, update in local state immediately
      if (result.driverUid) {
        const existing = driverProfiles.find(d => d.uid === result.driverUid);
        if (existing) {
          updateDriverProfile(result.driverUid, {
            onboardingStatus: 'pending',
            onboardingToken: result.token,
            onboardingExpiresAt: result.expiresAt,
            onboardingLink: result.inviteUrl,
          });
        }
      }

      setOnboardingModalData({
        driverName: cleanName,
        inviteUrl: result.inviteUrl,
        expiresAt: result.expiresAt,
        emailSent: Boolean(result.emailSent),
        driverEmail: cleanEmail,
        driverPhone: cleanPhone,
        companyName: result.companyName || settingsForm?.carrierName || 'PayloadLogic',
        previewUrl: result.previewUrl,
      });
      setIsSendInvitePromptOpen(false);
      setIsOnboardingModalOpen(true);

      toast({
        title: 'Onboarding Link Ready',
        description: result.emailSent
          ? `Invitation sent to ${cleanEmail} (valid for 7 days).`
          : `7-day onboarding link created for ${cleanName}.`,
      });
    } catch (err: any) {
      console.error('Error generating onboarding link:', err);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: err.message || 'Could not send self-onboarding link.',
      });
    } finally {
      setIsGeneratingOnboardingLink(false);
    }
  };

  const handleSendSelfOnboarding = (targetDriver?: any) => {
    if (targetDriver) {
      executeSendSelfOnboarding({
        name: targetDriver.name,
        email: targetDriver.email,
        phone: targetDriver.phone,
        uid: targetDriver.uid,
      });
      return;
    }

    const currentName = driverForm.name?.trim();
    const currentEmail = (driverForm.email || driverLoginEmail)?.trim();
    const currentPhone = driverForm.phone?.trim();

    if (currentName && (currentEmail || currentPhone)) {
      executeSendSelfOnboarding({
        name: currentName,
        email: currentEmail,
        phone: currentPhone,
        uid: editingDriverUid || undefined,
      });
      return;
    }

    // Open quick invite dialog so user can enter name & email directly from the top card
    setQuickInviteName(currentName || '');
    setQuickInviteEmail(currentEmail || '');
    setQuickInvitePhone(currentPhone || '');
    setIsSendInvitePromptOpen(true);
  };


  return (
    <div className="p-4 md:p-6 space-y-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold font-headline mb-2">Drivers & Fleet</h1>
          <p className="text-muted-foreground">Manage your drivers, vehicles, and unique recurring expenses.</p>
          {isSubmitting && (
            <Button variant="ghost" size="sm" onClick={() => setIsSubmitting(false)} className="mt-2 text-xs text-red-500">
              System Busy? Force Reset
            </Button>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleResetFleetForms}
          className="border-dashed border-orange-300 text-orange-600 hover:bg-orange-50 hover:text-orange-700 text-xs"
        >
          🗑 Reset All Draft Forms
        </Button>
      </div>

      {/* ── Plan Capacity & Entitlements Banner ─────────────────────────── */}
      <div className="bg-white border border-slate-200 shadow-xs rounded-2xl p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className={cn(
            "h-11 w-11 rounded-xl flex items-center justify-center shrink-0 border",
            isStarter ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-blue-50 text-blue-700 border-blue-200"
          )}>
            <Truck className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-slate-900 text-sm font-headline">{planLimits.name}</span>
              <Badge variant={isStarter ? "secondary" : "default"} className={cn("text-[10px] font-semibold px-2 py-0.5", isStarter ? "bg-amber-100 text-amber-800 border-amber-200" : "bg-blue-600 text-white")}>
                {isStarter ? '$49/mo · Single Rig' : '$99/mo · Fleet Multi-Rig'}
              </Badge>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {isStarter
                ? 'Starter limit: 1 Power Unit (truck) and 1 Driver account.'
                : (trial.hasEvaluationAccess
                    ? 'Free trial: Fleet Pro access with up to 3 trucks and unlimited drivers.'
                    : 'Fleet Pro: 3 Power Units included base (+$25/mo per extra), unlimited drivers.')}
            </p>
          </div>
        </div>

        {/* Capacity Indicators */}
        <div className="grid grid-cols-2 sm:flex items-center gap-3 sm:gap-6 flex-wrap pt-3 md:pt-0 border-t md:border-t-0 border-slate-100">
          {/* Trucks Pill */}
          <div className="flex items-center justify-between sm:justify-start gap-2 bg-slate-50 sm:bg-transparent p-2.5 sm:p-0 rounded-xl border sm:border-0 border-slate-200/80">
            <div className="text-left sm:text-right">
              <div className="text-[11px] font-semibold text-slate-500">Power Units</div>
              <div className="text-sm font-black text-slate-900">
                {truckCount} / {isStarter ? 1 : planLimits.maxTrucks}
                <span className="text-[10px] font-normal text-slate-500 ml-1">
                  {isStarter ? (truckCount >= 1 ? '(Full)' : 'used') : (truckCount >= 3 ? '(Base Full)' : 'used')}
                </span>
              </div>
            </div>
            <Badge className={cn(
              "text-[10px] font-bold h-6 shrink-0",
              (isStarter && truckCount >= 1) ? "bg-amber-100 text-amber-800 border-amber-300" : "bg-emerald-50 text-emerald-700 border-emerald-200"
            )}>
              {isStarter ? `${truckCount}/1 Max` : `${truckCount}/${planLimits.maxTrucks}`}
            </Badge>
          </div>

          {/* Drivers Pill */}
          <div className="flex items-center justify-between sm:justify-start gap-2 bg-slate-50 sm:bg-transparent p-2.5 sm:p-0 rounded-xl border sm:border-0 border-slate-200/80">
            <div className="text-left sm:text-right">
              <div className="text-[11px] font-semibold text-slate-500">Driver Seats</div>
              <div className="text-sm font-black text-slate-900">
                {driverCount} / {isStarter ? 1 : '∞'}
                <span className="text-[10px] font-normal text-slate-500 ml-1">
                  {isStarter ? (driverCount >= 1 ? '(Full)' : 'used') : 'unlimited'}
                </span>
              </div>
            </div>
            <Badge className={cn(
              "text-[10px] font-bold h-6 shrink-0",
              (isStarter && driverCount >= 1) ? "bg-amber-100 text-amber-800 border-amber-300" : "bg-emerald-50 text-emerald-700 border-emerald-200"
            )}>
              {isStarter ? `${driverCount}/1 Max` : 'Unlimited'}
            </Badge>
          </div>

          {/* Upgrade CTA */}
          {isStarter && (
            <Button
              size="sm"
              onClick={() => setNavTab('billing')}
              className="col-span-2 sm:col-span-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs h-9 sm:h-8 px-3 gap-1.5 shadow-xs shrink-0"
            >
              <Sparkles className="h-3.5 w-3.5 text-amber-300" />
              Upgrade Plan
            </Button>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-6">
        <TabsList className="grid w-full grid-cols-2 max-w-[440px] h-auto p-1.5 bg-slate-200/90 border border-slate-300/80 rounded-xl gap-1.5 shadow-2xs">
          <TabsTrigger
            value="vehicles"
            className="flex items-center justify-center gap-2 rounded-lg py-2.5 px-3 text-xs sm:text-sm font-bold transition-all min-w-0 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=inactive]:bg-white data-[state=inactive]:text-slate-700 data-[state=inactive]:hover:bg-slate-50 data-[state=inactive]:hover:text-slate-900"
          >
            <Truck className="h-4 w-4 shrink-0" />
            <span className="truncate">Vehicles</span>
            <span
              className={cn(
                "inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[11px] font-extrabold leading-none shrink-0",
                activeTab === 'vehicles'
                  ? "bg-white/20 text-white"
                  : "bg-slate-100 text-slate-800 border border-slate-200"
              )}
            >
              {vehicles.length}
            </span>
          </TabsTrigger>
          <TabsTrigger
            value="drivers"
            className="flex items-center justify-center gap-2 rounded-lg py-2.5 px-3 text-xs sm:text-sm font-bold transition-all min-w-0 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=inactive]:bg-white data-[state=inactive]:text-slate-700 data-[state=inactive]:hover:bg-slate-50 data-[state=inactive]:hover:text-slate-900"
          >
            <Users className="h-4 w-4 shrink-0" />
            <span className="truncate">Drivers</span>
            <span
              className={cn(
                "inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[11px] font-extrabold leading-none shrink-0",
                activeTab === 'drivers'
                  ? "bg-white/20 text-white"
                  : "bg-slate-100 text-slate-800 border border-slate-200"
              )}
            >
              {driverProfiles.length}
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="vehicles" className="space-y-6 mt-0">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Vehicle Form */}
            <Card className="lg:col-span-1 shadow-sm border-slate-200 h-fit">

              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {editingVehicleId ? <Edit2 className="h-5 w-5 text-blue-600" /> : <Plus className="h-5 w-5 text-blue-600" />}
                  {editingVehicleId ? 'Edit Asset' : 'Add Fleet Asset'}
                </CardTitle>
                <CardDescription>Configure trucks and trailers separately.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-600">Asset Category</Label>
                  <div className="grid grid-cols-2 p-1.5 bg-slate-100 rounded-xl gap-1.5 border border-slate-200/60">
                    <button 
                      type="button"
                      className={`flex items-center justify-center gap-2 py-2.5 px-3 text-xs font-bold rounded-lg transition-all ${activeAssetType === 'truck' ? 'bg-white shadow-sm text-blue-600 ring-1 ring-blue-100' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'}`}
                      onClick={() => setActiveAssetType('truck')}
                    >
                      <Truck className="h-4 w-4" />
                      <span>Truck (Power Unit)</span>
                    </button>
                    <button 
                      type="button"
                      className={`flex items-center justify-center gap-2 py-2.5 px-3 text-xs font-bold rounded-lg transition-all ${activeAssetType === 'trailer' ? 'bg-white shadow-sm text-purple-700 ring-1 ring-purple-100' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'}`}
                      onClick={() => setActiveAssetType('trailer')}
                    >
                      <Fuel className="h-4 w-4 rotate-90" />
                      <span>Trailer (Towed Unit)</span>
                    </button>
                  </div>

                  {/* Contextual Help: Truck vs Trailer */}
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 text-[11px] text-slate-600 space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-slate-800">
                      <Info className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                      <span>Truck vs Trailer in PayloadLogic</span>
                    </div>
                    <p className="leading-snug">
                      <strong>Trucks (Power Units):</strong> Carry the engine, driver, odometer, and fixed monthly notes/insurance.
                    </p>
                    <p className="leading-snug">
                      <strong>Trailers (Towed Units):</strong> Carry the cargo. Define your trailer footage, tare empty weight, and legal payload capacity.
                    </p>
                  </div>
                </div>

                {activeAssetType === 'truck' ? (
                  <div className="space-y-4 animate-in fade-in slide-in-from-left-2 duration-300">
                    {!editingVehicleId && isStarter && truckCount >= 1 && (
                      <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 space-y-2">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                          <div>
                            <p className="text-xs font-bold">Starter Plan Limit: 1 Truck Reached</p>
                            <p className="text-[11px] text-amber-700 mt-0.5 leading-snug">
                              Your Starter plan includes 1 power unit ({registeredTrucks[0]?.unitNumber ? `Unit #${registeredTrucks[0].unitNumber}` : '1 registered'}). To add another truck, upgrade to Fleet Pro.
                            </p>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          type="button"
                          onClick={() => setNavTab('billing')}
                          className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs h-8 shadow-xs gap-1.5"
                        >
                          <Sparkles className="h-3.5 w-3.5 text-amber-200" />
                          Upgrade to Fleet Pro ($99/mo)
                        </Button>
                      </div>
                    )}

                    {!editingVehicleId && !isOwnerOrAdmin && !isStarter && truckCount >= 3 && trial.hasEvaluationAccess && (
                      <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-xs">
                        <p className="font-semibold text-[11px]">Free trial: 3 of 3 trucks in use</p>
                        <p className="text-[10px] text-blue-700 mt-0.5 leading-snug">Your trial includes up to 3 trucks. Choose a plan to add more.</p>
                      </div>
                    )}

                    {!editingVehicleId && !isOwnerOrAdmin && !isStarter && truckCount >= 3 && !trial.hasEvaluationAccess && (
                      <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-xs flex items-start gap-2">
                        <Sparkles className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-semibold text-[11px]">Fleet Pro Base Rigs: 3 of 3 in Use</p>
                          <p className="text-[10px] text-blue-700 mt-0.5 leading-snug">
                            Saving an additional power unit will add +$25/mo per extra rig with your confirmation.
                          </p>
                        </div>
                      </div>
                    )}

                    <Accordion type="multiple" defaultValue={['t-basic', 't-specs']} className="space-y-3">
                      {/* Basic Vehicle Info */}
                      <AccordionItem value="t-basic" className="border rounded-xl px-3 py-0.5 bg-white shadow-sm">
                        <AccordionTrigger className="hover:no-underline font-semibold text-slate-800 text-sm py-2.5">
                          <span className="flex items-center gap-2"><Truck className="h-4 w-4 text-blue-600" /> Basic Vehicle Info</span>
                        </AccordionTrigger>
                        <AccordionContent className="pt-2 space-y-4">
                          <div className="grid grid-cols-3 gap-3">
                            <div className="col-span-1 space-y-2">
                              <Label className="flex items-center gap-1">
                                Unit # <span className="text-red-500 font-bold">*</span>
                              </Label>
                              <Input 
                                placeholder="101" 
                                value={truckForm.unitNumber}
                                onChange={(e) => setTruckForm({...truckForm, unitNumber: e.target.value})}
                                className={!truckForm.unitNumber && truckForm.name ? "border-red-300 bg-red-50" : ""}
                              />
                            </div>
                            <div className="col-span-2 space-y-2">
                              <Label className="flex items-center gap-1">
                                Description <span className="text-red-500 font-bold">*</span>
                              </Label>
                              <Input 
                                placeholder="e.g. 2024 Ram 3500" 
                                value={truckForm.name}
                                onChange={(e) => setTruckForm({...truckForm, name: e.target.value})}
                                className={truckForm.unitNumber && !truckForm.name ? "border-red-300 bg-red-50" : ""}
                              />
                            </div>
                          </div>

                          <div className="flex items-center space-x-2">
                            <input 
                              type="checkbox" 
                              id="t-paid" 
                              className="h-4 w-4 rounded border-slate-300 text-blue-600"
                              checked={truckForm.isPaidOff}
                              onChange={(e) => setTruckForm({...truckForm, isPaidOff: e.target.checked})}
                            />
                            <Label htmlFor="t-paid" className="text-sm">Truck is paid off</Label>
                          </div>
                        </AccordionContent>
                      </AccordionItem>

                      {/* Weight & Operating Specs */}
                      <AccordionItem value="t-specs" className="border rounded-xl px-3 py-0.5 bg-white shadow-sm">
                        <AccordionTrigger className="hover:no-underline font-semibold text-slate-800 text-sm py-2.5">
                          <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-600" /> Weight &amp; Operating Specs</span>
                        </AccordionTrigger>
                        <AccordionContent className="pt-2 space-y-4">
                          <div className="space-y-2">
                            <Label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                              Truck Operating GVWR (lbs)
                              <span className="text-red-500">*</span>
                              <span className="text-[9px] normal-case font-normal text-slate-400 ml-1">Door-sticker GVWR — unrestricted (Class 3–8+). Required for GCWR &amp; CDL compliance.</span>
                            </Label>
                            <Input 
                              type="number" 
                              placeholder="e.g. 14000"
                              value={(truckForm as any).gvwr === 0 ? '' : ((truckForm as any).gvwr || '')}
                              onChange={(e) => {
                                const val = Number(e.target.value) || 0;
                                setTruckForm({...truckForm, gvwr: val} as any);
                              }}
                              className="h-10 text-base font-bold"
                            />
                            {(() => {
                              const g = (truckForm as any).gvwr || 0;
                              if (g <= 0) return null;
                              const label =
                                g <= 14000 ? 'Class 3 — Light Duty / Hotshot' :
                                g <= 16000 ? 'Class 4 — Medium Duty' :
                                g <= 19500 ? 'Class 5 — Medium Duty' :
                                g <= 26000 ? 'Class 6 — Medium Duty' :
                                             'Class 7/8 — Heavy Duty Commercial';
                              const color =
                                g <= 14000 ? 'text-blue-600' :
                                g <= 26000 ? 'text-amber-700' :
                                             'text-red-600';
                              return <p className={`text-[10px] font-semibold mt-0.5 ${color}`}>✓ {label}</p>;
                            })()}
                          </div>

                          <div className="space-y-2">
                            <Label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                              Truck Empty Weight / Tare (lbs)
                              <span className="text-[9px] normal-case font-normal text-slate-400 ml-1">Physical scale weight empty. Used in actual operating weight calculation.</span>
                            </Label>
                            <Input 
                              type="number" 
                              placeholder="e.g. 8000"
                              value={(truckForm as any).emptyWeight === 0 ? '' : ((truckForm as any).emptyWeight || '')}
                              onChange={(e) => {
                                const val = Number(e.target.value) || 0;
                                setTruckForm({...truckForm, emptyWeight: val} as any);
                              }}
                              className="h-10 text-base font-bold"
                            />
                            <p className="text-[9px] text-slate-400">Actual Operating Wt = Truck Tare + Trailer Tare + Cargo. Used for real scale compliance (not sticker math).</p>
                          </div>
                        </AccordionContent>
                      </AccordionItem>

                      {/* Financial & Recurring Expenses */}
                      <AccordionItem value="t-financials" className="border rounded-xl px-3 py-0.5 bg-white shadow-sm">
                        <AccordionTrigger className="hover:no-underline font-semibold text-slate-800 text-sm py-2.5">
                          <span className="flex items-center gap-2"><DollarSign className="h-4 w-4 text-indigo-600" /> Financials &amp; Recurring Costs</span>
                        </AccordionTrigger>
                        <AccordionContent className="pt-2 space-y-4">
                          {/* Contextual Help: Why Financial Fields Matter */}
                          <div className="p-2.5 rounded-xl bg-blue-50/80 border border-blue-200/80 text-[11px] text-blue-950 flex items-start gap-2 shadow-2xs">
                            <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                            <div className="leading-snug">
                              <span className="font-bold">Why these financial fields matter:</span> Your monthly truck payment, insurance, and miles calculate your break-even Cost-Per-Mile (CPM). When pricing loads, the Rate Calculator uses these figures to protect your daily profit target.
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Op. Cost / Mile (Auto)</Label>
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold">$</span>
                                <Input 
                                  type="number" 
                                  step="0.01"
                                  placeholder="0"
                                  value={truckForm.operatingCostPerMile || ''}
                                  readOnly
                                  className="pl-6 h-10 text-base font-bold bg-slate-100 text-slate-500 cursor-not-allowed border-dashed"
                                />
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Insurance (Mo)</Label>
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold">$</span>
                                <Input 
                                  type="number" 
                                  placeholder="0"
                                  value={truckForm.monthlyRecurringExpenses.insurance || ''}
                                  onChange={(e) => setTruckForm({...truckForm, monthlyRecurringExpenses: {...truckForm.monthlyRecurringExpenses, insurance: Number(e.target.value)}})}
                                  className="pl-6 h-10 text-base font-bold"
                                />
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Monthly Payment</Label>
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold">$</span>
                                <Input 
                                  type="number" 
                                  placeholder="0"
                                  value={truckForm.monthlyRecurringExpenses.payment || ''}
                                  onChange={(e) => setTruckForm({...truckForm, monthlyRecurringExpenses: {...truckForm.monthlyRecurringExpenses, payment: Number(e.target.value)}})}
                                  className="pl-6 h-10 text-base font-bold"
                                />
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Maint. Fund (Mo)</Label>
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold">$</span>
                                <Input 
                                  type="number" 
                                  placeholder="0"
                                  value={truckForm.monthlyRecurringExpenses.maintenanceFund || ''}
                                  onChange={(e) => setTruckForm({...truckForm, monthlyRecurringExpenses: {...truckForm.monthlyRecurringExpenses, maintenanceFund: Number(e.target.value)}})}
                                  className="pl-6 h-10 text-base font-bold"
                                />
                              </div>
                            </div>
                          </div>

                          <div className="pt-2 space-y-4">
                            <h4 className="text-xs font-semibold uppercase text-slate-500">Variable Costs &amp; Mileage</h4>
                            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                              <div className="space-y-2">
                                <Label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Est. Monthly Miles</Label>
                                <Input 
                                  type="number" 
                                  placeholder="10000"
                                  value={truckForm.estimatedMonthlyMiles || ''}
                                  onChange={(e) => setTruckForm({...truckForm, estimatedMonthlyMiles: Number(e.target.value)})}
                                  className="w-full px-3 h-10 text-base font-bold"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Avg Fuel Price</Label>
                                <div className="relative">
                                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold">$</span>
                                  <Input 
                                    type="number" 
                                    step="0.01"
                                    placeholder="3.50"
                                    value={truckForm.avgFuelPrice || ''}
                                    onChange={(e) => setTruckForm({...truckForm, avgFuelPrice: Number(e.target.value)})}
                                    className="w-full pl-5 pr-3 h-10 text-base font-bold"
                                  />
                                </div>
                              </div>
                              <div className="space-y-2">
                                <Label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Avg MPG</Label>
                                <Input 
                                  type="number" 
                                  placeholder="10"
                                  value={truckForm.mpg || ''}
                                  onChange={(e) => setTruckForm({...truckForm, mpg: Number(e.target.value)})}
                                  className="w-full px-3 h-10 text-base font-bold"
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div className="space-y-2 col-span-1 md:col-span-1">
                                <Label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Avg DEF Cost / Gal ($)</Label>
                                <div className="relative">
                                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold">$</span>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    placeholder="4.50"
                                    value={(truckForm as any).avgDefCostPerGallon ?? 4.50}
                                    onChange={(e) => setTruckForm({...truckForm, avgDefCostPerGallon: Number(e.target.value)} as any)}
                                    className="w-full pl-5 pr-3 h-10 text-base font-bold"
                                  />
                                </div>
                                <p className="text-[9px] text-slate-400 leading-tight">DEF auto-calc at 2.5% of fuel use</p>
                              </div>
                              <div className="space-y-2 col-span-1 md:col-span-2 flex items-end pb-1">
                                <p className="text-[10px] text-slate-400 italic">
                                  At {truckForm.mpg || 10} MPG → est. monthly DEF:{' '}
                                  <span className="font-semibold text-slate-600">
                                    ${truckForm.estimatedMonthlyMiles
                                      ? ((truckForm.estimatedMonthlyMiles / (truckForm.mpg || 10)) * 0.025 * ((truckForm as any).avgDefCostPerGallon ?? 4.50)).toFixed(2)
                                      : '—'}
                                  </span>
                                </p>
                              </div>
                            </div>
                          </div>

                          <div className="pt-2 space-y-3">
                            <div className="flex items-center justify-between">
                              <Label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Truck Recurring Costs</Label>
                              <Button variant="ghost" size="sm" onClick={() => handleAddRecurringExpense('truck')} className="h-6 text-blue-600 px-2 text-[10px]">
                                + ADD COST
                              </Button>
                            </div>
                            <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                              {truckForm.recurringExpenses.map((exp) => (
                                <div key={exp.id} className="flex gap-2">
                                  <Input 
                                    placeholder="Name" 
                                    className="h-8 text-xs flex-1"
                                    value={exp.name}
                                    onChange={(e) => handleUpdateRecurringExpense('truck', exp.id, 'name', e.target.value)}
                                  />
                                  <div className="relative w-20">
                                    <span className="absolute left-1.5 top-2 text-[9px] text-slate-400">$</span>
                                    <Input 
                                      type="number" 
                                      className="h-8 pl-4 text-xs"
                                      value={exp.amount}
                                      onChange={(e) => handleUpdateRecurringExpense('truck', exp.id, 'amount', e.target.value)}
                                    />
                                  </div>
                                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-400" onClick={() => handleRemoveRecurringExpense('truck', exp.id)}>
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>

                    <Button 
                      className={cn(
                        "w-full transition-colors",
                        !editingVehicleId && !isOwnerOrAdmin && isStarter && truckCount >= 1
                          ? "bg-amber-600 hover:bg-amber-700 text-white font-semibold"
                          : "bg-blue-600 hover:bg-blue-700 text-white"
                      )}
                      onClick={() => {
                        if (!editingVehicleId && !isOwnerOrAdmin && isStarter && truckCount >= 1) {
                          setShowUpgradeModal(true);
                          return;
                        }
                        if (!editingVehicleId && !isOwnerOrAdmin && !isStarter && !trial.hasEvaluationAccess && truckCount >= 3) {
                          setShowExtraTruckConfirmModal(true);
                          return;
                        }
                        handleSaveAsset('truck');
                      }} 
                      disabled={isSubmitting}
                    >
                      {isSubmitting 
                        ? 'Saving Truck...' 
                        : (editingVehicleId 
                            ? 'Update Truck' 
                            : (!isOwnerOrAdmin && isStarter && truckCount >= 1 
                                ? 'Limit Reached · Upgrade to Fleet Pro' 
                                : (!isOwnerOrAdmin && !isStarter && !trial.hasEvaluationAccess && truckCount >= 3 
                                    ? 'Save Truck (+$25/mo Confirmation)' 
                                    : 'Save Truck to Fleet')))}
                    </Button>
                    {/* Informational CPM summary — display only, not saved */}
                    {truckForm.estimatedMonthlyMiles > 0 && (
                      <div className="mt-3 p-3 bg-slate-50 rounded-lg border border-slate-200 text-[10px] space-y-1">
                        <p className="font-bold text-slate-600 uppercase tracking-wider text-[9px]">Estimated Total CPM Breakdown (display only)</p>
                        <div className="flex justify-between text-slate-500">
                          <span>Maintenance Reserve</span>
                          <span className="font-mono font-semibold text-slate-700">${truckForm.operatingCostPerMile.toFixed(3)}/mi</span>
                        </div>
                        <div className="flex justify-between text-slate-500">
                          <span>Overhead (ins+payment) / {truckForm.estimatedMonthlyMiles.toLocaleString()} mi</span>
                          <span className="font-mono font-semibold text-slate-700">
                            ${truckForm.estimatedMonthlyMiles > 0 
                              ? (((truckForm.monthlyRecurringExpenses.insurance || 0) + (truckForm.monthlyRecurringExpenses.payment || 0)) / truckForm.estimatedMonthlyMiles).toFixed(3) 
                              : '0.000'}/mi
                          </span>
                        </div>
                        <div className="flex justify-between text-slate-500">
                          <span>Fuel ({truckForm.mpg || 10} MPG @ ${(truckForm.avgFuelPrice || 3.80).toFixed(2)}/gal)</span>
                          <span className="font-mono font-semibold text-slate-700">
                            ${truckForm.mpg > 0 ? ((truckForm.avgFuelPrice || 3.80) / truckForm.mpg).toFixed(3) : '0.000'}/mi
                          </span>
                        </div>
                        <div className="flex justify-between border-t border-slate-200 pt-1 font-bold text-slate-700">
                          <span>Total Estimated CPM</span>
                          <span className="font-mono">
                            ${(
                              truckForm.operatingCostPerMile +
                              (truckForm.estimatedMonthlyMiles > 0 ? ((truckForm.monthlyRecurringExpenses.insurance || 0) + (truckForm.monthlyRecurringExpenses.payment || 0)) / truckForm.estimatedMonthlyMiles : 0) +
                              (truckForm.mpg > 0 ? (truckForm.avgFuelPrice || 3.80) / truckForm.mpg : 0)
                            ).toFixed(3)}/mi
                          </span>
                        </div>
                        <p className="text-[8px] text-slate-400 italic pt-0.5">Only "Maintenance Reserve" is saved to the truck record and used in load expense calculations. Fuel and overhead are always computed per-trip.</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4 animate-in fade-in slide-in-from-right-2 duration-300">
                    <Accordion type="multiple" defaultValue={['tr-basic', 'tr-specs']} className="space-y-3">
                      {/* Basic Trailer Info */}
                      <AccordionItem value="tr-basic" className="border rounded-xl px-3 py-0.5 bg-white shadow-sm">
                        <AccordionTrigger className="hover:no-underline font-semibold text-slate-800 text-sm py-2.5">
                          <span className="flex items-center gap-2"><Fuel className="h-4 w-4 text-purple-600 rotate-90" /> Basic Trailer Info</span>
                        </AccordionTrigger>
                        <AccordionContent className="pt-2 space-y-4">
                          <div className="grid grid-cols-3 gap-3">
                            <div className="col-span-1 space-y-2">
                              <Label className="flex items-center gap-1">
                                Unit # <span className="text-red-500 font-bold">*</span>
                              </Label>
                              <Input 
                                placeholder="A2" 
                                value={trailerForm.unitNumber}
                                onChange={(e) => setTrailerForm({...trailerForm, unitNumber: e.target.value})}
                                className={!trailerForm.unitNumber && trailerForm.name ? "border-red-300 bg-red-50" : ""}
                              />
                            </div>
                            <div className="col-span-2 space-y-2">
                              <Label className="flex items-center gap-1">
                                Description <span className="text-red-500 font-bold">*</span>
                              </Label>
                              <Input 
                                placeholder="e.g. 40ft Flatbed" 
                                value={trailerForm.name}
                                onChange={(e) => setTrailerForm({...trailerForm, name: e.target.value})}
                                className={trailerForm.unitNumber && !trailerForm.name ? "border-red-300 bg-red-50" : ""}
                              />
                            </div>
                          </div>

                          <div className="flex items-center space-x-2">
                            <input 
                              type="checkbox" 
                              id="tr-paid" 
                              className="h-4 w-4 rounded border-slate-300 text-slate-600"
                              checked={trailerForm.isPaidOff}
                              onChange={(e) => setTrailerForm({...trailerForm, isPaidOff: e.target.checked})}
                            />
                            <Label htmlFor="tr-paid" className="text-sm">Trailer is paid off</Label>
                          </div>
                        </AccordionContent>
                      </AccordionItem>

                      {/* Structural & Safety Dimensions */}
                      <AccordionItem value="tr-specs" className="border rounded-xl px-3 py-0.5 bg-white shadow-sm">
                        <AccordionTrigger className="hover:no-underline font-semibold text-slate-800 text-sm py-2.5">
                          <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-600" /> Structural &amp; Safety Dimensions</span>
                        </AccordionTrigger>
                        <AccordionContent className="pt-2 space-y-4">
                          {/* Contextual Help: Trailer Specs */}
                          <div className="p-2.5 rounded-xl bg-purple-50/80 border border-purple-200/80 text-[11px] text-purple-950 flex items-start gap-2 shadow-2xs">
                            <Info className="h-4 w-4 text-purple-600 shrink-0 mt-0.5" />
                            <div className="leading-snug">
                              <span className="font-bold">Why trailer specs matter:</span> Exact deck length, tare empty weight, and GVWR protect you from DOT overweight citations and power the real-time load consolidation engine.
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Trailer GVWR (lbs) <span className="text-red-500">*</span></Label>
                              <Input 
                                type="number" 
                                placeholder="0"
                                value={trailerForm.gvwr || ''}
                                onChange={(e) => setTrailerForm({...trailerForm, gvwr: Number(e.target.value)})}
                                className="h-10 text-base font-bold"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Empty Wt (lbs) <span className="text-red-500">*</span></Label>
                              <Input 
                                type="number" 
                                placeholder="0"
                                value={trailerForm.emptyWeight || ''}
                                onChange={(e) => setTrailerForm({...trailerForm, emptyWeight: Number(e.target.value)})}
                                className="h-10 text-base font-bold"
                              />
                            </div>
                          </div>

                          {/* FMCSA CDL Info Tag */}
                          {(trailerForm.gvwr || 0) > 10_000 && (() => {
                            const maxTruckGvwr = CDL_THRESHOLD - (trailerForm.gvwr || 0);
                            return (
                              <div className="rounded-lg border-2 border-amber-300 bg-amber-50 px-3 py-2.5 flex items-start gap-2">
                                <span className="text-amber-500 text-base leading-none mt-0.5">⚠️</span>
                                <div>
                                  <p className="text-[11px] font-black text-amber-800 uppercase tracking-wide">Class A CDL Required if Combined</p>
                                  <p className="text-[11px] text-amber-700 leading-snug mt-0.5">
                                    This trailer's GVWR ({(trailerForm.gvwr || 0).toLocaleString()} lbs) exceeds the 10,000 lb FMCSA towed-unit threshold.
                                    {' '}Pairing with any truck with a GVWR over{' '}
                                    <strong>{Math.max(0, maxTruckGvwr).toLocaleString()} lbs</strong>
                                    {' '}will push the combined GCWR above 26,000 lbs, mandating a Class A CDL (49 CFR § 383.91).
                                  </p>
                                </div>
                              </div>
                            );
                          })()}

                          <div className="rounded-lg border border-blue-200 bg-blue-50/60 overflow-hidden">
                            <div className="px-3 py-1.5 bg-blue-100/70 flex items-center justify-between">
                              <span className="text-[10px] font-black text-blue-700 uppercase tracking-wider">Max Cargo Weight (Payload)</span>
                              <span className="text-[9px] font-semibold text-blue-500 bg-blue-100 px-1.5 py-0.5 rounded border border-blue-200">Locked Formula</span>
                            </div>
                            <div className="px-3 py-2 flex items-center justify-between">
                              <span className="text-[11px] text-slate-500 font-mono">
                                {(trailerForm.gvwr || 0).toLocaleString()} − {(trailerForm.emptyWeight || 0).toLocaleString()} lbs
                              </span>
                              <span className="font-black text-blue-800 text-base">
                                {Math.max(0, (trailerForm.gvwr || 0) - (trailerForm.emptyWeight || 0)).toLocaleString()} lbs
                              </span>
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-4">
                            <div className="space-y-2">
                              <Label className="text-xs">Deck Height (in) <span className="text-red-500">*</span></Label>
                              <Input 
                                type="number" 
                                value={trailerForm.deckHeight || ''}
                                onChange={(e) => setTrailerForm({...trailerForm, deckHeight: Number(e.target.value)})}
                                className="h-9"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs">Deck Length (ft) <span className="text-red-500">*</span></Label>
                              <Input 
                                type="number" 
                                value={trailerForm.trailerLength || ''}
                                onChange={(e) => setTrailerForm({...trailerForm, trailerLength: Number(e.target.value)})}
                                className="h-9"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs">Deck Width (ft) <span className="text-red-500">*</span></Label>
                              <Input 
                                type="number" 
                                value={trailerForm.trailerWidth || ''}
                                onChange={(e) => setTrailerForm({...trailerForm, trailerWidth: Number(e.target.value)})}
                                className="h-9"
                              />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs">Axle Configuration</Label>
                            <Input 
                              placeholder="e.g. Tandem Dual" 
                              value={trailerForm.axleConfiguration}
                              onChange={(e) => setTrailerForm({...trailerForm, axleConfiguration: e.target.value})}
                              className="h-9"
                            />
                          </div>
                        </AccordionContent>
                      </AccordionItem>

                      {/* Financial Setup */}
                      <AccordionItem value="tr-financials" className="border rounded-xl px-3 py-0.5 bg-white shadow-sm">
                        <AccordionTrigger className="hover:no-underline font-semibold text-slate-800 text-sm py-2.5">
                          <span className="flex items-center gap-2"><DollarSign className="h-4 w-4 text-indigo-600" /> Financials &amp; Recurring Costs</span>
                        </AccordionTrigger>
                        <AccordionContent className="pt-2 space-y-4">
                          {/* Contextual Help: Why Financial Fields Matter */}
                          <div className="p-2.5 rounded-xl bg-blue-50/80 border border-blue-200/80 text-[11px] text-blue-950 flex items-start gap-2 shadow-2xs">
                            <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                            <div className="leading-snug">
                              <span className="font-bold">Why these financial fields matter:</span> Your monthly truck payment, insurance, and miles calculate your break-even Cost-Per-Mile (CPM). When pricing loads, the Rate Calculator uses these figures to protect your daily profit target.
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Op. Cost / Mile</Label>
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold">$</span>
                                <Input 
                                  type="number" 
                                  step="0.01"
                                  placeholder="0"
                                  value={trailerForm.operatingCostPerMile || ''}
                                  onChange={(e) => setTrailerForm({...trailerForm, operatingCostPerMile: Number(e.target.value)})}
                                  className="pl-6 h-10 text-base font-bold"
                                />
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Insurance (Mo)</Label>
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold">$</span>
                                <Input 
                                  type="number" 
                                  placeholder="0"
                                  value={trailerForm.monthlyRecurringExpenses.insurance || ''}
                                  onChange={(e) => setTrailerForm({...trailerForm, monthlyRecurringExpenses: {...trailerForm.monthlyRecurringExpenses, insurance: Number(e.target.value)}})}
                                  className="pl-6 h-10 text-base font-bold"
                                />
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Monthly Payment</Label>
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold">$</span>
                                <Input 
                                  type="number" 
                                  placeholder="0"
                                  value={trailerForm.monthlyRecurringExpenses.payment || ''}
                                  onChange={(e) => setTrailerForm({...trailerForm, monthlyRecurringExpenses: {...trailerForm.monthlyRecurringExpenses, payment: Number(e.target.value)}})}
                                  className="pl-6 h-10 text-base font-bold"
                                />
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Maint. Fund (Mo)</Label>
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold">$</span>
                                <Input 
                                  type="number" 
                                  placeholder="0"
                                  value={trailerForm.monthlyRecurringExpenses.maintenanceFund || ''}
                                  onChange={(e) => setTrailerForm({...trailerForm, monthlyRecurringExpenses: {...trailerForm.monthlyRecurringExpenses, maintenanceFund: Number(e.target.value)}})}
                                  className="pl-6 h-10 text-base font-bold"
                                />
                              </div>
                            </div>
                          </div>

                          <div className="pt-2 space-y-3">
                            <div className="flex items-center justify-between">
                              <Label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Trailer Recurring Costs</Label>
                              <Button variant="ghost" size="sm" onClick={() => handleAddRecurringExpense('trailer')} className="h-6 text-slate-600 px-2 text-[10px]">
                                + ADD COST
                              </Button>
                            </div>
                            <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                              {trailerForm.recurringExpenses.map((exp) => (
                                <div key={exp.id} className="flex gap-2">
                                  <Input 
                                    placeholder="Name" 
                                    className="h-8 text-xs flex-1"
                                    value={exp.name}
                                    onChange={(e) => handleUpdateRecurringExpense('trailer', exp.id, 'name', e.target.value)}
                                  />
                                  <div className="relative w-20">
                                    <span className="absolute left-1.5 top-2 text-[9px] text-slate-400">$</span>
                                    <Input 
                                      type="number" 
                                      className="h-8 pl-4 text-xs"
                                      value={exp.amount}
                                      onChange={(e) => handleUpdateRecurringExpense('trailer', exp.id, 'amount', e.target.value)}
                                    />
                                  </div>
                                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-400" onClick={() => handleRemoveRecurringExpense('trailer', exp.id)}>
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                    
                    <Button 
                      className="w-full bg-purple-700 hover:bg-purple-800 text-white font-semibold shadow-sm" 
                      onClick={() => handleSaveAsset('trailer')} 
                    >
                      {isSubmitting ? 'Saving Trailer...' : (editingVehicleId ? 'Update Trailer' : 'Save Trailer to Fleet')}
                    </Button>

                  </div>
                )}
                
                {editingVehicleId && (
                  <Button variant="outline" className="w-full border-dashed" onClick={() => {
                    setEditingVehicleId(null);
                    lsClear(LS_TRUCK, LS_TRAILER);
                    setTruckForm(defaultTruckForm);
                    setTrailerForm(defaultTrailerForm);
                  }}>
                    Cancel Editing
                  </Button>
                )}
              </CardContent>
            </Card>


            {/* Vehicle Lists */}
            <div className="lg:col-span-2 space-y-8">
              {/* Trucks Section */}
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <Truck className="h-5 w-5 text-blue-600" />
                  <h3 className="font-bold text-lg">Trucks</h3>
                  <Badge variant="outline" className="ml-auto">{vehicles.filter(v => v.type === 'truck').length}</Badge>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {vehicles.filter(v => v.type === 'truck').map((vehicle) => (
                    <VehicleCard key={vehicle.id} vehicle={vehicle} trips={trips} onEdit={startEditVehicle} onDelete={deleteVehicle} onOpenDetails={setViewDetailsVehicle} />
                  ))}
                  {vehicles.filter(v => v.type === 'truck').length === 0 && (
                    <div className="col-span-full py-8 text-center bg-slate-50 rounded-lg border border-dashed border-slate-200">
                      <p className="text-slate-400 text-sm">No trucks registered.</p>
                    </div>
                  )}
                </div>
              </section>

              {/* Trailers Section */}
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <Fuel className="h-5 w-5 text-slate-600 rotate-90" />
                  <h3 className="font-bold text-lg">Trailers</h3>
                  <Badge variant="outline" className="ml-auto">{vehicles.filter(v => v.type === 'trailer').length}</Badge>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {vehicles.filter(v => v.type === 'trailer').map((vehicle) => (
                    <VehicleCard key={vehicle.id} vehicle={vehicle} trips={trips} onEdit={startEditVehicle} onDelete={deleteVehicle} onOpenDetails={setViewDetailsVehicle} />
                  ))}
                  {vehicles.filter(v => v.type === 'trailer').length === 0 && (
                    <div className="col-span-full py-8 text-center bg-slate-50 rounded-lg border border-dashed border-slate-200">
                      <p className="text-slate-400 text-sm">No trailers registered.</p>
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>
        </TabsContent>


        <TabsContent value="drivers" className="space-y-6 mt-0 pb-24 sm:pb-12">
           <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column: Driver Self-Onboarding & Add Driver Form */}
            <div className="lg:col-span-1 space-y-6 min-w-0">

              {/* ── 1. Driver Self-Onboarding Card (Immediately Above Add New Driver Form) ── */}
              <Card className="shadow-sm border-amber-200/90 bg-gradient-to-br from-amber-50/70 via-amber-50/30 to-white overflow-hidden min-w-0">
                <CardContent className="p-4 sm:p-5 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-lg bg-amber-100 border border-amber-200/80 flex items-center justify-center text-amber-700 shadow-xs shrink-0">
                        <Sparkles className="h-4 w-4" />
                      </div>
                      <span className="text-sm font-bold text-slate-900">Driver Self-Onboarding</span>
                    </div>
                    <span className="text-[10px] font-bold text-amber-800 bg-amber-100/90 border border-amber-200 px-2 py-0.5 rounded-full">
                      Valid for 7 Days · No Login Needed
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Enter the driver&apos;s name and email or phone. Send them a secure self-onboarding link so they can complete their license number, issuing state, endorsements, license &amp; medical card photos, expirations, emergency contact, and address themselves.
                  </p>
                  <div className="pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full sm:w-auto border-amber-300 text-amber-900 bg-white hover:bg-amber-100 font-bold text-xs flex items-center justify-center gap-2 h-auto min-h-9 py-2 px-3 whitespace-normal text-center leading-snug shadow-xs transition-all hover:-translate-y-0.5 cursor-pointer"
                      onClick={() => handleSendSelfOnboarding()}
                      disabled={isGeneratingOnboardingLink}
                    >
                      {isGeneratingOnboardingLink ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-600 shrink-0" />
                          <span>Generating Link...</span>
                        </>
                      ) : (
                        <>
                          <Send className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                          <span>Send Self-Onboarding Link</span>
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* ── 2. Add New Driver / Update Driver Form Card ─────────────────── */}
              <Card className="shadow-sm border-slate-200 h-fit min-w-0">

              <CardHeader className="px-4 sm:px-6">
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-blue-600 shrink-0" />
                  {editingDriverUid ? 'Update Driver' : 'Add New Driver'}
                </CardTitle>
                <CardDescription>Maintain driver profiles and compliance.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 px-4 sm:px-6">

                {!editingDriverUid && isStarter && driverCount >= 1 && (
                  <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 space-y-2">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-bold">Starter Plan Limit: 1 Driver Reached</p>
                        <p className="text-[11px] text-amber-700 mt-0.5 leading-snug">
                          Your Starter plan includes 1 driver login ({driverProfiles[0]?.name || '1 registered'}). To add additional drivers and unlock live HOS telemetry, upgrade to Fleet Pro.
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      type="button"
                      onClick={() => setNavTab('billing')}
                      className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs h-auto min-h-8 py-1.5 px-3 whitespace-normal text-center leading-snug shadow-xs gap-1.5"
                    >
                      <Sparkles className="h-3.5 w-3.5 text-amber-200 shrink-0" />
                      <span>Upgrade to Fleet Pro for Unlimited Drivers</span>
                    </Button>
                  </div>
                )}

                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    Full Name <span className="text-red-500 font-bold">*</span>
                  </Label>
                  <Input 
                    id="d-name" 
                    placeholder="e.g. John Doe" 
                    value={driverForm.name}
                    onChange={(e) => setDriverForm({...driverForm, name: e.target.value})}
                    className={!driverForm.name ? "border-red-300 bg-red-50" : ""}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="d-email">Email</Label>
                    <Input id="d-email" type="email" value={driverForm.email} onChange={(e) => setDriverForm({...driverForm, email: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="d-phone">Phone</Label>
                    <Input 
                      id="d-phone" 
                      type="tel"
                      value={driverForm.phone} 
                      onChange={(e) => setDriverForm(prev => ({ ...prev, phone: sanitizePhoneDigits(e.target.value) }))} 
                      onPaste={(e) => handlePhonePaste(e, (sanitized) => setDriverForm(prev => ({ ...prev, phone: sanitized })))}
                      placeholder="e.g., 5551234567"
                      maxLength={10}
                    />
                  </div>
                </div>

                <div className="pt-4 border-t space-y-4">
                  <h4 className="text-xs font-semibold uppercase text-slate-500">Driver Licensing Status</h4>
                  {/* ── CDL Toggle ─────────────────────────────────────── */}
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-slate-600">License Class</Label>
                    <div className="flex p-1 bg-slate-100 rounded-lg gap-1">
                      <button
                        type="button"
                        id="cdl-status-class-a"
                        onClick={() => setDriverForm({ ...driverForm, cdlStatus: 'Class A CDL' })}
                        className={`flex-1 py-2.5 px-3 text-xs font-bold rounded-md transition-all duration-200 flex items-center justify-center gap-1.5 ${
                          (driverForm as any).cdlStatus === 'Class A CDL'
                            ? 'bg-blue-600 text-white shadow-sm shadow-blue-200'
                            : 'text-slate-500 hover:text-blue-600 hover:bg-blue-50'
                        }`}
                      >
                        <ShieldCheck className="h-3.5 w-3.5" />
                        Class A CDL
                      </button>
                      <button
                        type="button"
                        id="cdl-status-non-cdl"
                        onClick={() => setDriverForm({ ...driverForm, cdlStatus: 'Non-CDL' })}
                        className={`flex-1 py-2.5 px-3 text-xs font-bold rounded-md transition-all duration-200 flex items-center justify-center gap-1.5 ${
                          (driverForm as any).cdlStatus !== 'Class A CDL'
                            ? 'bg-white text-slate-600 shadow-sm border border-slate-200'
                            : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <ShieldAlert className="h-3.5 w-3.5" />
                        Non-CDL
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-snug">
                      {(driverForm as any).cdlStatus === 'Class A CDL'
                        ? '✓ Qualified for all equipment combinations — no weight restrictions apply.'
                        : '⚠ Non-CDL drivers are blocked from equipment combinations with GCWR over 26,000 lbs (49 CFR § 383.91).'}
                    </p>
                  </div>
                </div>

                <div className="pt-4 border-t space-y-4">
                  <h4 className="text-xs font-semibold uppercase text-slate-500">Duty &amp; Availability Status</h4>
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-slate-600">Current Duty Status</Label>
                    <div className="flex p-1 bg-slate-100 rounded-lg gap-1">
                      <button
                        type="button"
                        id="duty-status-active"
                        onClick={() => setDriverForm({ ...driverForm, status: 'active' })}
                        className={`flex-1 py-2 px-3 text-xs font-bold rounded-md transition-all duration-200 flex items-center justify-center gap-1.5 ${
                          driverForm.status === 'active'
                            ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-200'
                            : 'text-slate-600 hover:text-emerald-700 hover:bg-emerald-50'
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full bg-emerald-300" />
                        Active / Available
                      </button>
                      <button
                        type="button"
                        id="duty-status-off-duty"
                        onClick={() => setDriverForm({ ...driverForm, status: 'off-duty' })}
                        className={`flex-1 py-2 px-3 text-xs font-bold rounded-md transition-all duration-200 flex items-center justify-center gap-1.5 ${
                          driverForm.status === 'off-duty' || (driverForm as any).status === 'Off Duty'
                            ? 'bg-slate-700 text-white shadow-sm shadow-slate-300'
                            : 'text-slate-600 hover:text-slate-800 hover:bg-slate-200'
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full bg-slate-400" />
                        Off Duty
                      </button>
                      <button
                        type="button"
                        id="duty-status-on-leave"
                        onClick={() => setDriverForm({ ...driverForm, status: 'on-leave' })}
                        className={`flex-1 py-2 px-3 text-xs font-bold rounded-md transition-all duration-200 flex items-center justify-center gap-1.5 ${
                          driverForm.status === 'on-leave'
                            ? 'bg-amber-600 text-white shadow-sm'
                            : 'text-slate-600 hover:text-amber-700 hover:bg-amber-50'
                        }`}
                      >
                        On Leave
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-snug">
                      {driverForm.status === 'off-duty' || (driverForm as any).status === 'Off Duty'
                        ? '⚪ Off Duty drivers are automatically hidden/disabled from active load assignment and smart routing.'
                        : '🟢 Active drivers are eligible for load dispatch and automatic telemetry routing.'}
                    </p>
                  </div>
                </div>
                <div className="pt-4 border-t space-y-4">
                  <h4 className="text-xs font-semibold uppercase text-slate-500">Compliance Documents</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-xs">License Number</Label>
                      <Input
                        placeholder="e.g. D12345678"
                        value={(driverForm as any).cdlNumber || ''}
                        onChange={(e) => setDriverForm({ ...driverForm, cdlNumber: e.target.value } as any)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">License Issuing State</Label>
                      <Input
                        placeholder="e.g. TX"
                        maxLength={2}
                        className="uppercase"
                        value={(driverForm as any).licenseIssuingState || ''}
                        onChange={(e) => setDriverForm({ ...driverForm, licenseIssuingState: e.target.value.toUpperCase() } as any)}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">License Expiration Date</Label>
                    <Input type="date" value={driverForm.cdlExpirationDate} onChange={(e) => setDriverForm({...driverForm, cdlExpirationDate: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Medical Card Expiration</Label>
                    <Input type="date" value={driverForm.medicalCardExpirationDate} onChange={(e) => setDriverForm({...driverForm, medicalCardExpirationDate: e.target.value})} />
                  </div>
                </div>

                <div className="pt-4 border-t space-y-4">
                  <h4 className="text-xs font-semibold uppercase text-slate-500">Asset Assignment</h4>
                  <div className="space-y-2">
                    <Label className="text-xs">Assigned Truck</Label>
                    <select 
                      className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-sm"
                      value={driverForm.assignedTruckId}
                      onChange={(e) => setDriverForm({...driverForm, assignedTruckId: e.target.value})}
                    >
                      <option value="">None</option>
                      {vehicles.filter(v => v.type === 'truck').map(v => (
                        <option key={v.id} value={v.id}>#{v.unitNumber} {v.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Assigned Trailer</Label>
                    <select 
                      className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-sm"
                      value={driverForm.assignedTrailerId}
                      onChange={(e) => setDriverForm({...driverForm, assignedTrailerId: e.target.value})}
                    >
                      <option value="">None</option>
                      {vehicles.filter(v => v.type === 'trailer').map(v => (
                        <option key={v.id} value={v.id}>#{v.unitNumber} {v.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="pt-4 border-t space-y-4">
                  <h4 className="text-xs font-semibold uppercase text-slate-500">Pay Compensation</h4>
                  <div className="space-y-2">
                    <Label className="text-xs">Pay Model</Label>
                    <select
                      className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-sm"
                      value={(driverForm as any).payType || 'percentage'}
                      onChange={(e) => setDriverForm({...driverForm, payType: e.target.value} as any)}
                    >
                      <option value="percentage">% of Load Gross</option>
                      <option value="per-mile">Cents Per Mile ($/mi)</option>
                      <option value="hourly">Hourly Rate ($/hr)</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">
                      {(driverForm as any).payType === 'per-mile'
                        ? 'Rate ($ per mile)'
                        : (driverForm as any).payType === 'hourly'
                        ? 'Hourly Rate ($/hr)'
                        : 'Payroll % of Gross'}
                    </Label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <Input
                        type="number"
                        step={((driverForm as any).payType === 'percentage' || !(driverForm as any).payType) ? '1' : '0.01'}
                        min="0"
                        className="pl-9"
                        placeholder={(driverForm as any).payType === 'percentage' || !(driverForm as any).payType ? 'e.g., 25' : 'e.g., 18.50'}
                        value={(driverForm as any).payRate ?? ''}
                        onChange={(e) => setDriverForm({
                          ...driverForm,
                          payRate: e.target.value === '' ? undefined : Number(e.target.value),
                          payrollPercentage: Number(e.target.value),
                        } as any)}
                      />
                    </div>
                  </div>

                  {(driverForm as any).payType === 'hourly' && (
                    <div className="space-y-2">
                      <Label className="text-xs">Est. Trip Hours (optional)</Label>
                      <Input
                        type="number"
                        step="0.5"
                        min="0"
                        placeholder="Auto-calculated from miles ÷ speed"
                        value={(driverForm as any).estimatedTripHours ?? ''}
                        onChange={(e) => setDriverForm({
                          ...driverForm,
                          estimatedTripHours: e.target.value === '' ? undefined : Number(e.target.value),
                        } as any)}
                      />
                      <p className="text-[10px] text-slate-400">Leave blank to auto-estimate from trip miles ÷ average speed.</p>
                    </div>
                  )}

                  <div className="space-y-2 pt-2 border-t border-slate-100">
                    <Label className="text-xs">Estimated HOS Remaining (Hours)</Label>
                    <div className="relative">
                      <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <Input
                        type="number"
                        step="0.5"
                        min="0"
                        max="11"
                        className="pl-9"
                        placeholder="11.0"
                        value={(driverForm as any).estimatedHosRemaining ?? 11.0}
                        onChange={(e) => setDriverForm({
                          ...driverForm,
                          estimatedHosRemaining: e.target.value === '' ? 11.0 : Number(e.target.value),
                        } as any)}
                      />
                    </div>
                    <p className="text-[10px] text-slate-400">FMCSA maximum daily drive limit defaults to 11.0 hours.</p>
                  </div>
                </div>
              </CardContent>

              {/* ── Automatic Limited Driver View Account Section ─────────────────────────────── */}
              {!editingDriverUid && (
                <div className="px-4 sm:px-6 pb-4 space-y-3 border-t border-slate-100 pt-4">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span className="text-sm font-semibold text-slate-800">Limited Driver View Account (Created Automatically)</span>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Saving this driver automatically creates their restricted <strong>Driver View</strong> login (showing only their own profile and assigned loads) and sends credentials &amp; a direct access link to the email/phone entered on this form.
                  </p>
                  <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3 text-xs text-emerald-800 flex items-start gap-2">
                    <Mail className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div className="min-w-0 break-words">
                      <strong>Auto-Provisioned on Save:</strong> Credentials and a 1-tap Driver View link will be sent to{' '}
                      <span className="font-semibold underline break-all">
                        {driverForm.email || driverLoginEmail || driverForm.phone || 'the email/phone entered above'}
                      </span>.
                    </div>
                  </div>
                </div>
              )}

              <CardFooter className="flex flex-col items-stretch gap-2.5 border-t pt-4 px-4 sm:px-6">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full">
                  {editingDriverUid && (
                    <Button variant="outline" className="w-full sm:w-auto text-xs h-auto min-h-9 py-2 px-3 whitespace-normal" onClick={() => {
                      setEditingDriverUid(null);
                      lsClear(LS_DRIVER);
                      setDriverForm(defaultDriverForm);
                    }}>Cancel</Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full flex-1 border-amber-300 bg-amber-50/70 text-amber-900 hover:bg-amber-100 text-xs font-bold flex items-center justify-center gap-1.5 h-auto min-h-9 py-2 px-3 whitespace-normal text-center leading-snug"
                    onClick={() => handleSendSelfOnboarding()}
                    disabled={isGeneratingOnboardingLink || isSubmitting}
                  >
                    {isGeneratingOnboardingLink ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                        <span>Generating...</span>
                      </>
                    ) : (
                      <>
                        <Send className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                        <span>Send Self-Onboarding Link</span>
                      </>
                    )}
                  </Button>
                </div>
                <Button 
                  className={cn(
                    "w-full transition-colors text-xs font-semibold whitespace-normal h-auto min-h-10 py-2.5 px-3 text-center leading-snug break-words",
                    !editingDriverUid && isStarter && driverCount >= 1
                      ? "bg-amber-600 hover:bg-amber-700 text-white font-semibold"
                      : ""
                  )} 
                  onClick={() => {
                    if (!editingDriverUid && isStarter && driverCount >= 1) {
                      setShowUpgradeModal(true);
                      return;
                    }
                    handleSaveDriver();
                  }} 
                  disabled={isSubmitting || isCreatingLogin}
                >
                  {isCreatingLogin 
                    ? 'Creating Driver View Account…' 
                    : isSubmitting 
                        ? 'Saving Driver...' 
                        : (editingDriverUid 
                            ? 'Update Driver' 
                            : (isStarter && driverCount >= 1 
                                ? 'Limit Reached · Upgrade to Fleet Pro' 
                                : 'Save Driver & Create Driver View Login'))}
                </Button>
              </CardFooter>

            </Card>
          </div>


          {/* Driver List */}
            <div className="lg:col-span-2 min-w-0 grid grid-cols-1 md:grid-cols-2 gap-6 content-start">
              {driverProfiles.map((driver) => {
                const cdlDaysLeft = driver.cdlExpirationDate ? Math.ceil((new Date(driver.cdlExpirationDate).getTime() - new Date().getTime()) / (1000 * 3600 * 24)) : null;
                const medDaysLeft = driver.medicalCardExpirationDate ? Math.ceil((new Date(driver.medicalCardExpirationDate).getTime() - new Date().getTime()) / (1000 * 3600 * 24)) : null;

                const driverCdlStatus = driver.cdlStatus ?? 'Non-CDL';
                const isCdl = driverCdlStatus === 'Class A CDL';
                const isOffDuty = isDriverOffDuty(driver);
                const activeTripForDriver = trips?.find(t => (t.status === 'active' || t.status === 'planned') && t.assignedDriverId === driver.uid);
                return (
                  <Card key={driver.uid} className={`shadow-sm hover:shadow-md transition-all min-w-0 overflow-hidden ${isOffDuty ? 'border-slate-300 bg-slate-50/40' : 'border-slate-200'}`}>
                    <CardHeader className="pb-3">
                      <div className="flex flex-col gap-2.5">
                        <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                          <div className={`h-10 w-10 rounded-full flex items-center justify-center text-white font-bold shrink-0 ${ isOffDuty ? 'bg-slate-400' : isCdl ? 'bg-blue-600' : 'bg-emerald-600' }`}>
                            {driver.name.charAt(0)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <CardTitle className="text-lg font-bold">{driver.name}</CardTitle>
                              {isCdl ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black tracking-wide bg-blue-100 text-blue-700 border border-blue-200 uppercase">
                                  <ShieldCheck className="h-3 w-3" />
                                  CDL
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black tracking-wide bg-slate-100 text-slate-500 border border-slate-200 uppercase">
                                  <ShieldAlert className="h-3 w-3" />
                                  Non-CDL
                                </span>
                              )}
                              {isOffDuty ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide bg-slate-200 text-slate-700 border border-slate-300 uppercase">
                                  <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                                  Off Duty
                                </span>
                              ) : driver.status === 'on-leave' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide bg-amber-100 text-amber-700 border border-amber-200 uppercase">
                                  On Leave
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide bg-emerald-100 text-emerald-700 border border-emerald-200 uppercase">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                  Active
                                </span>
                              )}

                              {/* Onboarding Status Indicator Badge */}
                              {(() => {
                                const status = driver.onboardingStatus;
                                const isExpired = driver.onboardingExpiresAt && new Date(driver.onboardingExpiresAt) < new Date();

                                if (status === 'completed') {
                                  return (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide bg-emerald-100 text-emerald-800 border border-emerald-300 uppercase">
                                      <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                                      Completed
                                    </span>
                                  );
                                }

                                if (status === 'pending') {
                                  if (isExpired) {
                                    return (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide bg-slate-100 text-slate-600 border border-slate-300 uppercase">
                                        <Clock className="h-3 w-3 text-slate-500" />
                                        Expired
                                      </span>
                                    );
                                  }
                                  return (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide bg-amber-100 text-amber-800 border border-amber-300 uppercase">
                                      <Send className="h-3 w-3 text-amber-600" />
                                      Invite Sent
                                    </span>
                                  );
                                }

                                return null;
                              })()}

                              {/* HOS Badge with Click-to-Edit and Reset */}
                              {(() => {
                                const hos = driver.estimatedHosRemaining ?? 11.0;
                                const isEditing = editingHosDriverUid === driver.uid;
                                const colorClass = hos > 5
                                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                  : hos >= 2
                                  ? 'bg-amber-100 text-amber-800 border-amber-300'
                                  : 'bg-red-100 text-red-800 border-red-300';

                                if (isEditing) {
                                  return (
                                    <div className="inline-flex items-center gap-1">
                                      <input
                                        type="number"
                                        step="0.1"
                                        min="0"
                                        max="11"
                                        autoFocus
                                        value={editingHosValue}
                                        onChange={(e) => setEditingHosValue(e.target.value)}
                                        onKeyDown={async (e) => {
                                          if (e.key === 'Enter') {
                                            const val = parseFloat(editingHosValue);
                                            if (!isNaN(val)) {
                                              const clamped = Math.max(0, Math.min(11, Math.round(val * 10) / 10));
                                              await updateDriverProfile(driver.uid, { estimatedHosRemaining: clamped });
                                              toast({ title: 'HOS Updated', description: `${driver.name}'s HOS set to ${clamped.toFixed(1)} hrs.` });
                                            }
                                            setEditingHosDriverUid(null);
                                          } else if (e.key === 'Escape') {
                                            setEditingHosDriverUid(null);
                                          }
                                        }}
                                        onBlur={async () => {
                                          const val = parseFloat(editingHosValue);
                                          if (!isNaN(val)) {
                                            const clamped = Math.max(0, Math.min(11, Math.round(val * 10) / 10));
                                            await updateDriverProfile(driver.uid, { estimatedHosRemaining: clamped });
                                            toast({ title: 'HOS Updated', description: `${driver.name}'s HOS set to ${clamped.toFixed(1)} hrs.` });
                                          }
                                          setEditingHosDriverUid(null);
                                        }}
                                        className="h-6 w-16 px-1.5 text-xs font-bold border rounded bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-sky-500"
                                      />
                                      <span className="text-[10px] text-slate-400 font-bold">hrs</span>
                                    </div>
                                  );
                                }

                                return (
                                  <div className="inline-flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingHosDriverUid(driver.uid);
                                        setEditingHosValue(hos.toFixed(1));
                                      }}
                                      title="Click to manually edit remaining HOS hours"
                                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide border cursor-pointer hover:opacity-85 transition-opacity ${colorClass}`}
                                    >
                                      <Clock className="h-2.5 w-2.5" />
                                      HOS: {hos.toFixed(1)} hrs
                                    </button>
                                    <button
                                      type="button"
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        await updateDriverProfile(driver.uid, { estimatedHosRemaining: 11.0 });
                                        toast({ title: 'HOS Reset', description: `${driver.name}'s HOS reset to 11.0 hrs.` });
                                      }}
                                      title="Reset HOS to 11.0 hrs"
                                      className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors"
                                    >
                                      <RotateCcw className="h-3 w-3" />
                                    </button>
                                  </div>
                                );
                              })()}
                            </div>
                            <CardDescription className="truncate">{driver.email}</CardDescription>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                          <select
                            value={isOffDuty ? 'off-duty' : driver.status === 'on-leave' ? 'on-leave' : 'active'}
                            onChange={async (e) => {
                              const val = e.target.value as 'active' | 'off-duty' | 'on-leave';
                              try {
                                await updateDriverProfile(driver.uid, {
                                  status: val,
                                  availabilityStatus: val === 'off-duty' ? 'Off Duty' : 'Available',
                                });
                                toast({
                                  title: val === 'off-duty' ? 'Driver Set to Off Duty' : 'Status Updated',
                                  description: `${driver.name} is now ${val === 'off-duty' ? 'Off Duty' : val}.`,
                                });
                              } catch (err: any) {
                                toast({
                                  title: 'Update Failed',
                                  description: err?.message || 'Could not update status.',
                                  variant: 'destructive',
                                });
                              }
                            }}
                            className={`h-7 px-2 text-[10px] font-bold rounded-md border transition-colors cursor-pointer ${
                              isOffDuty
                                ? 'bg-slate-200 text-slate-700 border-slate-300 hover:bg-slate-300'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                            }`}
                            title="Quick toggle driver status"
                          >
                            <option value="active">Active</option>
                            <option value="off-duty">Off Duty</option>
                            <option value="on-leave">On Leave</option>
                          </select>
                          <Button variant="outline" size="sm" className="h-7 px-2 text-xs text-slate-600 hover:text-blue-600 flex items-center gap-1" onClick={() => setViewDetailsDriver(driver)}>
                            <Eye className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Details</span>
                          </Button>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-500 hover:text-blue-600" onClick={() => startEditDriver(driver)} title="Edit Driver">
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-500 hover:text-red-700" onClick={() => setDriverToDelete(driver)} title="Remove Driver">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Active Trip Banner if assigned */}
                      {activeTripForDriver && (
                        <div className="flex items-center justify-between gap-2 px-3 py-2 bg-purple-50 border border-purple-200 rounded-lg text-xs">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <Route className="h-3.5 w-3.5 text-purple-700 shrink-0" />
                            <span className="font-semibold text-purple-900 truncate">On Trip: {activeTripForDriver.name}</span>
                          </div>
                          <Badge className="bg-purple-600 hover:bg-purple-700 text-white text-[9px] uppercase px-1.5 py-0">En Route</Badge>
                        </div>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                        <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-100 min-w-0">
                          <label htmlFor={`card-truck-${driver.uid}`} className="text-[10px] uppercase text-blue-500 font-bold block mb-1">Assigned Truck</label>
                          <select
                            id={`card-truck-${driver.uid}`}
                            value={driver.assignedTruckId || ''}
                            onChange={async (e) => {
                              const val = e.target.value;
                              await updateDriverProfile(driver.uid, { assignedTruckId: val });
                            }}
                            className="w-full h-8 rounded-md border border-blue-200 bg-white px-2 text-xs font-semibold text-blue-800 truncate focus:outline-none focus:ring-1 focus:ring-blue-500"
                          >
                            <option value="">None</option>
                            {vehicles.filter(v => v.type === 'truck').map(v => (
                              <option key={v.id} value={v.id}>#{v.unitNumber} {v.name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 min-w-0">
                          <label htmlFor={`card-trailer-${driver.uid}`} className="text-[10px] uppercase text-slate-500 font-bold block mb-1">Assigned Trailer</label>
                          <select
                            id={`card-trailer-${driver.uid}`}
                            value={driver.assignedTrailerId || ''}
                            onChange={async (e) => {
                              const val = e.target.value;
                              await updateDriverProfile(driver.uid, { assignedTrailerId: val });
                            }}
                            className="w-full h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 truncate focus:outline-none focus:ring-1 focus:ring-blue-500"
                          >
                            <option value="">None</option>
                            {vehicles.filter(v => v.type === 'trailer').map(v => (
                              <option key={v.id} value={v.id}>#{v.unitNumber} {v.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-3">

                        {/* License Status */}
                        <div className={`p-3 rounded-lg border flex items-center justify-between ${cdlDaysLeft !== null && cdlDaysLeft < 30 ? 'bg-red-50 border-red-100' : 'bg-slate-50 border-slate-100'}`}>
                          <div className="flex items-center gap-2 min-w-0">
                            <ShieldCheck className={`h-4 w-4 shrink-0 ${cdlDaysLeft !== null && cdlDaysLeft < 30 ? 'text-red-500' : 'text-green-600'}`} />
                            <div className="min-w-0">
                              <span className="text-xs font-medium block">Driver&apos;s License</span>
                              {(driver.cdlNumber || driver.idNumber || driver.licenseIssuingState) && (
                                <span className="text-[10px] font-semibold text-slate-500 truncate block">
                                  {driver.licenseIssuingState ? `${driver.licenseIssuingState} ` : ''}
                                  {driver.cdlNumber || driver.idNumber ? `#${driver.cdlNumber || driver.idNumber}` : ''}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-[10px] uppercase text-slate-400 font-bold">Expires</p>
                            <p className={`text-xs font-bold ${cdlDaysLeft !== null && cdlDaysLeft < 30 ? 'text-red-600' : 'text-slate-700'}`}>
                              {(() => { try { const d = new Date(driver.cdlExpirationDate); return driver.cdlExpirationDate && isValid(d) ? format(d, 'MMM d, yyyy') : 'Missing'; } catch { return 'Invalid'; } })()}
                            </p>
                          </div>
                        </div>

                        {/* Medical Status */}
                        <div className={`p-3 rounded-lg border flex items-center justify-between ${medDaysLeft !== null && medDaysLeft < 30 ? 'bg-red-50 border-red-100' : 'bg-slate-50 border-slate-100'}`}>
                          <div className="flex items-center gap-2">
                            <ShieldCheck className={`h-4 w-4 ${medDaysLeft !== null && medDaysLeft < 30 ? 'text-red-500' : 'text-green-600'}`} />
                            <span className="text-xs font-medium">Medical Card</span>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] uppercase text-slate-400 font-bold">Expires</p>
                            <p className={`text-xs font-bold ${medDaysLeft !== null && medDaysLeft < 30 ? 'text-red-600' : 'text-slate-700'}`}>
                              {(() => { try { const d = new Date(driver.medicalCardExpirationDate); return driver.medicalCardExpirationDate && isValid(d) ? format(d, 'MMM d, yyyy') : 'Missing'; } catch { return 'Invalid'; } })()}
                            </p>
                          </div>
                        </div>

                        {/* Endorsements Badges on Roster Card */}
                        {((driver.endorsements && driver.endorsements.length > 0) || driver.additionalEndorsements) && (
                          <div className="p-2.5 rounded-lg bg-amber-50/60 border border-amber-200/70 space-y-1.5">
                            <p className="text-[10px] uppercase font-bold text-amber-800 tracking-wider">Endorsements</p>
                            <div className="flex flex-wrap gap-1">
                              {(driver.endorsements || []).map((end) => (
                                <Badge key={end} variant="secondary" className="text-[10px] bg-amber-100 text-amber-900 border border-amber-300 font-semibold">
                                  {end}
                                </Badge>
                              ))}
                              {driver.additionalEndorsements && (
                                <Badge variant="secondary" className="text-[10px] bg-slate-100 text-slate-800 border border-slate-300 font-medium">
                                  {driver.additionalEndorsements}
                                </Badge>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Uploaded Compliance Files Indicator on Roster Card */}
                        {(driver.licenseFrontUrl || driver.licenseBackUrl || driver.medicalCardUrl) && (
                          <div className="p-2.5 rounded-lg bg-emerald-50/60 border border-emerald-200/70 flex items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {driver.licenseFrontUrl && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-emerald-200 text-[10px] font-semibold text-emerald-800">
                                  <CheckCircle2 className="h-2.5 w-2.5 text-emerald-600" />
                                  License Front
                                </span>
                              )}
                              {driver.licenseBackUrl && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-emerald-200 text-[10px] font-semibold text-emerald-800">
                                  <CheckCircle2 className="h-2.5 w-2.5 text-emerald-600" />
                                  License Back
                                </span>
                              )}
                              {driver.medicalCardUrl && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-emerald-200 text-[10px] font-semibold text-emerald-800">
                                  <CheckCircle2 className="h-2.5 w-2.5 text-emerald-600" />
                                  Med Card
                                </span>
                              )}
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setViewDetailsDriver(driver)}
                              className="h-6 px-2 text-[10px] font-bold text-emerald-800 hover:bg-emerald-100 shrink-0"
                            >
                              View Files
                            </Button>
                          </div>
                        )}

                        {/* Inline Contact & Basic Profile Editor */}
                        <DriverContactEditor
                          driver={driver}
                          onSaveContact={async (updates) => {
                            await updateDriverProfile(driver.uid, updates);
                          }}
                        />

                        {/* Inline Pay Compensation Editor */}
                        <DriverPayEditor
                          driver={driver}
                          onSavePay={async (updates) => {
                            await updateDriverProfile(driver.uid, updates);
                          }}
                        />
                      </div>

                      {/* Driver Self-Onboarding Status & Action Row */}
                      <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5 text-xs">
                          {driver.onboardingStatus === 'completed' ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold text-[11px]">
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                              Profile Submitted
                            </span>
                          ) : driver.onboardingStatus === 'pending' ? (
                            (() => {
                              const isExp = driver.onboardingExpiresAt && new Date(driver.onboardingExpiresAt) < new Date();
                              return isExp ? (
                                <span className="inline-flex items-center gap-1 text-slate-500 font-semibold text-[11px]">
                                  <Clock className="h-3.5 w-3.5 text-slate-400" />
                                  Link Expired
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-amber-700 font-semibold text-[11px]">
                                  <Clock className="h-3.5 w-3.5 text-amber-500" />
                                  Invite Sent (Pending)
                                </span>
                              );
                            })()
                          ) : (
                            <span className="text-slate-400 text-[11px]">
                              Self-onboarding: Not invited
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 ml-auto flex-wrap">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 px-2.5 text-[11px] font-bold border-emerald-300 text-emerald-900 bg-emerald-50/60 hover:bg-emerald-100 flex items-center gap-1"
                            onClick={() => handleOpenOrProvisionCredentials(driver)}
                            title="View or send limited Driver View login credentials & direct magic link"
                          >
                            <ShieldCheck className="h-3 w-3 text-emerald-600" />
                            Driver View Login
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 px-2.5 text-[11px] font-bold border-amber-300 text-amber-900 bg-amber-50/50 hover:bg-amber-100 flex items-center gap-1"
                            onClick={() => handleSendSelfOnboarding(driver)}
                            title="Send or resend a 7-day self-onboarding link"
                          >
                            <Send className="h-3 w-3 text-amber-600" />
                            {driver.onboardingStatus === 'pending' ? 'Resend Link' : 'Send Self-Onboarding Link'}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 px-2.5 text-[11px] font-bold border-red-200 text-red-600 bg-red-50/40 hover:bg-red-50 hover:text-red-700 flex items-center gap-1"
                            onClick={() => setDriverToDelete(driver)}
                          >
                            <Trash2 className="h-3 w-3" />
                            Remove Driver
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              {driverProfiles.length === 0 && (
                <div className="col-span-full py-12 text-center bg-slate-50 rounded-lg border-2 border-dashed border-slate-200">
                  <Users className="h-12 w-12 mx-auto text-slate-300 mb-4" />
                  <p className="text-slate-500">No driver profiles created yet.</p>
                </div>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>


      {/* ── Vehicle Details Modal ── */}
      <Dialog open={!!viewDetailsVehicle} onOpenChange={(open) => !open && setViewDetailsVehicle(null)}>
        <DialogContent className="max-w-md w-full">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className={`p-2 rounded-lg ${viewDetailsVehicle?.type === 'truck' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-700'}`}>
                {viewDetailsVehicle?.type === 'truck' ? <Truck className="h-5 w-5" /> : <Fuel className="h-5 w-5 rotate-90" />}
              </div>
              <div>
                <DialogTitle className="text-lg font-bold">#{viewDetailsVehicle?.unitNumber} — {viewDetailsVehicle?.name}</DialogTitle>
                <DialogDescription className="text-xs uppercase font-semibold text-slate-500">
                  {viewDetailsVehicle?.type === 'truck' ? 'Power Unit (Truck)' : 'Towed Unit (Trailer)'} Details
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {viewDetailsVehicle && (
            <div className="space-y-4 py-2 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div>
                  <span className="text-slate-400 uppercase font-bold text-[10px] block">Ownership</span>
                  <span className="font-semibold text-slate-800 text-sm">{viewDetailsVehicle.isPaidOff ? 'Paid Off' : 'Financed'}</span>
                </div>
                <div>
                  <span className="text-slate-400 uppercase font-bold text-[10px] block">Operating GVWR</span>
                  <span className="font-semibold text-slate-800 text-sm">{viewDetailsVehicle.gvwr ? `${Number(viewDetailsVehicle.gvwr).toLocaleString()} lbs` : 'Not specified'}</span>
                </div>
              </div>

              {viewDetailsVehicle.type === 'trailer' && (
                <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100 space-y-2">
                  <p className="font-bold text-blue-900 uppercase text-[10px] tracking-wider">Trailer Deck & Payload Specifications</p>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <span className="text-slate-400 text-[10px] block">Empty Tare</span>
                      <span className="font-semibold text-slate-800">{viewDetailsVehicle.emptyWeight ? `${Number(viewDetailsVehicle.emptyWeight).toLocaleString()} lbs` : '—'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px] block">Max Payload</span>
                      <span className="font-semibold text-blue-700">{viewDetailsVehicle.payloadCapacity ? `${Number(viewDetailsVehicle.payloadCapacity).toLocaleString()} lbs` : '—'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px] block">Deck Dimensions</span>
                      <span className="font-semibold text-slate-800">{viewDetailsVehicle.trailerLength || '—'}L × {viewDetailsVehicle.trailerWidth || '—'}W ft</span>
                    </div>
                  </div>
                  {viewDetailsVehicle.deckHeight && (
                    <p className="text-[11px] text-slate-600">Deck Height: <span className="font-semibold">{viewDetailsVehicle.deckHeight} inches</span> off ground</p>
                  )}
                  {viewDetailsVehicle.axleConfiguration && (
                    <p className="text-[11px] text-slate-600">Axle Configuration: <span className="font-semibold">{viewDetailsVehicle.axleConfiguration}</span></p>
                  )}
                </div>
              )}

              {viewDetailsVehicle.type === 'truck' && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-2">
                  <p className="font-bold text-slate-700 uppercase text-[10px] tracking-wider">Mileage & Cost Settings</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-slate-400 text-[10px] block">Est. Monthly Miles</span>
                      <span className="font-semibold text-slate-800">{viewDetailsVehicle.estimatedMonthlyMiles ? Number(viewDetailsVehicle.estimatedMonthlyMiles).toLocaleString() : '10,000'} mi</span>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px] block">Avg Fuel MPG</span>
                      <span className="font-semibold text-slate-800">{viewDetailsVehicle.mpg || 10} MPG</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1.5">
                <p className="font-bold text-slate-700 uppercase text-[10px] tracking-wider">Financial Breakdown</p>
                <div className="flex justify-between text-slate-600">
                  <span>Monthly Insurance:</span>
                  <span className="font-semibold">${(viewDetailsVehicle.monthlyRecurringExpenses?.insurance || 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Monthly Payment:</span>
                  <span className="font-semibold">${(viewDetailsVehicle.monthlyRecurringExpenses?.payment || 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Maintenance Reserve:</span>
                  <span className="font-semibold">${(viewDetailsVehicle.monthlyRecurringExpenses?.maintenanceFund || 0).toLocaleString()}/mo</span>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setViewDetailsVehicle(null)}>Close</Button>
            <Button size="sm" onClick={() => {
              const v = viewDetailsVehicle;
              setViewDetailsVehicle(null);
              startEditVehicle(v);
            }}>Edit Vehicle</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Driver Details Modal ── */}
      <Dialog open={!!viewDetailsDriver} onOpenChange={(open) => !open && setViewDetailsDriver(null)}>
        <DialogContent className="max-w-lg w-full max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="h-10 w-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-base shrink-0">
                {viewDetailsDriver?.name?.charAt(0) || 'D'}
              </div>
              <div>
                <DialogTitle className="text-lg font-bold">{viewDetailsDriver?.name}</DialogTitle>
                <DialogDescription className="text-xs">{viewDetailsDriver?.email || 'No email registered'}</DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {viewDetailsDriver && (
            <div className="space-y-4 py-2 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div>
                  <span className="text-slate-400 uppercase font-bold text-[10px] block">License Class</span>
                  <span className="font-semibold text-slate-800 text-sm">{viewDetailsDriver.cdlStatus || 'Non-CDL'}</span>
                </div>
                <div>
                  <span className="text-slate-400 uppercase font-bold text-[10px] block">Duty Status</span>
                  <span className="font-semibold text-slate-800 text-sm capitalize">{viewDetailsDriver.status || 'Active'}</span>
                </div>
              </div>

              {/* Onboarding Status Block */}
              <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-200/80 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-amber-900 uppercase text-[10px] tracking-wider">Self-Onboarding Status</span>
                  {viewDetailsDriver.onboardingStatus === 'completed' ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300">
                      <CheckCircle2 className="h-3 w-3 text-emerald-600" /> Completed
                    </span>
                  ) : viewDetailsDriver.onboardingStatus === 'pending' ? (
                    (() => {
                      const isExp = viewDetailsDriver.onboardingExpiresAt && new Date(viewDetailsDriver.onboardingExpiresAt) < new Date();
                      return isExp ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-600 bg-slate-200 px-2 py-0.5 rounded-full border border-slate-300">
                          <Clock className="h-3 w-3 text-slate-500" /> Expired
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-200/80 px-2 py-0.5 rounded-full border border-amber-300">
                          <Send className="h-3 w-3 text-amber-600" /> Invite Sent
                        </span>
                      );
                    })()
                  ) : (
                    <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                      Not Invited
                    </span>
                  )}
                </div>

                {viewDetailsDriver.onboardingExpiresAt && (
                  <div className="text-[11px] text-slate-600 flex justify-between">
                    <span>Link Expiration:</span>
                    <span className="font-medium text-slate-800">
                      {format(new Date(viewDetailsDriver.onboardingExpiresAt), 'MMM d, yyyy h:mm a')}
                    </span>
                  </div>
                )}

                {viewDetailsDriver.onboardingCompletedAt && (
                  <div className="text-[11px] text-slate-600 flex justify-between">
                    <span>Submitted On:</span>
                    <span className="font-medium text-emerald-700">
                      {format(new Date(viewDetailsDriver.onboardingCompletedAt), 'MMM d, yyyy h:mm a')}
                    </span>
                  </div>
                )}

                <div className="pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full text-xs font-bold text-amber-900 border-amber-300 bg-white hover:bg-amber-100 flex items-center justify-center gap-1.5 h-8"
                    onClick={() => {
                      const d = viewDetailsDriver;
                      setViewDetailsDriver(null);
                      handleSendSelfOnboarding(d);
                    }}
                  >
                    <Send className="h-3.5 w-3.5 text-amber-600" />
                    {viewDetailsDriver.onboardingStatus === 'pending' ? 'Resend Onboarding Link' : 'Send Self-Onboarding Link'}
                  </Button>
                </div>
              </div>

              {/* Commercial Licensing & DOT Compliance */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-2">
                <p className="font-bold text-slate-700 uppercase text-[10px] tracking-wider">Licensing &amp; DOT Compliance</p>
                <div className="flex justify-between">
                  <span className="text-slate-500">License Number:</span>
                  <span className="font-semibold text-slate-800">{viewDetailsDriver.cdlNumber || viewDetailsDriver.idNumber || 'None'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">License Issuing State:</span>
                  <span className="font-semibold text-slate-800">{viewDetailsDriver.licenseIssuingState || 'None'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">License Expiration:</span>
                  <span className="font-semibold text-slate-800">{viewDetailsDriver.cdlExpirationDate || 'None'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">DOT Medical Card Expiration:</span>
                  <span className="font-semibold text-slate-800">{viewDetailsDriver.medicalCardExpirationDate || 'None'}</span>
                </div>
                {((viewDetailsDriver.endorsements && viewDetailsDriver.endorsements.length > 0) || viewDetailsDriver.additionalEndorsements) && (
                  <div className="pt-1.5 border-t border-slate-200/70 space-y-1.5">
                    <span className="text-slate-500 block">Endorsements &amp; Qualifications:</span>
                    <div className="flex flex-wrap gap-1">
                      {(viewDetailsDriver.endorsements || []).map((end: string) => (
                        <Badge key={end} variant="secondary" className="text-[10px] bg-amber-100 text-amber-900 border border-amber-300 font-semibold">
                          {end}
                        </Badge>
                      ))}
                      {viewDetailsDriver.additionalEndorsements && (
                        <Badge variant="secondary" className="text-[10px] bg-slate-200 text-slate-800 font-medium">
                          {viewDetailsDriver.additionalEndorsements}
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Uploaded Compliance Photos / Copies */}
              {(viewDetailsDriver.licenseFrontUrl || viewDetailsDriver.licenseBackUrl || viewDetailsDriver.medicalCardUrl) && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-2.5">
                  <p className="font-bold text-slate-700 uppercase text-[10px] tracking-wider">Uploaded Compliance Documents</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {[
                      { label: "Driver's License (Front)", url: viewDetailsDriver.licenseFrontUrl, name: viewDetailsDriver.licenseFrontName || 'license-front.jpg' },
                      { label: "Driver's License (Back)", url: viewDetailsDriver.licenseBackUrl, name: viewDetailsDriver.licenseBackName || 'license-back.jpg' },
                      { label: 'Medical Card Copy', url: viewDetailsDriver.medicalCardUrl, name: viewDetailsDriver.medicalCardName || 'medical-card.jpg' },
                    ].map((docItem) => (
                      <div key={docItem.label} className="rounded-lg border border-slate-200 bg-white p-2 flex flex-col justify-between gap-2">
                        <span className="text-[10px] font-bold text-slate-700 leading-tight">{docItem.label}</span>
                        {docItem.url ? (
                          <>
                            {docItem.url.startsWith('data:application/pdf') ? (
                              <div className="h-20 rounded bg-slate-100 flex flex-col items-center justify-center p-1 text-center">
                                <span className="text-[10px] font-bold text-slate-700">PDF Document</span>
                                <span className="text-[9px] text-slate-500 truncate max-w-full">{docItem.name}</span>
                              </div>
                            ) : (
                              <a href={docItem.url} download={docItem.name} target="_blank" rel="noopener noreferrer" className="block h-20 rounded overflow-hidden border border-slate-100 bg-slate-900">
                                <img src={docItem.url} alt={docItem.label} className="w-full h-full object-cover hover:opacity-90 transition-opacity" />
                              </a>
                            )}
                            <a
                              href={docItem.url}
                              download={docItem.name}
                              className="text-[10px] font-bold text-blue-600 hover:underline text-center block"
                            >
                              Download / Open
                            </a>
                          </>
                        ) : (
                          <div className="h-20 rounded bg-slate-50 border border-dashed border-slate-200 flex items-center justify-center text-[10px] text-slate-400">
                            Not uploaded
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Emergency Contact */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-2">
                <p className="font-bold text-slate-700 uppercase text-[10px] tracking-wider">Emergency Contact</p>
                <div className="flex justify-between">
                  <span className="text-slate-500">Name:</span>
                  <span className="font-semibold text-slate-800">{viewDetailsDriver.emergencyContactName || 'None'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Phone:</span>
                  <span className="font-semibold text-slate-800">{viewDetailsDriver.emergencyContactPhone || 'None'}</span>
                </div>
                {viewDetailsDriver.emergencyContactRelationship && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Relationship:</span>
                    <span className="font-semibold text-slate-800">{viewDetailsDriver.emergencyContactRelationship}</span>
                  </div>
                )}
              </div>

              {/* Residential Address */}
              {(viewDetailsDriver.homeAddress || viewDetailsDriver.homeCity) && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-2">
                  <p className="font-bold text-slate-700 uppercase text-[10px] tracking-wider">Residential Address</p>
                  <p className="text-slate-800 font-medium leading-relaxed">
                    {viewDetailsDriver.homeAddress && <span>{viewDetailsDriver.homeAddress}<br /></span>}
                    {viewDetailsDriver.homeCity && `${viewDetailsDriver.homeCity}, `}
                    {viewDetailsDriver.homeState} {viewDetailsDriver.homeZip}
                  </p>
                </div>
              )}

              {/* Driver Notes */}
              {viewDetailsDriver.driverNotes && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                  <p className="font-bold text-slate-700 uppercase text-[10px] tracking-wider">Driver Notes</p>
                  <p className="text-slate-700 whitespace-pre-wrap">{viewDetailsDriver.driverNotes}</p>
                </div>
              )}

              <DriverContactEditor
                driver={viewDetailsDriver}
                onSaveContact={async (updates) => {
                  setViewDetailsDriver((prev: any) => prev ? { ...prev, ...updates } : prev);
                  await updateDriverProfile(viewDetailsDriver.uid, updates);
                }}
              />

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-2.5">
                <p className="font-bold text-slate-700 uppercase text-[10px] tracking-wider">Assigned Equipment & Hours</p>
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="detail-assigned-truck" className="text-slate-500 shrink-0">Assigned Truck:</label>
                  <select
                    id="detail-assigned-truck"
                    value={viewDetailsDriver.assignedTruckId || ''}
                    onChange={async (e) => {
                      const val = e.target.value;
                      setViewDetailsDriver((prev: any) => prev ? { ...prev, assignedTruckId: val } : prev);
                      await updateDriverProfile(viewDetailsDriver.uid, { assignedTruckId: val });
                    }}
                    className="h-8 max-w-[200px] w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">None</option>
                    {vehicles.filter(v => v.type === 'truck').map(v => (
                      <option key={v.id} value={v.id}>#{v.unitNumber} {v.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="detail-assigned-trailer" className="text-slate-500 shrink-0">Assigned Trailer:</label>
                  <select
                    id="detail-assigned-trailer"
                    value={viewDetailsDriver.assignedTrailerId || ''}
                    onChange={async (e) => {
                      const val = e.target.value;
                      setViewDetailsDriver((prev: any) => prev ? { ...prev, assignedTrailerId: val } : prev);
                      await updateDriverProfile(viewDetailsDriver.uid, { assignedTrailerId: val });
                    }}
                    className="h-8 max-w-[200px] w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">None</option>
                    {vehicles.filter(v => v.type === 'trailer').map(v => (
                      <option key={v.id} value={v.id}>#{v.unitNumber} {v.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Remaining Drive HOS:</span>
                  <span className="font-semibold text-blue-700">{(viewDetailsDriver.estimatedHosRemaining ?? 11.0).toFixed(1)} hrs</span>
                </div>
              </div>

              <DriverPayEditor
                driver={viewDetailsDriver}
                onSavePay={async (updates) => {
                  setViewDetailsDriver((prev: any) => prev ? { ...prev, ...updates } : prev);
                  await updateDriverProfile(viewDetailsDriver.uid, updates);
                }}
              />
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
              onClick={() => {
                const d = viewDetailsDriver;
                setViewDetailsDriver(null);
                setDriverToDelete(d);
              }}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Remove Driver
            </Button>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setViewDetailsDriver(null)}>Close</Button>
              <Button size="sm" onClick={() => {
                const d = viewDetailsDriver;
                setViewDetailsDriver(null);
                startEditDriver(d);
              }}>Edit Driver</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Remove Driver Confirmation Dialog ── */}
      <Dialog open={!!driverToDelete} onOpenChange={(open) => !open && !isDeletingDriver && setDriverToDelete(null)}>
        <DialogContent className="max-w-md w-full">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900">Remove Driver?</DialogTitle>
            <DialogDescription className="text-xs text-slate-600 pt-1">
              Are you sure you want to remove <span className="font-semibold text-slate-800">{driverToDelete?.name}</span> from your fleet roster? This will remove their profile and equipment assignments.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isDeletingDriver}
              onClick={() => setDriverToDelete(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={isDeletingDriver}
              onClick={async () => {
                if (!driverToDelete) return;
                setIsDeletingDriver(true);
                try {
                  await deleteDriverProfile(driverToDelete.uid, true);
                  if (editingDriverUid === driverToDelete.uid) {
                    setEditingDriverUid(null);
                  }
                  setDriverToDelete(null);
                } finally {
                  setIsDeletingDriver(false);
                }
              }}
            >
              {isDeletingDriver ? 'Removing...' : 'Remove Driver'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Quick Self-Onboarding Prompt Dialog ── */}
      <Dialog open={isSendInvitePromptOpen} onOpenChange={setIsSendInvitePromptOpen}>
        <DialogContent className="max-w-md w-full bg-white text-slate-900">
          <DialogHeader>
            <div className="h-10 w-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center mb-1">
              <UserCheck className="h-5 w-5" />
            </div>
            <DialogTitle className="text-lg font-bold">Send Driver Self-Onboarding Link</DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Enter the driver&apos;s name and contact information. They will receive a secure portal link valid for 7 days with no app download or login required.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Driver Full Name *</label>
              <Input
                placeholder="e.g. John Doe"
                value={quickInviteName}
                onChange={(e) => setQuickInviteName(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Email Address</label>
              <Input
                type="email"
                placeholder="driver@example.com"
                value={quickInviteEmail}
                onChange={(e) => setQuickInviteEmail(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Mobile Phone (for SMS)</label>
              <Input
                type="tel"
                placeholder="(555) 000-0000"
                value={quickInvitePhone}
                onChange={(e) => setQuickInvitePhone(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsSendInvitePromptOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={isGeneratingOnboardingLink || !quickInviteName.trim()}
              className="bg-amber-600 hover:bg-amber-700 text-white font-medium"
              onClick={() => {
                if (!quickInviteName.trim()) {
                  toast({
                    title: 'Name Required',
                    description: 'Please enter the driver full name.',
                    variant: 'destructive',
                  });
                  return;
                }
                executeSendSelfOnboarding({
                  name: quickInviteName.trim(),
                  email: quickInviteEmail.trim(),
                  phone: quickInvitePhone.trim(),
                });
                setIsSendInvitePromptOpen(false);
              }}
            >
              {isGeneratingOnboardingLink ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-1.5" />
                  Generate & Send Link
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Driver Self-Onboarding Link Modal ── */}
      <Dialog open={isOnboardingModalOpen} onOpenChange={setIsOnboardingModalOpen}>
        <DialogContent className="max-w-md w-full bg-white text-slate-900">
          <DialogHeader>
            <div className="h-10 w-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center mb-1">
              <Send className="h-5 w-5" />
            </div>
            <DialogTitle className="text-lg font-bold">Driver Self-Onboarding Link</DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              A secure, single-use link has been generated for <strong>{onboardingModalData?.driverName}</strong>. Valid for 7 days.
            </DialogDescription>
          </DialogHeader>

          {onboardingModalData && (
            <div className="space-y-4 py-2">
              {onboardingModalData.emailSent ? (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <strong>Invitation Dispatched:</strong> An email was sent to <strong>{onboardingModalData.driverEmail}</strong> containing the onboarding link.
                  </div>
                </div>
              ) : onboardingModalData.driverEmail ? (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-start gap-2">
                  <Info className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    Onboarding link generated. You can copy the link below or send it via text message.
                  </div>
                </div>
              ) : null}

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700">Self-Onboarding Link (Valid 7 Days)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={onboardingModalData.inviteUrl}
                    className="bg-slate-50 border-slate-200 text-xs font-mono select-all text-slate-800 h-9"
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="h-9 px-3 bg-slate-900 hover:bg-slate-800 text-white shrink-0 text-xs font-semibold"
                    onClick={() => {
                      navigator.clipboard.writeText(onboardingModalData.inviteUrl);
                      toast({ title: 'Link Copied', description: 'Self-onboarding link copied to clipboard.' });
                    }}
                  >
                    <Copy className="h-3.5 w-3.5 mr-1" /> Copy
                  </Button>
                </div>
              </div>

              {/* SMS / Text Share Action */}
              {onboardingModalData.driverPhone && (
                <div className="p-3 bg-sky-50 border border-sky-200 rounded-lg flex items-center justify-between gap-3 text-xs">
                  <div className="space-y-0.5">
                    <span className="font-bold text-sky-950">Text Link to Driver</span>
                    <p className="text-[11px] text-sky-700">Direct SMS to {onboardingModalData.driverPhone}</p>
                  </div>
                  <a
                    href={`sms:${onboardingModalData.driverPhone}?body=${encodeURIComponent(
                      `You’ve been invited to complete your driver profile for ${onboardingModalData.companyName}. Click the link to enter your information: ${onboardingModalData.inviteUrl}`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold transition-colors"
                  >
                    <Phone className="h-3 w-3" /> Text Link
                  </a>
                </div>
              )}

              <div className="rounded-lg bg-slate-50 p-3 text-[11px] text-slate-500 space-y-1">
                <div className="flex justify-between">
                  <span>Expires:</span>
                  <span className="font-semibold text-slate-700">
                    {format(new Date(onboardingModalData.expiresAt), 'MMM d, yyyy h:mm a')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Access:</span>
                  <span className="font-semibold text-emerald-700">No login required (single-use)</span>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              className="w-full sm:w-auto"
              onClick={() => setIsOnboardingModalOpen(false)}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Limited Driver View Account Credentials & Magic Link Modal ── */}
      <Dialog
        open={Boolean(driverCredentialsModal)}
        onOpenChange={(open) => {
          if (!open) setDriverCredentialsModal(null);
        }}
      >
        <DialogContent className="max-w-md w-full bg-white text-slate-900">
          <DialogHeader>
            <div className="h-10 w-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center mb-1">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <DialogTitle className="text-lg font-bold">
              Limited Driver View Account Ready
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Restricted Driver View credentials for <strong>{driverCredentialsModal?.driverName}</strong>. Gives access ONLY to their own profile and assigned loads.
            </DialogDescription>
          </DialogHeader>

          {driverCredentialsModal && (
            <div className="space-y-4 py-2 text-xs">
              {driverCredentialsModal.emailSent && driverCredentialsModal.email ? (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <strong>Credentials Sent:</strong> Login credentials &amp; direct Driver View link were sent to <strong>{driverCredentialsModal.email}</strong>.
                  </div>
                </div>
              ) : null}

              {/* 1-Tap Direct Portal Link */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700">
                  Direct Driver View Link (Magic Link)
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={driverCredentialsModal.driverPortalUrl}
                    className="bg-slate-50 border-slate-200 text-xs font-mono select-all text-slate-800 h-9"
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="h-9 px-3 bg-slate-900 hover:bg-slate-800 text-white shrink-0 text-xs font-semibold"
                    onClick={() => {
                      navigator.clipboard.writeText(driverCredentialsModal.driverPortalUrl);
                      setCopiedCredField('portal');
                      setTimeout(() => setCopiedCredField(''), 2000);
                      toast({ title: 'Driver View Link Copied', description: 'Direct Driver View link copied to clipboard.' });
                    }}
                  >
                    <Copy className="h-3.5 w-3.5 mr-1" />
                    {copiedCredField === 'portal' ? 'Copied' : 'Copy'}
                  </Button>
                </div>
              </div>

              {/* Login Email & Temp Password Box */}
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 space-y-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Sign-In Credentials (/login)
                </p>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500">Login Email:</span>
                  <div className="flex items-center gap-1.5">
                    <code className="font-mono font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                      {driverCredentialsModal.loginEmail}
                    </code>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px]"
                      onClick={() => {
                        navigator.clipboard.writeText(driverCredentialsModal.loginEmail);
                        setCopiedCredField('email');
                        setTimeout(() => setCopiedCredField(''), 2000);
                      }}
                    >
                      {copiedCredField === 'email' ? 'Copied' : 'Copy'}
                    </Button>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500">Temporary Password:</span>
                  <div className="flex items-center gap-1.5">
                    <code className="font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      {driverCredentialsModal.tempPassword}
                    </code>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px]"
                      onClick={() => {
                        navigator.clipboard.writeText(driverCredentialsModal.tempPassword);
                        setCopiedCredField('pw');
                        setTimeout(() => setCopiedCredField(''), 2000);
                      }}
                    >
                      {copiedCredField === 'pw' ? 'Copied' : 'Copy'}
                    </Button>
                  </div>
                </div>
              </div>

              {/* SMS Share Action */}
              {driverCredentialsModal.smsShareUrl && (
                <div className="p-3 bg-sky-50 border border-sky-200 rounded-lg flex items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <span className="font-bold text-sky-950">Send Credentials via SMS</span>
                    <p className="text-[11px] text-sky-700">
                      Text link &amp; login to {driverCredentialsModal.phone}
                    </p>
                  </div>
                  <a
                    href={driverCredentialsModal.smsShareUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold transition-colors shrink-0"
                  >
                    <Phone className="h-3 w-3" /> Text Credentials
                  </a>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:justify-between">
            {driverCredentialsModal?.driverPortalUrl && (
              <a
                href={driverCredentialsModal.driverPortalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-slate-50 hover:bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700"
              >
                Preview Driver View Link ↗
              </a>
            )}
            <Button
              className="w-full sm:w-auto"
              onClick={() => setDriverCredentialsModal(null)}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* GCWR Compliance Block Modal */}
      <GcwrBlockModal
        isOpen={gcwrBlock !== null}
        onClose={() => setGcwrBlock(null)}
        driverName={gcwrBlock?.driverName ?? ''}
        gcwr={gcwrBlock?.gcwr ?? 0}
      />

      {/* ── Fleet Pro Extra Power Unit Confirmation Modal ── */}
      <Dialog open={showExtraTruckConfirmModal} onOpenChange={setShowExtraTruckConfirmModal}>
        <DialogContent className="max-w-md bg-white">
          <DialogHeader>
            <div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-1">
              <Truck className="h-5 w-5" />
            </div>
            <DialogTitle className="text-slate-900 font-headline">
              Confirm Additional Power Unit (+$25/mo)
            </DialogTitle>
            <DialogDescription className="text-slate-600 pt-2 text-xs space-y-3">
              <p>
                Your <strong>Fleet Pro</strong> plan includes <strong>3 Power Units</strong> in the base $99/mo rate.
              </p>
              <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-xl text-blue-900 text-xs">
                Registering <strong>Unit #{truckForm.unitNumber || 'New Truck'}</strong> will expand your active fleet to <strong>{truckCount + 1} power units</strong> and adjust your subscription by <strong>+$25/month</strong>.
              </div>
              <p className="text-slate-500 text-[11px]">
                You can delete inactive trucks at any time to remove extra rig charges.
              </p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 pt-4">
            <Button variant="outline" size="sm" onClick={() => setShowExtraTruckConfirmModal(false)}>
              Cancel
            </Button>
            <Button 
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold"
              onClick={async () => {
                setShowExtraTruckConfirmModal(false);
                await approveExtraTruck();
                await handleSaveAsset('truck');
              }}
            >
              Confirm &amp; Register Rig (+$25/mo)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Starter Plan Limit Upgrade Modal ── */}
      <Dialog open={showUpgradeModal} onOpenChange={setShowUpgradeModal}>
        <DialogContent className="max-w-md bg-white">
          <DialogHeader>
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 text-white flex items-center justify-center mb-1 shadow-sm">
              <Sparkles className="h-5 w-5" />
            </div>
            <DialogTitle className="text-slate-900 font-headline">
              Plan Limit Reached · Upgrade to Fleet Pro
            </DialogTitle>
            <DialogDescription className="text-slate-600 pt-2 text-xs space-y-3">
              <p>
                You have reached your Starter Plan capacity. Ready to scale your operation?
              </p>
              <div className="space-y-2.5 p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl text-xs text-slate-700">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span><strong>3 Power Units included</strong> (+$25/mo per extra rig)</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span><strong>Unlimited Driver logins</strong> and live HOS telemetry</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span><strong>Live Operations Command Center</strong> &amp; dispatch radar</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span><strong>Client Portal</strong> for self-service shipper loads</span>
                </div>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 pt-4">
            <Button variant="outline" size="sm" onClick={() => setShowUpgradeModal(false)}>
              Keep Current Plan
            </Button>
            <Button 
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold gap-1.5"
              onClick={() => {
                setShowUpgradeModal(false);
                setNavTab('billing');
              }}
            >
              <Sparkles className="h-3.5 w-3.5 text-amber-300" />
              Go to Billing &amp; Plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function VehicleCard({ 
  vehicle, 
  trips,
  onEdit, 
  onDelete,
  onOpenDetails
}: { 
  vehicle: any, 
  trips?: any[],
  onEdit: (v: any) => void, 
  onDelete: (id: string) => void,
  onOpenDetails: (v: any) => void
}) {
  const isTruck = vehicle.type === 'truck';
  const activeTrip = trips?.find(t => 
    (t.status === 'active' || t.status === 'planned') && 
    (isTruck ? t.assignedTruckId === vehicle.id : t.assignedTrailerId === vehicle.id)
  );

  const monthlyFixedTotal = 
    ((vehicle.monthlyRecurringExpenses?.insurance || 0) + (vehicle.monthlyRecurringExpenses?.payment || 0)) +
    (vehicle.recurringExpenses || []).reduce((sum: number, e: any) => sum + (e.amount || 0), 0);

  return (
    <Card className="shadow-sm hover:shadow-md transition-all border-slate-200 overflow-hidden flex flex-col justify-between">
      <div>
        <div className={`h-1.5 w-full ${isTruck ? 'bg-blue-600' : 'bg-purple-600'}`} />
        <CardHeader className="pb-2 pt-3.5 px-4">
          <div className="flex justify-between items-start gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`p-2.5 rounded-xl shrink-0 ${isTruck ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-700'}`}>
                {isTruck ? <Truck className="h-5 w-5" /> : <Fuel className="h-5 w-5 rotate-90" />}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-extrabold text-base text-slate-900 tracking-tight">#{vehicle.unitNumber}</span>
                  <Badge variant="outline" className={`text-[10px] uppercase font-bold px-1.5 py-0 ${isTruck ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-purple-200 bg-purple-50 text-purple-700'}`}>
                    {isTruck ? 'Power Unit' : 'Trailer'}
                  </Badge>
                  {vehicle.isPaidOff ? (
                    <Badge variant="outline" className="text-[10px] font-semibold bg-emerald-50 text-emerald-700 border-emerald-200">Paid Off</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] font-semibold bg-slate-50 text-slate-600 border-slate-200">Financed</Badge>
                  )}
                </div>
                <CardDescription className="text-xs truncate text-slate-600 mt-0.5">{vehicle.name}</CardDescription>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <Button 
                variant="outline" 
                size="sm" 
                className="h-7 px-2 text-xs text-slate-600 hover:text-blue-600 flex items-center gap-1"
                onClick={() => onOpenDetails(vehicle)}
              >
                <Eye className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Details</span>
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-7 w-7 p-0 text-slate-500 hover:text-blue-600"
                onClick={() => onEdit(vehicle)}
                title="Edit Vehicle"
              >
                <Edit2 className="h-3.5 w-3.5" />
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-7 w-7 p-0 text-red-500 hover:text-red-700" 
                onClick={() => onDelete(vehicle.id)}
                title="Delete Vehicle"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pb-3 px-4 space-y-2.5 text-xs">
          {/* Active Trip Badge */}
          {activeTrip ? (
            <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 bg-purple-50 border border-purple-200 rounded-lg">
              <div className="flex items-center gap-1.5 min-w-0">
                <Route className="h-3.5 w-3.5 text-purple-700 shrink-0" />
                <span className="font-semibold text-purple-900 truncate">Assigned to: {activeTrip.name}</span>
              </div>
              <Badge className="bg-purple-600 hover:bg-purple-700 text-white text-[9px] uppercase px-1.5 py-0">Active Trip</Badge>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
              <span>Available for dispatch (No active trip)</span>
            </div>
          )}

          {/* Quick Specs Pill Box */}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {vehicle.gvwr ? (
              <Badge variant="secondary" className="font-medium text-[11px]">
                GVWR: {Number(vehicle.gvwr).toLocaleString()} lbs
              </Badge>
            ) : null}
            {!isTruck && vehicle.emptyWeight ? (
              <Badge variant="secondary" className="font-medium text-[11px]">
                Tare: {Number(vehicle.emptyWeight).toLocaleString()} lbs
              </Badge>
            ) : null}
            {!isTruck && vehicle.deckHeight ? (
              <Badge variant="secondary" className="font-medium text-[11px]">
                Deck: {vehicle.deckHeight}"
              </Badge>
            ) : null}
            {!isTruck && vehicle.trailerLength ? (
              <Badge variant="secondary" className="font-medium text-[11px]">
                Length: {vehicle.trailerLength} ft
              </Badge>
            ) : null}
            {isTruck && vehicle.operatingCostPerMile ? (
              <Badge variant="secondary" className="font-medium text-[11px]">
                Maint: ${Number(vehicle.operatingCostPerMile).toFixed(2)}/mi
              </Badge>
            ) : null}
            {!isTruck && vehicle.gvwr > 10_000 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black tracking-wide bg-amber-100 text-amber-800 border border-amber-300 uppercase">
                ⚠️ CDL Required
              </span>
            )}
          </div>
        </CardContent>
      </div>

      <div className="px-4 py-2.5 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between text-xs">
        <span className="text-slate-500 font-medium">Monthly Overhead:</span>
        <span className="font-bold text-slate-800">
          ${monthlyFixedTotal.toLocaleString()}/mo
        </span>
      </div>
    </Card>
  );
}
