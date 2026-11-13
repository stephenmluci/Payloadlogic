
'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { getFirestore, collection, addDoc, getDocs, doc, updateDoc, deleteDoc, setDoc, getDoc, query, orderBy, limit, where, writeBatch, Timestamp, serverTimestamp, onSnapshot, deleteField, arrayUnion } from 'firebase/firestore';
import type { User as FirebaseUser } from 'firebase/auth';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, getAuth, sendPasswordResetEmail } from 'firebase/auth';
import { initializeApp, deleteApp } from 'firebase/app';
import { db, auth } from '@/lib/firebase';
import { type User, type Load, type Expense, type Client, type Settings, type UserProfile, type ClientLoadRequest, type RecurringExpenseItem, type Address, type Trip, type Vehicle, type DriverProfile, type FinancialProfile, type ActualExpense, isDriverOffDuty } from '@/types';
import { getPlanEntitlements, canAddTruck, canAddDriver, canAccessFeature, type SubscriptionTier, type PlanEntitlements } from '@/lib/planLimits';
import { computeTrialState, validateDotFormat, TRIAL_MESSAGES, type TrialRecord, type TrialState } from '@/lib/trial';
import { startTrial, selectPlanOnServer } from '@/lib/trialClient';
import { isOwnerOrAdminUser, isOwnerEmail, PRIVATE_TESTING_RESTRICTION_MESSAGE, ALLOWED_OWNER_EMAIL } from '@/lib/authConfig';
import { isBillingInterval, type BillingInterval } from '@/lib/pricing';
import { useToast } from "@/hooks/use-toast";
import { format as formatDate, differenceInCalendarDays, parseISO } from 'date-fns';
import { sendNotificationEmail, type SendNotificationEmailInput } from '@/ai/flows/send-notification-email';
import { formatAddress } from '@/lib/utils';
import { geocodePhysicalAddress } from '@/lib/geocoding';
import { sendDriverPushNotification } from '@/lib/pushNotification';
import { sendDriverNotification } from '@/lib/notifications';
import { isErroneousArrivalTimestamp, isDriverBroadcastingGPS } from '@/lib/telemetrySync';
import { normalizeLoadDriverAssignment, isLoadAssignedToDriver, getDriverProfileId } from '@/lib/driverAssignment';
import { resolveCoordinates } from '@/lib/routeUtils';



// Helper functions and initial state
const emptyAddress: Address = {
  street: '',
  city: '',
  state: '',
  zip: '',
  companyName: '',
  contactName: '',
  contactPhone: '',
};

/**
 * Recursively sanitizes data before sending to Firestore,
 * ensuring any undefined fields default to empty strings '' or null so Firestore accepts them.
 */
function sanitizeForFirestore<T>(data: T): T {
  if (data === undefined) {
    return '' as any;
  }
  if (data === null || typeof data !== 'object') {
    return data;
  }
  if (data instanceof Date) {
    return data.toISOString() as any;
  }
  if (Array.isArray(data)) {
    return data.map(item => sanitizeForFirestore(item)) as any;
  }
  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) {
      sanitized[key] = '';
    } else if (value !== null && typeof value === 'object') {
      sanitized[key] = sanitizeForFirestore(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized as T;
}

const sanitizeAddress = (addr?: Partial<Address> | null): Address => ({
  street: addr?.street || '',
  city: addr?.city || '',
  state: addr?.state || '',
  zip: addr?.zip || '',
  companyName: addr?.companyName || '',
  contactName: addr?.contactName || '',
  contactPhone: addr?.contactPhone || '',
});

const initialSettings: Settings = {
  payrollPercentage: 0,
  targetDailyBusinessProfit: 0,
  defaultDriverPayType: 'percentage',
  defaultDriverHourlyRate: 0,
  defaultFuelCostPerGallon: 0,
  defCostPerGallon: 0,
  truckMpg: 6,
  truckAverageSpeed: 60,
  recurringExpenses: [],
  carrierName: '',
  carrierAddress: { street: '', city: '', state: '', zip: '' },
  carrierDotNumber: '',
  carrierMcNumber: '',
  carrierContactName: '',
  carrierContactPhone: '',
  carrierContactEmail: '',
  loadingFee: 0,
  detentionFeeRate: 0,
  defaultSpecialTerms: "Standard carrier terms apply. Full terms available upon request. Payment due upon delivery unless otherwise agreed in writing. Late payments may incur additional charges.",
  trailerType: '',
  trailerDimensions: '',
  trailerWeightCapacity: '',
  trailerHitchType: '',
  trailerDeckHeight: '',
  defaultOperatingCostPerMile: 0,
  cargoSafetyBuffer: 0.33,
  CARGO_SAFETY_BUFFER: 0.33,
  subscriptionTier: 'starter',
  extraTrucksCount: 0,
};

const SETTINGS_DOC_ID = 'userSettings';

/**
 * Strips all financial / billing fields from a Load before placing it in
 * React state for a driver user. This is a client-side defence-in-depth
 * measure — Firestore rules are the authoritative security boundary.
 */
function redactLoadForDriver(load: Load): Load {
  return {
    ...load,
    ratePerMile: 0,
    totalAgreedRate: 0,
    expenses: { payroll: 0, fuel: 0, def: 0, recurring: 0, calculated: false },
  };
}

// Load & Trip display ID helpers — imported from the shared utility module
import { formatLoadDisplayId, parseLoadSeq, formatTripNumber, parseTripSeq } from '@/lib/displayId';

const toDateTimeLocalInput = (isoString?: string): string => {
  if (!isoString) return new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) {
      if (isoString.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const withTime = `${isoString}T09:00:00Z`;
        const localDateFromDateOnly = new Date(new Date(withTime).getTime() - new Date().getTimezoneOffset() * 60000);
        return localDateFromDateOnly.toISOString().slice(0,16);
      }
      return new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    }
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return localDate.toISOString().slice(0, 16);
  } catch (e) {
    return new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }
};

const initialLoadFormData: Partial<Load> = {
  clientId: '', clientName: '', companyName: '', origin: emptyAddress, destination: emptyAddress,

  pickupDateTime: '',
  deliveryDateTime: '',
  ratePerMile: 0, distance: 0, deadheadMiles: 0, status: 'pending_approval', cargoDescription: '', cargoDimensions: '', cargoWeight: '',
  specialTerms: '', requiresTarping: false, tarpingFee: 0, estimatedDriveTimeHours: undefined,
  tripDuration: undefined,
  assignedTruckId: '',
  assignedTrailerId: '',
  assignedDriverId: '',
  cargoQuantity: 1,
  bolSource: 'broker',
};


const parseDimensionString = (dimStr: string | undefined): { length: number | null, width: number | null, height: number | null } => {
  if (!dimStr || typeof dimStr !== 'string') return { length: null, width: null, height: null };
  let length: number | null = null, width: number | null = null, height: number | null = null;
  const getValInFeet = (valueStr: string, unitStr: string | undefined): number => {
    const num = parseFloat(valueStr);
    if (unitStr?.toLowerCase() === 'in' || unitStr === '"') return num / 12;
    return num;
  };
  const lMatch = dimStr.match(/(\d+(?:\.\d+)?)\s*(ft|'|in|"|)\s*[lL]/i);
  const wMatch = dimStr.match(/(\d+(?:\.\d+)?)\s*(ft|'|in|"|)\s*[wW]/i);
  const hMatch = dimStr.match(/(\d+(?:\.\d+)?)\s*(ft|'|in|"|)\s*[hH]/i);
  if (lMatch) length = getValInFeet(lMatch[1], lMatch[2]);
  if (wMatch) width = getValInFeet(wMatch[1], wMatch[2]);
  if (hMatch) height = getValInFeet(hMatch[1], hMatch[2]);
  if (length === null || width === null || (dimStr.toLowerCase().includes('x') && height === null)) {
      const parts = dimStr.toLowerCase().split('x').map(part => part.trim());
      const attemptParseSimple = (valStr: string) => {
          if (/[lwh]/i.test(valStr) && (valStr.includes('ft') || valStr.includes("'") || valStr.includes('in') || valStr.includes('"'))) return null; 
          const numMatch = valStr.match(/^(\d+(?:\.\d+)?)\s*(ft|'|in|"|)?/i);
          if (numMatch) return getValInFeet(numMatch[1], numMatch[2]);
          return null;
      };
      if (parts.length >= 1 && length === null) length = attemptParseSimple(parts[0]) ?? length;
      if (parts.length >= 2 && width === null) width = attemptParseSimple(parts[1]) ?? width;
      if (parts.length >= 3 && height === null) height = attemptParseSimple(parts[2]) ?? height;
  }
   if (length === null && width === null && height === null && !dimStr.toLowerCase().includes('x') && !/[lwh]/i.test(dimStr.toLowerCase())) {
    const numericParts = dimStr.split(/\s+/).map(p => parseFloat(p)).filter(p => !isNaN(p));
    if (numericParts.length > 0 && length === null) length = numericParts[0];
    if (numericParts.length > 1 && width === null) width = numericParts[1];
    if (numericParts.length > 2 && height === null) height = numericParts[2];
  }
  return { length, width, height };
};

const parseSingleDimensionToFeet = (dimStr: string | undefined): number | null => {
  if (!dimStr || typeof dimStr !== 'string') return null;
  const match = dimStr.trim().match(/^(\d+(?:\.\d+)?)\s*(ft|'|in|"|)/i);
  if (match) {
    const num = parseFloat(match[1]);
    const unit = match[2]?.toLowerCase();
    if (unit === 'in' || unit === '"') return num / 12;
    return num;
  }
  const num = parseFloat(dimStr);
  return isNaN(num) ? null : num;
};

const MAX_TOTAL_HEIGHT_FEET = 13.5;

// Review Mode Consts
const IS_ADMIN_REVIEW_MODE = false;
const mockReviewUser: User = {
  uid: 'admin-reviewer-uid', email: 'reviewer@example.com', displayName: "Admin Reviewer", emailVerified: true,
  isAnonymous: false, photoURL: null, providerId: 'firebase', phoneNumber: null,
  metadata: { creationTime: new Date().toISOString(), lastSignInTime: new Date().toISOString() },
  providerData: [{ providerId: 'password', uid: 'admin-reviewer-uid', displayName: 'Admin Reviewer', email: 'reviewer@example.com', photoURL: null, phoneNumber: null }],
  refreshToken: 'mockToken', tenantId: null,
  delete: async () => {}, getIdToken: async (_forceRefresh?: boolean) => "mock-id-token",
  getIdTokenResult: async (_forceRefresh?: boolean) => ({
    token: "mock-id-token", expirationTime: new Date(Date.now() + 3600 * 1000).toISOString(), authTime: new Date().toISOString(),
    issuedAtTime: new Date().toISOString(), signInProvider: null, signInSecondFactor: null, claims: {},
  }),
  reload: async () => {}, toJSON: () => ({ uid: 'admin-reviewer-uid', email: 'reviewer@example.com', displayName: "Admin Reviewer" }),
  role: 'admin',
};

type AppDisplayState = 'loading' | 'auth' | 'subscription_choice' | 'onboarding' | 'admin_dashboard' | 'client_portal' | 'driver_dashboard';

// ── Review-mode seed data ─────────────────────────────────────────────────────
// Injected into state when IS_ADMIN_REVIEW_MODE is true so the real pages
// (LoadsPage, DriverFleetPage, ClientsPage) open with visible, editable data.
// All normal CRUD operations (add / edit / delete) continue to work as usual.
// (Load, Client, Vehicle, DriverProfile are already imported at the top of this file.)

interface AppContextType {
  // Auth & UI State
  user: User | null;
  /** True when the authenticated user has owner/admin privileges (full access, zero cost, DOT exempt) */
  isOwnerOrAdmin: boolean;
  activateOwnerRole: () => Promise<void>;
  /** UID of the admin/company that owns this driver's Firestore data. Only set when user.role === 'driver'. */
  driverOwnerId: string | null;
  appDisplayState: AppDisplayState;
  isTrialSession: boolean;
  /** Global 15-second heartbeat timer used to instantly synchronize live transit telemetry and map coordinates across all dashboard widgets */
  currentTime: number;
  activeTab: string;
  setActiveTab: React.Dispatch<React.SetStateAction<string>>;
  goBackInApp: () => void;
  viewClientRequestId: string | null;
  setViewClientRequestId: React.Dispatch<React.SetStateAction<string | null>>;
  /** Current step in the new-user onboarding wizard (1=Welcome, 2=Role confirm, 3=Plan). Only relevant when appDisplayState === 'onboarding'. */
  onboardingStep: 1 | 2 | 3;
  setOnboardingStep: React.Dispatch<React.SetStateAction<1 | 2 | 3>>;
  email: string;
  setEmail: React.Dispatch<React.SetStateAction<string>>;
  password: string;
  setPassword: React.Dispatch<React.SetStateAction<string>>;
  handleSignUp: (
    role?: 'admin' | 'client',
    fmcsaCredentials?: { usdotNumber?: string; mcNumber?: string }
  ) => Promise<{ code: string; message: string } | null>;
  handleSignIn: (email?: string, password?: string) => Promise<{ code: string; message: string } | null>;
  handleSignOut: () => Promise<void>;
  handleStartTrial: () => void;
  /** Leave the onboarding wizard and open the real (saved) dashboard; the 14-day trial is issued automatically. */
  continueToDashboard: () => void;
  isSubmitting: boolean;
  setIsSubmitting: React.Dispatch<React.SetStateAction<boolean>>;
  isLoading: boolean;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  initializationError: string | null;
  financialProfile: FinancialProfile | null;
  isFinancialProfileComplete: boolean;
  hasActiveTruck: boolean;
  hasActiveDriver: boolean;
  hasTargetDailyProfit: boolean;
  fleetSubTab: 'vehicles' | 'drivers';
  setFleetSubTab: React.Dispatch<React.SetStateAction<'vehicles' | 'drivers'>>;
  settingsSubTab: 'financials' | 'truck-trailer' | 'carrier' | 'contracts' | 'recurring' | 'assets';
  setSettingsSubTab: React.Dispatch<React.SetStateAction<'financials' | 'truck-trailer' | 'carrier' | 'contracts' | 'recurring' | 'assets'>>;
  saveTargetDailyProfit: (profitGoal: number) => Promise<void>;
  saveFinancialProfile: (profile: FinancialProfile) => Promise<void>;
  isFleetFinancialModalOpen: boolean;
  setIsFleetFinancialModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  /** True only when the user deliberately opened the setup modal (vs. the automatic login prompt). */
  isFleetSetupUserOpened: boolean;
  /** Deliberately open the Fleet Financial Setup modal (e.g. "Review setup" after completion). */
  openFleetFinancialSetup: () => void;
  // Plan Limits & Entitlements
  /** Tier used for ALL limit/feature checks: Fleet Pro while the free trial is active, otherwise the chosen plan. */
  subscriptionTier: SubscriptionTier;
  /** The plan the account actually chose/pays for (ignores trial evaluation access). */
  chosenTier: SubscriptionTier;
  planLimits: PlanEntitlements;
  /** 14-day DOT-tied free trial status (phase, days remaining, restriction). */
  trial: TrialState;
  /** Billing period of the plan the account chose (monthly when never set). Limits/features never depend on it. */
  billingInterval: BillingInterval;
  setSubscriptionTier: (tier: SubscriptionTier, interval?: BillingInterval) => Promise<void>;
  approveExtraTruck: () => Promise<void>;
  // In-App Help & Quick Guides
  isHelpOpen: boolean;
  setIsHelpOpen: React.Dispatch<React.SetStateAction<boolean>>;
  activeHelpTopic: string;
  openHelpTopic: (topicId: string) => void;
  /**
   * Creates a new driver Firebase Auth account + Firestore profile via backend Admin SDK
   * without displacing the currently signed-in admin session, and sends/generates an invite link.
   */
  createDriverAccount: (
    driverEmail: string,
    driverPassword?: string,
    driverProfile?: DriverProfile,
  ) => Promise<
    | {
        uid: string;
        authUid?: string;
        loginEmail?: string;
        tempPassword?: string;
        driverAccessToken?: string;
        driverPortalUrl?: string;
        loginUrl?: string;
        passwordResetLink?: string;
        emailSent?: boolean;
        smsShareUrl?: string | null;
        smsBody?: string;
        profile?: DriverProfile;
      }
    | { code: string; message: string }
  >;


  // Data State
  loads: Load[];
  expenses: Expense[];
  clients: Client[];
  isClientsLoading: boolean;
  settings: Settings;
  clientLoadRequests: ClientLoadRequest[];
  vehicles: Vehicle[];
  driverProfiles: DriverProfile[];

  // Vehicles
  addVehicle: (vehicle: Omit<Vehicle, 'id'>) => Promise<void>;
  updateVehicle: (id: string, updates: Partial<Vehicle>) => Promise<void>;
  deleteVehicle: (id: string) => Promise<void>;

  // Driver Profiles
  addDriverProfile: (profile: DriverProfile) => Promise<void>;
  updateDriverProfile: (uid: string, updates: Partial<DriverProfile>) => Promise<void>;
  deleteDriverProfile: (uid: string) => Promise<void>;


  // Settings
  settingsForm: Settings;
  setSettingsForm: React.Dispatch<React.SetStateAction<Settings>>;
  updateSettings: () => Promise<void>;

  // Clients
  clientForm: Omit<Client, 'id'>;
  setClientForm: React.Dispatch<React.SetStateAction<Omit<Client, 'id'>>>;
  addClient: () => Promise<void>;
  updateClient: (id: string, updates: Partial<Client>) => Promise<void>;
  deleteClient: (id: string) => Promise<void>;

  // Expenses
  expenseForm: Omit<Expense, 'id'>;
  setExpenseForm: React.Dispatch<React.SetStateAction<Omit<Expense, 'id'>>>;
  addExpense: () => Promise<void>;

  // Loads
  loadForm: Partial<Load>;
  setLoadForm: React.Dispatch<React.SetStateAction<Partial<Load>>>;
  editingLoadId: string | null;
  setEditingLoadId: React.Dispatch<React.SetStateAction<string | null>>;
  handleSaveLoad: () => Promise<void>;
  updateLoad: (id: string, updates: Partial<Load>) => Promise<void>;
  handleDeleteLoad: (loadId: string) => Promise<void>;
  handleStartEditLoad: (loadToEdit: Load) => void;
  handleCancelEditLoad: () => void;
  approveClientLoadRequest: (request: ClientLoadRequest) => Promise<void>;
  rejectClientLoadRequest: (requestId: string, reason?: string) => Promise<void>;
  generateAgreement: (loadData: Load) => Promise<void>;
  generateInvoice: (loadData: Load) => Promise<void>;
  trips: Trip[];
  addTrip: (trip: Omit<Trip, 'id'>) => Promise<Trip>;
  updateTrip: (id: string, updates: Partial<Trip>) => Promise<void>;
  handleDeleteTrip: (id: string) => Promise<void>;
  getFuelOptimizationProfit: () => number;
  calculateVehicleCPM: (vehicleId: string, monthStr?: string) => number;
  archiveVehicleCPM: (vehicleId: string, monthStr?: string) => Promise<void>;
  updateLoadPhaseWithLocation: (loadId: string, phase: Load['driverPhase'], lat?: number, lng?: number, note?: string) => Promise<void>;
  reportDriverException: (loadId: string, flag: Load['driverExceptionFlag'], note?: string) => Promise<void>;
  updateDriverNote: (loadId: string, note: string) => Promise<void>;
  // Role preview (admin can preview driver view)
  previewRole: 'driver' | null;
  setPreviewRole: React.Dispatch<React.SetStateAction<'driver' | null>>;
  // Proof of Delivery
  savePOD: (pod: import('@/types').ProofOfDelivery) => Promise<void>;
  // In-Transit Actual Expenses
  addActualExpense: (loadId: string | null, expenseData: Omit<ActualExpense, 'id'>) => Promise<ActualExpense>;
  fetchActualExpenses: (loadId: string) => Promise<ActualExpense[]>;
}




const ADMIN_ROLES = ['admin', 'owner', 'company_admin'] as const;

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const { toast } = useToast();
  // Auth & UI State
  const [user, setUser] = useState<User | null>(null);
  const [authUser, setAuthUser] = useState<FirebaseUser | null>(null);
  const [appDisplayState, setAppDisplayState] = useState<AppDisplayState>('loading');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [initializationError, setInitializationError] = useState<string | null>(null);
  const [isTrialSession, setIsTrialSession] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTabRaw] = useState('dashboard');
  const activeTabRef = React.useRef('dashboard');
  const historyIdxRef = React.useRef(0);

  // Push a real browser-history entry for every in-app tab change so the
  // hardware/software back button moves between screens instead of exiting.
  const setActiveTab = useCallback<React.Dispatch<React.SetStateAction<string>>>((next) => {
    const target = typeof next === 'function' ? (next as (p: string) => string)(activeTabRef.current) : next;
    if (target === activeTabRef.current) return;
    activeTabRef.current = target;
    setActiveTabRaw(target);
    if (typeof window !== 'undefined') {
      historyIdxRef.current += 1;
      window.history.pushState(
        { ...(window.history.state || {}), __plTab: target, __plIdx: historyIdxRef.current },
        '',
        window.location.href,
      );
    }
  }, []);

  const goBackInApp = useCallback(() => {
    if (typeof window !== 'undefined' && historyIdxRef.current > 0) {
      window.history.back();
    } else {
      activeTabRef.current = 'dashboard';
      setActiveTabRaw('dashboard');
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Tag the entry we landed on as the root so back from it leaves the app.
    const st = window.history.state || {};
    if (st.__plIdx === undefined) {
      window.history.replaceState({ ...st, __plTab: 'dashboard', __plIdx: 0 }, '', window.location.href);
    } else {
      historyIdxRef.current = st.__plIdx;
    }
    const onPop = (e: PopStateEvent) => {
      const s = e.state || {};
      const tab: string = typeof s.__plTab === 'string' ? s.__plTab : 'dashboard';
      historyIdxRef.current = typeof s.__plIdx === 'number' ? s.__plIdx : 0;
      activeTabRef.current = tab;
      setActiveTabRaw(tab);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const [viewClientRequestId, setViewClientRequestId] = useState<string | null>(null);
  /** UID of the admin who owns this driver account's Firestore data. Only populated when user.role === 'driver'. */
  const [driverOwnerId, setDriverOwnerId] = useState<string | null>(null);
  /** Step of the new-user onboarding wizard. Only meaningful when appDisplayState === 'onboarding'. */
  const [onboardingStep, setOnboardingStep] = useState<1 | 2 | 3>(1);

  // Financial Profile State & Security Checklist Gate
  const [financialProfile, setFinancialProfile] = useState<FinancialProfile | null>(null);
  const [isFleetFinancialModalOpen, setIsFleetFinancialModalOpen] = useState(false);
  const [isFleetSetupUserOpened, setIsFleetSetupUserOpened] = useState(false);
  const openFleetFinancialSetup = React.useCallback(() => {
    setIsFleetSetupUserOpened(true);
    setIsFleetFinancialModalOpen(true);
  }, []);
  useEffect(() => {
    if (!isFleetFinancialModalOpen) setIsFleetSetupUserOpened(false);
  }, [isFleetFinancialModalOpen]);
  const [fleetSubTab, setFleetSubTab] = useState<'vehicles' | 'drivers'>('vehicles');
  const [settingsSubTab, setSettingsSubTab] = useState<'financials' | 'truck-trailer' | 'carrier' | 'contracts' | 'recurring' | 'assets'>('financials');

  // In-App Help & Guides State
  const [isHelpOpen, setIsHelpOpen] = useState<boolean>(false);
  const [activeHelpTopic, setActiveHelpTopic] = useState<string>('setup');
  const openHelpTopic = React.useCallback((topicId: string) => {
    setActiveHelpTopic(topicId);
    setIsHelpOpen(true);
  }, []);

  // Data State
  const [loads, setLoads] = useState<Load[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);

  const [clients, setClients] = useState<Client[]>([]);
  const [isClientsLoading, setIsClientsLoading] = useState<boolean>(true);
  const [settings, setSettings] = useState<Settings>(initialSettings);

  const [trips, setTrips] = useState<Trip[]>([]);
  const [clientLoadRequests, setClientLoadRequests] = useState<ClientLoadRequest[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [driverProfiles, setDriverProfiles] = useState<DriverProfile[]>([]);
  const [previewRole, setPreviewRole] = useState<'driver' | null>(null);

  // ── Plan Limits & Subscription Entitlements ───────────────────────────────
  const [trialRecord, setTrialRecord] = useState<TrialRecord | null>(null);
  const [trialLoaded, setTrialLoaded] = useState(false);
  const trialActivationAttempted = React.useRef<string | null>(null);

  // Re-evaluated every minute (and on record change) so expiry flips without a reload.
  const [trialClock, setTrialClock] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setTrialClock(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const isOwnerOrAdmin = React.useMemo(() => {
    if (!user) return false;
    return isOwnerOrAdminUser(user);
  }, [user]);

  const trial: TrialState = React.useMemo(() => {
    if (isOwnerOrAdmin) {
      return {
        phase: 'converted',
        daysRemaining: 9999,
        endsAt: null,
        startedAt: null,
        dot: user?.usdotNumber || 'EXEMPT-OWNER',
        dotVerification: 'verified',
        verificationStatus: 'valid_verified',
        verificationTimestamp: new Date().toISOString(),
        carrierLegalName: user?.carrierLegalName || 'Owner Fleet Operations',
        carrierDbaName: null,
        carrierOperatingStatus: 'AUTHORIZED',
        carrierCity: null,
        carrierState: null,
        trialDeniedForDot: false,
        selectedTier: 'fleetPro',
        selectedInterval: 'annual',
        isRestricted: false,
        hasEvaluationAccess: true,
      };
    }
    const isRealAdminAccount =
      !!user && ['admin', 'owner', 'company_admin'].includes(user.role ?? '') &&
      !isTrialSession && !(IS_ADMIN_REVIEW_MODE && user.uid === mockReviewUser.uid);
    // Until the record has loaded (or for sandbox/driver/client sessions) never restrict.
    if (!isRealAdminAccount || !trialLoaded) return computeTrialState(null, null);
    return computeTrialState(trialRecord, authUser?.metadata?.creationTime, new Date(trialClock));
  }, [user, isOwnerOrAdmin, isTrialSession, trialLoaded, trialRecord, authUser, trialClock]);

  const chosenTier: SubscriptionTier = (settings?.subscriptionTier as SubscriptionTier) || 'starter';
  // Active trial → evaluate at Fleet Pro. After it ends, the plan the user committed to wins.
  const subscriptionTier: SubscriptionTier = isOwnerOrAdmin
    ? 'fleetPro'
    : (trial.hasEvaluationAccess ? 'fleetPro'
       : trial.phase === 'converted' && trial.selectedTier ? trial.selectedTier
       : chosenTier);
  const planLimits: PlanEntitlements = React.useMemo(() => {
    return getPlanEntitlements(subscriptionTier, settings?.extraTrucksCount || 0, isOwnerOrAdmin);
  }, [subscriptionTier, settings?.extraTrucksCount, isOwnerOrAdmin]);

  const billingInterval: BillingInterval =
    (isBillingInterval(trial.selectedInterval) ? trial.selectedInterval : null) ??
    (isBillingInterval(settings?.billingInterval) ? settings.billingInterval : null) ??
    'monthly';

  const setSubscriptionTier = async (newTier: SubscriptionTier, newInterval?: BillingInterval) => {
    const interval: BillingInterval = newInterval ?? billingInterval;
    // Accounts under the trial system must record their plan on the server, where the trial record lives.
    if (trialRecord && !isTrialSession && user && authUser) {
      try {
        const token = await authUser.getIdToken();
        const res = await selectPlanOnServer(token, newTier, interval);
        if (!res.ok) {
          toast({ variant: 'destructive', title: 'Plan Not Saved', description: res.error || 'Could not save your plan. Please try again.' });
          return;
        }
      } catch {
        toast({ variant: 'destructive', title: 'Plan Not Saved', description: 'Could not save your plan. Please try again.' });
        return;
      }
    }
    setIsSubmitting(true);
    const updated: Settings = { ...settings, subscriptionTier: newTier, billingInterval: interval };
    setSettings(updated);
    setSettingsForm(updated);

    if (isTrialSession || (IS_ADMIN_REVIEW_MODE && user?.uid === mockReviewUser.uid)) {
      toast({
        title: `Plan Switched to ${newTier === 'fleetPro' ? 'Fleet Pro' : 'Starter'}`,
        description: newTier === 'fleetPro' 
          ? 'Fleet Pro active: Up to 3 trucks included, unlimited drivers, and live dispatch center unlocked.' 
          : 'Starter plan active: 1 power unit, 1 driver login.',
      });
    } else if (user) {
      try {
        const settingsRef = doc(db, `users/${user.uid}/settings`, SETTINGS_DOC_ID);
        await setDoc(settingsRef, { subscriptionTier: newTier, billingInterval: interval }, { merge: true });
        const userRef = doc(db, `users/${user.uid}`);
        await setDoc(userRef, { subscriptionTier: newTier, billingInterval: interval }, { merge: true });
        toast({
          title: `Plan Switched to ${newTier === 'fleetPro' ? 'Fleet Pro' : 'Starter'}`,
          description: newTier === 'fleetPro' 
            ? 'Fleet Pro active: Up to 3 trucks included, unlimited drivers, and live dispatch center unlocked.' 
            : 'Starter plan active: 1 power unit, 1 driver login.',
        });
      } catch (err: any) {
        console.error("Error setting subscription tier:", err);
        toast({ variant: "destructive", title: "Update Failed", description: err.message || "Could not update plan." });
      }
    }
    setIsSubmitting(false);
  };

  const approveExtraTruck = async () => {
    const currentExtra = settings?.extraTrucksCount || 0;
    const newExtra = currentExtra + 1;
    const updated: Settings = { ...settings, extraTrucksCount: newExtra };
    setSettings(updated);
    setSettingsForm(updated);
    if (!isTrialSession && user && !(IS_ADMIN_REVIEW_MODE && user.uid === mockReviewUser.uid)) {
      try {
        const settingsRef = doc(db, `users/${user.uid}/settings`, SETTINGS_DOC_ID);
        await setDoc(settingsRef, { extraTrucksCount: newExtra }, { merge: true });
      } catch (e) {
        console.error("Error updating extra trucks approval:", e);
      }
    }
  };

  // ── Security Checklist Gate Verification ──────────────────────────────────
  // 1. Created at least one active Truck profile (containing its specific monthly payment and insurance data).
  const hasActiveTruck = vehicles.some(v => 
    v.type === 'truck' && 
    ((v.monthlyRecurringExpenses?.insurance || 0) > 0 || (v.monthlyRecurringExpenses?.payment || 0) > 0 || v.isPaidOff)
  );

  // 2. Created at least one active Driver profile (containing their specific pay rate).
  const hasActiveDriver = driverProfiles.some(d => 
    (d.payRate !== undefined && Number(d.payRate) > 0) ||
    (d.payPercentageOfGross !== undefined && Number(d.payPercentageOfGross) > 0) ||
    (d.payrollPercentage !== undefined && Number(d.payrollPercentage) > 0)
  );

  // 3. Input their 'Target Daily Profit Goal'.
  const hasTargetDailyProfit = Boolean(
    settings?.targetDailyBusinessProfit !== undefined && 
    Number(settings.targetDailyBusinessProfit) > 0
  );

  const isFinancialProfileComplete = Boolean(
    hasActiveTruck && hasActiveDriver && hasTargetDailyProfit
  );

  // Rehydrate draft from persistence layer if present
  const [loadForm, setLoadForm] = useState<Partial<Load>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('agy_load_draft');
        if (raw) {
          const draft = JSON.parse(raw);
          if (draft && typeof draft === 'object') {
            return { ...initialLoadFormData, ...draft };
          }
        }
      } catch {}
    }
    return initialLoadFormData;
  });

  const [editingLoadId, setEditingLoadId] = useState<string | null>(null);

  const [expenseForm, setExpenseForm] = useState<Omit<Expense, 'id'>>({ 
    date: new Date().toISOString().split('T')[0], 
    category: '', 
    amount: 0, 
    loadId: '',
    notes: '' 
  });

  const [clientForm, setClientForm] = useState<Omit<Client, 'id'>>({ companyName: '', contactName: '', contactEmail: '', contactPhone: '', address: emptyAddress });


  const [settingsForm, setSettingsForm] = useState<Settings>(initialSettings);
  const [currentTime, setCurrentTime] = useState<number>(() => Date.now());


  useEffect(() => { window.scrollTo(0, 0); }, [activeTab]);

  // ── Telemetry Cleanup: Wipe erroneous arrival timestamps and stop detention clock
  // If driver's live telemetry indicates 'Deadheading' or GPS distance to origin is > 1 mile,
  // forcefully mutate the load document: arrivalTimestamp = null, detentionActive = false, status = 'Deadheading'
  const cleanupErroneousArrivalTimestamps = useCallback(async () => {
    loads.forEach(async (load) => {
      if (!load.id) return;
      // Never wipe or regress if dispatcher manually overrode or if load is in-transit or beyond
      if (load.manualOverrideAt) return;
      const driver = driverProfiles.find(d => d.uid === load.assignedDriverId);
      if (isErroneousArrivalTimestamp(load, driver, loads)) {
        console.info(`[Telemetry Sync] Forcefully cleaning up erroneous arrival on load #${load.loadNumber || load.id}: Setting arrivalTimestamp=null, detentionActive=false, status='Deadheading'`);
        const updates: Partial<Load> = {
          arrivedAt: null,
          arrivalTimestamp: null,
          detentionActive: false,
          status: 'Deadheading',
          driverPhase: 'Enroute to Pickup',
        };
        // Update local React state immediately
        setLoads(prev => prev.map(l => l.id === load.id ? { ...l, ...updates } : l));
        // Persist to Firestore if authenticated
        if (user && !isTrialSession && !(IS_ADMIN_REVIEW_MODE && user.uid === mockReviewUser.uid)) {
          try {
            const loadRef = doc(db, `users/${user.uid}/loads`, load.id);
            await updateDoc(loadRef, {
              arrivedAt: deleteField(),
              arrivalTimestamp: deleteField(),
              detentionActive: false,
              status: 'dispatched',
              driverPhase: 'Enroute to Pickup',
            });
          } catch (err) {
            console.warn('Failed to clear erroneous arrival timestamp in Firestore:', err);
          }
        }
      }
    });
  }, [loads, driverProfiles, user, isTrialSession]);

  useEffect(() => {
    // Reactive Effect: instantly wipe erroneous arrival timestamps whenever driverProfiles or loads change
    cleanupErroneousArrivalTimestamps();
  }, [cleanupErroneousArrivalTimestamps]);

  useEffect(() => {
    // Global telemetry pulse: triggers a synchronized re-render of all live tracker metrics every 15s
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
      cleanupErroneousArrivalTimestamps();
    }, 15000);
    return () => clearInterval(timer);
  }, [cleanupErroneousArrivalTimestamps]);





  const fetchDocWithTimeout = async (ref: any, ms = 4000) => {
    return Promise.race([
      getDoc(ref).catch(() => null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
    ]);
  };

  const fetchUserProfileAndData = useCallback(async (currentUser: FirebaseUser | User) => {
    setIsLoading(true);
    setInitializationError(null);
    let targetDisplayState: AppDisplayState = 'auth';

    try {
      if (IS_ADMIN_REVIEW_MODE && currentUser.uid === mockReviewUser.uid) {
        if (user?.uid === mockReviewUser.uid) {
          targetDisplayState = 'admin_dashboard';
          return;
        }
        setUser(mockReviewUser);
        targetDisplayState = 'admin_dashboard';
        return;
      }

      // Force-refresh the ID token so Firestore has a valid auth token before any reads.
      // Without this, onAuthStateChanged can fire before Firestore receives the token,
      // causing spurious "Missing or insufficient permissions" errors.
      try {
        if ('getIdToken' in currentUser && typeof (currentUser as FirebaseUser).getIdToken === 'function') {
          await (currentUser as FirebaseUser).getIdToken(false);
        }
      } catch (tokenErr) {
        console.warn('Non-fatal ID token refresh warning:', tokenErr);
      }

      if (isTrialSession) {
        const trialUserProfileRef = doc(db, `users/${currentUser.uid}/profile/main`);
        const trialUserRootRef = doc(db, `users/${currentUser.uid}`);
        const [trialProfileSnap, trialRootSnap] = await Promise.all([
          fetchDocWithTimeout(trialUserProfileRef),
          fetchDocWithTimeout(trialUserRootRef),
        ]);
        let currentTrialRole: 'admin' | 'client' | 'driver' | 'owner' | 'company_admin' = 'admin';
        const tProf = trialProfileSnap?.exists() ? (trialProfileSnap.data() as UserProfile) : null;
        const tRoot = trialRootSnap?.exists() ? (trialRootSnap.data() as any) : null;
        if (tProf?.role) {
          currentTrialRole = tProf.role;
        }
        const loadedTrialFinProfile = tProf?.financial_profile || tRoot?.financial_profile || null;
        if (loadedTrialFinProfile && loadedTrialFinProfile.isCompleted) {
          setFinancialProfile(loadedTrialFinProfile);
        } else {
          setFinancialProfile(null);
          if (['admin', 'owner', 'company_admin'].includes(currentTrialRole)) {
            setIsFleetFinancialModalOpen(true);
          }
        }
        setUser({
          ...(currentUser as FirebaseUser),
          role: currentTrialRole,
          usdotNumber: tProf?.usdotNumber || tRoot?.usdotNumber,
          mcNumber: tProf?.mcNumber || tRoot?.mcNumber,
          fmcsaCredential: tProf?.fmcsaCredential || tRoot?.fmcsaCredential,
          financial_profile: loadedTrialFinProfile || undefined,
        });
        if (currentTrialRole === 'client') {
          targetDisplayState = 'client_portal';
        } else if (currentTrialRole === 'driver') {
          targetDisplayState = 'driver_dashboard';
        } else {
          targetDisplayState = 'admin_dashboard';
        }
        return;
      }

      let fetchedRole: 'admin' | 'client' | 'driver' | 'owner' | 'company_admin' = 'admin';
      let userProfile: UserProfile | null = null;
      let rootUserData: any = null;
      let isNewAdminSignup = false;
    
      const profileRef = doc(db, `users/${currentUser.uid}/profile/main`);
      const rootUserRef = doc(db, `users/${currentUser.uid}`);
      const [profileSnap, rootSnap] = await Promise.all([
        fetchDocWithTimeout(profileRef),
        fetchDocWithTimeout(rootUserRef),
      ]);
  
      if (profileSnap && profileSnap.exists()) {
        userProfile = profileSnap.data() as UserProfile;
        fetchedRole = userProfile.role;
      }
      if (rootSnap && rootSnap.exists()) {
        rootUserData = rootSnap.data();
        if (!userProfile && rootUserData.role) {
          fetchedRole = rootUserData.role;
        }
      }

      const resolvedDriverOwnerId = userProfile?.driverOwnerId || rootUserData?.driverOwnerId || null;
      const resolvedDriverProfileId = userProfile?.driverProfileId || rootUserData?.driverProfileId || currentUser.uid;
      const isProvisionedDriverAccount = fetchedRole === 'driver' && Boolean(resolvedDriverOwnerId);

      // Private Testing Mode: Allow ONLY the owner OR a provisioned driver account
      if (!isOwnerEmail(currentUser.email) && !isProvisionedDriverAccount) {
        console.warn('[PrivateTesting] Revoking non-owner/non-driver access in fetchUserProfileAndData:', currentUser.email);
        await signOut(auth).catch(() => {});
        setUser(null);
        setAuthUser(null);
        setIsLoading(false);
        setInitializationError(PRIVATE_TESTING_RESTRICTION_MESSAGE);
        setAppDisplayState('auth');
        toast({
          variant: 'destructive',
          title: 'Access Restricted',
          description: PRIVATE_TESTING_RESTRICTION_MESSAGE,
        });
        return;
      }

      // Check if authenticated user qualifies for owner/admin bypass
      const isOwnerTarget = !isProvisionedDriverAccount && isOwnerOrAdminUser({
        email: currentUser.email,
        role: fetchedRole,
        isOwner: userProfile?.isOwner || rootUserData?.isOwner,
        isAdmin: userProfile?.isAdmin || rootUserData?.isAdmin,
      });

      if (isOwnerTarget) {
        fetchedRole = 'owner';
        isNewAdminSignup = false; // Never divert owner to onboarding
      }

      if (!profileSnap?.exists() && !rootSnap?.exists()) {
        // No profile found — new user.
        // Write a default profile and flag for onboarding if not an owner.
        const defaultRole = isOwnerTarget ? 'owner' : 'admin';
        await setDoc(profileRef, { 
          role: defaultRole,
          ...(isOwnerTarget ? { isOwner: true, isAdmin: true, isBypassActive: true, subscriptionTier: 'fleetPro', dotVerificationStatus: 'valid_verified' } : {})
        });
        fetchedRole = defaultRole;
        if (!isOwnerTarget) {
          isNewAdminSignup = true;
        }
      }

      // Check financial_profile
      const loadedFinProfile: FinancialProfile | null =
        userProfile?.financial_profile ||
        rootUserData?.financial_profile ||
        null;

      if (loadedFinProfile && loadedFinProfile.isCompleted) {
        setFinancialProfile(loadedFinProfile);
      } else {
        setFinancialProfile(null);
        if (!isOwnerTarget && ['admin', 'owner', 'company_admin'].includes(fetchedRole)) {
          setIsFleetFinancialModalOpen(true);
        }
      }
      
      const augmentedUser: User = {
        ...(currentUser as FirebaseUser),
        role: fetchedRole,
        isOwner: isOwnerTarget || userProfile?.isOwner || rootUserData?.isOwner || false,
        isAdmin: isOwnerTarget || userProfile?.isAdmin || rootUserData?.isAdmin || false,
        isBypassActive: isOwnerTarget,
        driverProfileId: resolvedDriverProfileId,
        driverOwnerId: resolvedDriverOwnerId || undefined,
        usdotNumber: userProfile?.usdotNumber || rootUserData?.usdotNumber || (isOwnerTarget ? 'EXEMPT-OWNER' : undefined),
        mcNumber: userProfile?.mcNumber || rootUserData?.mcNumber,
        fmcsaCredential: userProfile?.fmcsaCredential || rootUserData?.fmcsaCredential || (isOwnerTarget ? 'USDOT EXEMPT (Owner)' : undefined),
        dotVerificationStatus: isOwnerTarget ? 'valid_verified' : (userProfile?.dotVerificationStatus || rootUserData?.dotVerificationStatus),
        dotVerificationTimestamp: userProfile?.dotVerificationTimestamp || rootUserData?.dotVerificationTimestamp || (isOwnerTarget ? new Date().toISOString() : undefined),
        carrierLegalName: userProfile?.carrierLegalName || rootUserData?.carrierLegalName || (isOwnerTarget ? 'Owner Fleet Operations' : undefined),
        carrierDbaName: userProfile?.carrierDbaName || rootUserData?.carrierDbaName,
        carrierOperatingStatus: userProfile?.carrierOperatingStatus || rootUserData?.carrierOperatingStatus || (isOwnerTarget ? 'AUTHORIZED' : undefined),
        carrierCity: userProfile?.carrierCity || rootUserData?.carrierCity,
        carrierState: userProfile?.carrierState || rootUserData?.carrierState,
        financial_profile: userProfile?.financial_profile || rootUserData?.financial_profile,
        subscriptionTier: isOwnerTarget ? 'fleetPro' : (userProfile?.subscriptionTier || rootUserData?.subscriptionTier),
      };
      setUser(augmentedUser);

      // Persist owner bypass stamp to Firestore if needed
      if (isOwnerTarget && (!userProfile?.isOwner || userProfile?.role !== 'owner' || userProfile?.subscriptionTier !== 'fleetPro')) {
        const ownerDocUpdates = {
          role: 'owner',
          isOwner: true,
          isAdmin: true,
          isBypassActive: true,
          subscriptionTier: 'fleetPro',
          dotVerificationStatus: 'valid_verified',
        };
        Promise.all([
          setDoc(profileRef, ownerDocUpdates, { merge: true }),
          setDoc(rootUserRef, ownerDocUpdates, { merge: true }),
          setDoc(doc(db, `users/${currentUser.uid}/settings`, SETTINGS_DOC_ID), { subscriptionTier: 'fleetPro' }, { merge: true }),
        ]).catch((e) => console.warn('Non-fatal: could not persist owner stamp:', e));
      }

      // Drivers: store driverOwnerId separately for listener scoping, skip settings fetch
      if (augmentedUser.role === 'driver') {
        const ownerId = resolvedDriverOwnerId;
        setDriverOwnerId(ownerId);
        if (!ownerId) {
          toast({ variant: 'destructive', title: 'Account Setup Incomplete', description: 'Your driver account is not linked to a company. Please contact your dispatcher.' });
          targetDisplayState = 'auth';
          return;
        }
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem('payloadlogic_pwa_role', 'driver');
            const driverPortalToken = (userProfile as any)?.driverAccessToken || rootUserData?.driverAccessToken;
            if (driverPortalToken) {
              localStorage.setItem('payloadlogic_driver_portal_token', String(driverPortalToken));
            }
          } catch {
            // Non-fatal
          }
        }
        targetDisplayState = 'driver_dashboard';
        return;
      }

      if (typeof window !== 'undefined' && ['admin', 'owner', 'company_admin'].includes(augmentedUser.role ?? '')) {
        try {
          localStorage.setItem('payloadlogic_pwa_role', 'owner');
          localStorage.removeItem('payloadlogic_driver_portal_token');
        } catch {
          // Non-fatal
        }
      }

      if (augmentedUser.role === 'client') {
        targetDisplayState = 'client_portal';
        return;
      }

      // New admin/company_admin → show onboarding wizard (plan selection + welcome)
      if (isNewAdminSignup) {
        setOnboardingStep(1);
        targetDisplayState = 'onboarding';
        return;
      }
    
      try {
        // Fetch Settings once initially
        const settingsRef = doc(db, `users/${currentUser.uid}/settings`, SETTINGS_DOC_ID);
        const settingsSnap = await fetchDocWithTimeout(settingsRef);
        if (settingsSnap && settingsSnap.exists()) {
          const settingsData = settingsSnap.data() as Settings;
          const completeSettings = { ...initialSettings, ...settingsData };
          setSettings(completeSettings);
          setSettingsForm(completeSettings);
        } else {
          // First login — write default settings, but don't block navigation if it fails
          try {
            await setDoc(settingsRef, initialSettings);
          } catch {
            // Non-fatal — defaults are already set in state
          }
          setSettings(initialSettings);
          setSettingsForm(initialSettings);
        }
      } catch (settingsError: any) {
        console.error('Error fetching settings:', settingsError);
        // Non-fatal — use defaults and let the user into the app
        setSettings(initialSettings);
        setSettingsForm(initialSettings);
      }

      // Navigate to the correct dashboard regardless of whether settings loaded
      if (isOwnerTarget) {
        targetDisplayState = 'admin_dashboard';
      } else if (userProfile?.role === 'client') {
        targetDisplayState = 'client_portal';
      } else if (userProfile?.role === 'driver') {
        targetDisplayState = 'driver_dashboard';
      } else {
        targetDisplayState = 'admin_dashboard';
      }
    } catch (error: any) {
      console.error("Error during app initialization / user profile fetch:", error);
      const errorMessage = error?.message || "Could not fetch user profile.";
      setInitializationError(errorMessage);
      toast({
        variant: "destructive",
        title: "Initialization Error",
        description: errorMessage,
      });
      targetDisplayState = 'auth';
    } finally {
      // Explicitly guarantee the loading states are set to false, ensuring spinners stop
      setAppDisplayState(targetDisplayState);
      setIsLoading(false);
    }
  }, [toast, isTrialSession, user?.uid]);


  // Real-time Listeners Effect
  useEffect(() => {
    const adminRoles = ['admin', 'owner', 'company_admin'];
    if (!user || !adminRoles.includes(user.role ?? '') || isTrialSession) {
      if (isTrialSession || (IS_ADMIN_REVIEW_MODE && user?.uid === mockReviewUser.uid)) {
        setIsClientsLoading(false);
      }
      return;
    }

    const unsubscribes: (() => void)[] = [];

    // Collections to listen to
    const collections = [
      { name: 'loads', setter: setLoads },
      { name: 'expenses', setter: setExpenses },
      { name: 'clients', setter: (data: Client[]) => {
          setClients(data);
          setIsClientsLoading(false);
        }
      },
      { name: 'vehicles', setter: setVehicles },
      { name: 'trips', setter: setTrips },
      { name: 'driverProfiles', setter: (data: any[]) => setDriverProfiles(data.map(d => {
        const stableId = (d.id || d.uid || '').trim();
        return {
          ...d,
          id: stableId,
          uid: stableId,
        };
      })) },
      { name: 'clientLoadRequests', setter: setClientLoadRequests, global: true },
    ];

    collections.forEach(coll => {
      let q: any = coll.global 
        ? collection(db, coll.name)
        : collection(db, `users/${user.uid}/${coll.name}`);
        
      if (['loads', 'expenses', 'clientLoadRequests'].includes(coll.name)) {
        q = query(q, limit(200));
      }
        
      const unsub = onSnapshot(q, (snapshot: any) => {
        const data = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() } as any));
        coll.setter(data);
      }, (error: any) => {
        console.error(`Error in snapshot for ${coll.name}:`, error);
        if (coll.name === 'clients') {
          setIsClientsLoading(false);
        }
      });
      unsubscribes.push(unsub);
    });

    return () => unsubscribes.forEach(unsub => unsub());
  }, [user?.uid, isTrialSession]);

  // ── Driver Real-time Listener ──────────────────────────────────────────────
  // Fires when user.role === 'driver' and driverOwnerId is resolved.
  // Scopes all data queries to only what the driver is allowed to see:
  //   - loads assigned to this driver (financial fields redacted)
  //   - their own driverProfile document
  //   - vehicles list (for equipment names only)
  useEffect(() => {
    if (!user || user.role !== 'driver' || !driverOwnerId) return;

    const unsubscribes: (() => void)[] = [];

    const driverQueryIds = Array.from(new Set([user.uid, user.driverProfileId].filter(Boolean))) as string[];
    const driverNameLower = (user.displayName || '').trim().toLowerCase();

    // 1. Assigned loads — strictly filtered to this driver only AND redacted client-side
    const loadsColl = collection(db, `users/${driverOwnerId}/loads`);
    unsubscribes.push(
      onSnapshot(
        loadsColl,
        snap => {
          const matchedAndRedacted = snap.docs
            .map(d => ({ id: d.id, ...d.data() } as Load))
            .filter(l => {
              const assignedId = String(l.assignedDriverId || l.driverId || '').trim();
              if (assignedId && driverQueryIds.includes(assignedId)) return true;
              const assignedName = String(l.assignedDriverName || l.driverName || '').trim().toLowerCase();
              if (!assignedId && driverNameLower && assignedName === driverNameLower) return true;
              return false;
            })
            .map(l => redactLoadForDriver(l));
          setLoads(matchedAndRedacted);
        },
        err => console.error('Driver loads listener error:', err)
      )
    );

    // 2. Own driver profile
    const profileId = user.driverProfileId || user.uid;
    const profileDocRef = doc(db, `users/${driverOwnerId}/driverProfiles`, profileId);
    unsubscribes.push(
      onSnapshot(profileDocRef, snap => {
        if (snap.exists()) {
          setDriverProfiles([{ uid: snap.id, id: snap.id, ...snap.data() } as DriverProfile]);
        }
      }, err => console.error('Driver profile listener error:', err)),
    );

    // 3. Vehicles — for equipment display (unit number, name) only
    const vehiclesQ = collection(db, `users/${driverOwnerId}/vehicles`);
    unsubscribes.push(
      onSnapshot(vehiclesQ, snap => {
        setVehicles(snap.docs.map(d => ({ id: d.id, ...d.data() } as Vehicle)));
      }, err => console.error('Driver vehicles listener error:', err)),
    );

    return () => unsubscribes.forEach(u => u());
  }, [user?.uid, user?.driverProfileId, user?.displayName, user?.role, driverOwnerId]);

  // ── Free-trial record listener (server-written `trials/{uid}`) ───────────────
  useEffect(() => {
    const adminRoles = ['admin', 'owner', 'company_admin'];
    if (!user || !adminRoles.includes(user.role ?? '') || isTrialSession || (IS_ADMIN_REVIEW_MODE && user.uid === mockReviewUser.uid)) {
      setTrialRecord(null);
      setTrialLoaded(false);
      return;
    }
    const unsub = onSnapshot(
      doc(db, `trials/${user.uid}`),
      (snap) => {
        setTrialRecord(snap.exists() ? (snap.data() as TrialRecord) : null);
        setTrialLoaded(true);
      },
      (error) => {
        // Fail open on read errors (e.g. rules not deployed yet) so a platform fault never locks paying users out.
        console.warn('Trial record unavailable:', error?.message);
        setTrialRecord(null);
        setTrialLoaded(false);
      },
    );
    return () => unsub();
  }, [user?.uid, user?.role, isTrialSession]);

  // Issue the trial for brand-new accounts whose record doesn't exist yet (idempotent, retried until it succeeds).
  useEffect(() => {
    if (!authUser || !user || !trialLoaded || trialRecord || trial.phase !== 'pending') return;
    if (trialActivationAttempted.current === user.uid) return;
    const dot = user.usdotNumber;
    if (!dot) return;
    trialActivationAttempted.current = user.uid;

    (async () => {
      const token = await authUser.getIdToken();
      const res = await startTrial(token, dot, user.mcNumber);
      if (res.ok && res.outcome === 'dot_already_used') {
        toast({ title: TRIAL_MESSAGES.dotAlreadyUsed, description: TRIAL_MESSAGES.dotAlreadyUsedNextStep, duration: 9000 });
      } else if (!res.ok) {
        setTimeout(() => {
          trialActivationAttempted.current = null;
          setTrialClock(Date.now());
        }, 60_000);
      }
    })().catch(() => { trialActivationAttempted.current = null; });
  }, [authUser, user, trialLoaded, trialRecord, trial.phase, trialClock, toast]);

  useEffect(() => {
    let isMounted = true;
    const unsubscribe = onAuthStateChanged(
      auth,
      async (firebaseUser) => {
        if (!isMounted) return;
        if (firebaseUser) {
          // Owner or Provisioned Driver validation happens in fetchUserProfileAndData
          setAuthUser(firebaseUser);
        } else {
          setAuthUser(null);
          setIsLoading(false);
          setAppDisplayState('auth');
        }
      },
      (error) => {
        if (!isMounted) return;
        console.error('Firebase Auth onAuthStateChanged error:', error);
        const errorMsg = error?.message || 'Authentication service error.';
        setInitializationError(errorMsg);
        toast({
          variant: 'destructive',
          title: 'Authentication Error',
          description: errorMsg,
        });
        setIsLoading(false);
        setAppDisplayState('auth');
      }
    );
    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [toast]);

  // Safety fallback timeout: guarantees loading state never freezes indefinitely if network stalls
  useEffect(() => {
    if (appDisplayState !== 'loading' && !isLoading) return;
    const timer = setTimeout(() => {
      if (appDisplayState === 'loading' || isLoading) {
        console.warn('Initialization timeout: App loading state timed out after 25s. Transitioning to auth.');
        const timeoutMsg = 'Connection timed out while loading. Redirecting to sign in.';
        setInitializationError(timeoutMsg);
        setIsLoading(false);
        setAppDisplayState('auth');
      }
    }, 25000);
    return () => clearTimeout(timer);
  }, [appDisplayState, isLoading]);

  useEffect(() => {
    const handleLogoutState = () => {
      setUser(null);
      setIsTrialSession(false);
      setFinancialProfile(null);
      setIsFleetFinancialModalOpen(false);
      setLoads([]); setExpenses([]); setClients([]); setClientLoadRequests([]);
      setSettings(initialSettings); setSettingsForm(initialSettings);
      setAppDisplayState('auth');
      setIsLoading(false);
    };

    if (IS_ADMIN_REVIEW_MODE && !isTrialSession) {
      if (appDisplayState === 'loading' || user?.uid !== mockReviewUser.uid) {
        fetchUserProfileAndData(mockReviewUser);
      }
      return; 
    }
    
    if (authUser) {
      if (!user || user.uid !== authUser.uid || (isTrialSession && !user.isAnonymous)) {
          fetchUserProfileAndData(authUser);
      }
    } else {
      if (user) {
        handleLogoutState();
      } else if (appDisplayState !== 'auth') {
        setAppDisplayState('auth');
        setIsLoading(false);
      }
    }
  }, [authUser, isTrialSession, fetchUserProfileAndData, user, appDisplayState]);

  const handleSignUp = async (
    role: 'admin' | 'client' = 'admin',
    fmcsaCredentials?: { usdotNumber?: string; mcNumber?: string }
  ): Promise<{ code: string; message: string } | null> => {
    // Private Testing Mode: Strictly restrict sign up to allowed owner email
    const targetEmail = (email || '').trim().toLowerCase();
    if (!isOwnerEmail(targetEmail)) {
      toast({
        variant: 'destructive',
        title: 'Registration Restricted',
        description: PRIVATE_TESTING_RESTRICTION_MESSAGE,
      });
      return {
        code: 'auth/private-testing-restricted',
        message: PRIVATE_TESTING_RESTRICTION_MESSAGE,
      };
    }

    if (IS_ADMIN_REVIEW_MODE) {
      toast({ title: "Admin Review Mode", description: "Sign up is disabled in review mode." });
      return null;
    }

    let usdot = fmcsaCredentials?.usdotNumber?.trim() || '';
    const mc = fmcsaCredentials?.mcNumber?.trim() || '';

    // The FMCSA gate: carriers need a valid USDOT number (it anchors the free trial);
    // Owner accounts and client (shipper) registrations have specific rules.
    const isOwnerSignup = isOwnerEmail(email) || role === ('owner' as any);
    if (isOwnerSignup) {
      usdot = usdot || 'EXEMPT-OWNER';
    } else if (role === 'admin') {
      const format = validateDotFormat(usdot);
      if (!format.ok) {
        return { code: 'trial/invalid-dot', message: format.error };
      }
      usdot = format.dot;
    } else if (!usdot && !mc) {
      return {
        code: 'auth/fmcsa-required',
        message: 'A valid USDOT Number or MC Number is required to create an account.',
      };
    }

    setIsSubmitting(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const uid = userCredential.user.uid;
      const rootUserRef = doc(db, `users/${uid}`);
      const profileRef = doc(db, `users/${uid}/profile/main`);

      const payload: any = {
        role: isOwnerSignup ? 'owner' : role,
        ...(isOwnerSignup ? {
          isOwner: true,
          isAdmin: true,
          isBypassActive: true,
          subscriptionTier: 'fleetPro',
          dotVerificationStatus: 'valid_verified',
          dotVerificationTimestamp: new Date().toISOString(),
          carrierLegalName: 'Owner Fleet Operations',
        } : {}),
        usdotNumber: usdot,
        mcNumber: mc,
        fmcsaCredential: usdot ? `USDOT ${usdot}` : (mc ? `MC ${mc}` : 'USDOT EXEMPT (Owner)'),
        createdAt: new Date().toISOString(),
      };

      await Promise.all([
        setDoc(rootUserRef, payload, { merge: true }),
        setDoc(profileRef, payload, { merge: true }),
      ]);

      // Pre-set carrier numbers in settings
      try {
        const settingsRef = doc(db, `users/${uid}/settings`, SETTINGS_DOC_ID);
        await setDoc(settingsRef, {
          carrierDotNumber: usdot,
          carrierMcNumber: mc,
          ...(isOwnerSignup ? { subscriptionTier: 'fleetPro' } : {}),
        }, { merge: true });
      } catch (e) {
        console.warn('Non-fatal: could not set carrier numbers in settings:', e);
      }

      if (isOwnerSignup) {
        toast({ title: "Owner Account Created", description: "Welcome! Full Fleet Pro access unlocked with USDOT exemption." });
        return null;
      }

      // Start the 14-day trial on the server (one trial per DOT). If this call fails the app
      // retries automatically after sign-in, so signup itself is never blocked by it.
      if (role === 'admin' && !isOwnerSignup) {
        try {
          const token = await userCredential.user.getIdToken();
          const trialResult = await startTrial(token, usdot, mc || undefined);
          if (trialResult.ok && trialResult.trial) {
            const vSnapshot = {
              dotVerificationStatus: trialResult.trial.verificationStatus || (trialResult.trial.dotVerification === 'verified' ? 'valid_verified' : 'valid_unverified'),
              dotVerificationTimestamp: trialResult.trial.verificationTimestamp || new Date().toISOString(),
              carrierLegalName: trialResult.trial.carrierLegalName,
              carrierDbaName: trialResult.trial.carrierDbaName,
              carrierOperatingStatus: trialResult.trial.carrierOperatingStatus,
              carrierCity: trialResult.trial.carrierCity,
              carrierState: trialResult.trial.carrierState,
            };
            const settingsUpdate: any = { ...vSnapshot };
            if (trialResult.trial.carrierLegalName) {
              settingsUpdate.carrierName = trialResult.trial.carrierLegalName;
            }
            const settingsRef = doc(db, `users/${uid}/settings`, SETTINGS_DOC_ID);
            await Promise.all([
              setDoc(rootUserRef, vSnapshot, { merge: true }),
              setDoc(profileRef, vSnapshot, { merge: true }),
              setDoc(settingsRef, settingsUpdate, { merge: true }),
            ]).catch((e) => console.warn('Non-fatal: could not save carrier verification snapshot:', e));
          }

          if (trialResult.ok && trialResult.outcome === 'dot_already_used') {
            toast({ title: TRIAL_MESSAGES.dotAlreadyUsed, description: TRIAL_MESSAGES.dotAlreadyUsedNextStep, duration: 9000 });
            return null;
          }
          if (trialResult.ok && trialResult.outcome === 'started') {
            const verifiedMsg = trialResult.trial?.carrierLegalName
              ? `Verified ${trialResult.trial.carrierLegalName}. Full Fleet Pro access unlocked!`
              : 'Full Fleet Pro access — no credit card needed.';
            toast({ title: 'Your 14-day free trial has started', description: verifiedMsg });
            return null;
          }
        } catch (e) {
          console.warn('Non-fatal: trial activation deferred:', e);
        }
      }

      toast({ title: "Account Created", description: "Welcome to PayloadLogic!" });
      return null;
    } catch (error: any) {
      console.error('Sign up error:', error);
      return { code: error?.code ?? 'unknown', message: error?.message ?? 'An unexpected error occurred.' };
    } finally {
      setIsSubmitting(false);
    }
  };

  const saveTargetDailyProfit = async (profitGoal: number) => {
    setIsSubmitting(true);
    try {
      const updatedSettings: Partial<Settings> = { targetDailyBusinessProfit: profitGoal };
      setSettings(prev => ({ ...prev, ...updatedSettings }));
      setSettingsForm(prev => ({ ...prev, ...updatedSettings }));
      if (user && !isTrialSession && !(IS_ADMIN_REVIEW_MODE && user.uid === mockReviewUser.uid)) {
        const settingsRef = doc(db, `users/${user.uid}/settings`, SETTINGS_DOC_ID);
        await setDoc(settingsRef, updatedSettings, { merge: true });
      }
      toast({ title: "Target Daily Profit Saved", description: `Updated profit target to $${profitGoal}/day.` });
    } catch (err) {
      console.error("Error saving target daily profit:", err);
      toast({ title: "Save Failed", description: "Could not save profit goal.", variant: "destructive" });
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  const saveFinancialProfile = async (profile: FinancialProfile) => {
    setIsSubmitting(true);
    try {
      const safeProfile: FinancialProfile = {
        ...profile,
        isCompleted: true,
        updatedAt: new Date().toISOString(),
      };
      setFinancialProfile(safeProfile);

      if (profile.targetDailyBusinessProfit && profile.targetDailyBusinessProfit > 0) {
        await saveTargetDailyProfit(profile.targetDailyBusinessProfit);
      }

      if (user && !isTrialSession && !(IS_ADMIN_REVIEW_MODE && user.uid === mockReviewUser.uid)) {
        const rootUserRef = doc(db, `users/${user.uid}`);
        const profileRef = doc(db, `users/${user.uid}/profile/main`);

        await Promise.all([
          setDoc(rootUserRef, { financial_profile: safeProfile }, { merge: true }),
          setDoc(profileRef, { financial_profile: safeProfile }, { merge: true }),
        ]);
      }
    } catch (err) {
      console.error("Error saving financial profile:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignIn = async (emailParam?: string, passwordParam?: string): Promise<{ code: string; message: string } | null> => {
    const targetEmail = (emailParam || email || '').trim();
    const targetPassword = passwordParam || password;

    if (IS_ADMIN_REVIEW_MODE && !isTrialSession && targetEmail === mockReviewUser.email) {
      if (user?.uid !== mockReviewUser.uid) fetchUserProfileAndData(mockReviewUser);
      toast({ title: "Admin Review Mode", description: "Review session refreshed." });
      return null;
    }
    setIsSubmitting(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, targetEmail, targetPassword);
      // Verify immediately that the user is either the owner or a provisioned driver account
      if (!isOwnerEmail(cred.user.email)) {
        const [pSnap, rSnap] = await Promise.all([
          fetchDocWithTimeout(doc(db, `users/${cred.user.uid}/profile/main`)),
          fetchDocWithTimeout(doc(db, `users/${cred.user.uid}`)),
        ]);
        const pData: any = pSnap?.exists() ? pSnap.data() : null;
        const rData: any = rSnap?.exists() ? rSnap.data() : null;
        const role = pData?.role || rData?.role;
        const ownerId = pData?.driverOwnerId || rData?.driverOwnerId;
        if (role !== 'driver' || !ownerId) {
          await signOut(auth).catch(() => {});
          toast({
            variant: 'destructive',
            title: 'Access Restricted',
            description: PRIVATE_TESTING_RESTRICTION_MESSAGE,
          });
          return {
            code: 'auth/private-testing-restricted',
            message: PRIVATE_TESTING_RESTRICTION_MESSAGE,
          };
        }
      }
      toast({ title: "Signed In", description: "Welcome back!" });
      return null;
    } catch (error: any) {
      console.error('Sign in error:', error);
      return { code: error?.code ?? 'unknown', message: error?.message ?? 'An unexpected error occurred.' };
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const continueToDashboard = () => {
    if (!authUser) { setAppDisplayState('auth'); return; }
    setIsLoading(true);
    fetchUserProfileAndData(authUser);
  };

  const handleStartTrial = () => {
    if (!authUser || !isOwnerEmail(authUser.email)) { 
        setAppDisplayState('auth');
        toast({variant: "destructive", title: "Access Restricted", description: PRIVATE_TESTING_RESTRICTION_MESSAGE});
        return;
    }
    setIsTrialSession(true); 
    toast({ title: "Free Trial Started", description: "Enjoy your free trial! Data will not be saved." });
  };


  const handleSignOut = async () => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('payloadlogic_pwa_role');
        localStorage.removeItem('payloadlogic_driver_portal_token');
      } catch {
        // Non-fatal
      }
    }
    if (IS_ADMIN_REVIEW_MODE && !isTrialSession) {
      setUser(null); 
      setAuthUser(null);
      setAppDisplayState('auth'); 
      toast({ title: "Admin Review Mode", description: "Exited review session." });
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
      return;
    }
    setIsSubmitting(true);
    try {
      await signOut(auth);
      toast({ title: "Signed Out", description: "You have been successfully signed out." });
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    } catch (error: any) {
      console.error('Sign out error:', error);
      toast({ variant: "destructive", title: "Sign Out Error", description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartEditLoad = (loadToEdit: Load) => {
    if (!user || !ADMIN_ROLES.includes(user.role as any)) return;
     const loadWithLocalTimes = {
      ...loadToEdit,
      pickupDateTime: toDateTimeLocalInput(loadToEdit.pickupDateTime),
      deliveryDateTime: toDateTimeLocalInput(loadToEdit.deliveryDateTime),
    };
    setLoadForm(loadWithLocalTimes);
    setEditingLoadId(loadToEdit.id!);
    setActiveTab('loads');
  };

  const handleCancelEditLoad = () => {
    setLoadForm(initialLoadFormData);
    if (typeof window !== 'undefined') {
      try { localStorage.removeItem('agy_load_draft'); } catch {}
    }
    setEditingLoadId(null);
  };

  const handleSaveLoad = async () => {
    if (!user || !ADMIN_ROLES.includes(user.role as any)) return;

    // ── Driver Assignment Normalization & Validation ──
    let assignedDriverId = loadForm.assignedDriverId && loadForm.assignedDriverId !== 'none' ? loadForm.assignedDriverId.trim() : undefined;
    let assignedDriverName = loadForm.assignedDriverName && loadForm.assignedDriverName !== 'none' ? loadForm.assignedDriverName.trim() : undefined;

    if (assignedDriverId) {
      const driver = driverProfiles.find(d => getDriverProfileId(d) === assignedDriverId || (assignedDriverId && d.name?.toLowerCase() === assignedDriverId.toLowerCase()));
      if (driver) {
        assignedDriverId = getDriverProfileId(driver);
        assignedDriverName = driver.name;
        if (isDriverOffDuty(driver)) {
          toast({
            title: "Assignment Blocked",
            description: `${driver.name} is currently Off Duty. Cannot assign freight to an off-duty driver.`,
            variant: "destructive",
          });
          return;
        }
      }
    } else if (loadForm.assignedTruckId && loadForm.assignedTruckId !== 'none') {
      const driverWithTruck = driverProfiles.find(d => d.assignedTruckId === loadForm.assignedTruckId);
      if (driverWithTruck) {
        assignedDriverId = getDriverProfileId(driverWithTruck);
        assignedDriverName = driverWithTruck.name;
      } else {
        const truck = vehicles.find(v => v.id === loadForm.assignedTruckId);
        if (truck?.assignedDriverId) {
          const matched = driverProfiles.find(d => getDriverProfileId(d) === truck.assignedDriverId);
          if (matched) {
            assignedDriverId = getDriverProfileId(matched);
            assignedDriverName = matched.name;
          }
        }
      }
    }

    setIsSubmitting(true);

    const calculatedTotalRate = (loadForm.distance || 0) * (loadForm.ratePerMile || 0) + (loadForm.tarpingFee || 0);
    const totalTripMilesForTime = (loadForm.distance || 0) + (loadForm.deadheadMiles || 0);
    const calculatedDriveTime = totalTripMilesForTime > 0
        ? totalTripMilesForTime / 55
        : undefined;

    const finalPickupDateTime = loadForm.pickupDateTime
      ? (isNaN(new Date(loadForm.pickupDateTime).getTime()) ? undefined : new Date(loadForm.pickupDateTime).toISOString())
      : undefined;
    const finalDeliveryDateTime = loadForm.deliveryDateTime
      ? (isNaN(new Date(loadForm.deliveryDateTime).getTime()) ? undefined : new Date(loadForm.deliveryDateTime).toISOString())
      : undefined;

    // Ensure exact physical coordinates exist for both Origin and Destination
    let originCoords: { lat: number; lng: number } | null = (typeof loadForm.origin?.lat === 'number' && typeof loadForm.origin?.lng === 'number')
      ? { lat: loadForm.origin.lat, lng: loadForm.origin.lng }
      : null;
    let destCoords: { lat: number; lng: number } | null = (typeof loadForm.destination?.lat === 'number' && typeof loadForm.destination?.lng === 'number')
      ? { lat: loadForm.destination.lat, lng: loadForm.destination.lng }
      : null;

    if (!originCoords && loadForm.origin?.city) {
      originCoords = await geocodePhysicalAddress(loadForm.origin);
    }
    if (!destCoords && loadForm.destination?.city) {
      destCoords = await geocodePhysicalAddress(loadForm.destination);
    }

    const sanitizedOrigin = sanitizeAddress(loadForm.origin);
    const sanitizedDestination = sanitizeAddress(loadForm.destination);

    if (originCoords) {
      sanitizedOrigin.lat = originCoords.lat;
      sanitizedOrigin.lng = originCoords.lng;
    }
    if (destCoords) {
      sanitizedDestination.lat = destCoords.lat;
      sanitizedDestination.lng = destCoords.lng;
    }

    const dataWithCalculations: Partial<Load> = {
        ...loadForm,
        assignedDriverId: assignedDriverId || undefined,
        assignedDriverName: assignedDriverName || undefined,
        origin: sanitizedOrigin,
        destination: sanitizedDestination,
        originLat: originCoords?.lat ?? (loadForm as any).originLat,
        originLng: originCoords?.lng ?? (loadForm as any).originLng,
        destinationLat: destCoords?.lat ?? (loadForm as any).destinationLat,
        destinationLng: destCoords?.lng ?? (loadForm as any).destinationLng,
        pickupDateTime: finalPickupDateTime,
        deliveryDateTime: finalDeliveryDateTime,
        totalAgreedRate: calculatedTotalRate,
        estimatedDriveTimeHours: calculatedDriveTime,
        tripId: (loadForm.tripId === 'none' || loadForm.tripId === 'auto-create') ? undefined : (loadForm.tripId || undefined)
    };

    if ((loadForm.status === 'arrived' || (loadForm as any).status === 'Arrived' || loadForm.driverPhase === 'Arrived') && !dataWithCalculations.arrivedAt) {
      dataWithCalculations.arrivedAt = new Date().toISOString();
    }

    if (loadForm.status === 'delivered' || loadForm.driverPhase === 'Complete') {
      if (!dataWithCalculations.deliveredAt) {
        dataWithCalculations.deliveredAt = new Date().toISOString();
      }
      const hasBol = Boolean(loadForm.signedBolUrl || dataWithCalculations.signedBolUrl);
      dataWithCalculations.paperworkStatus = hasBol ? 'pod_uploaded' : 'pending_pod';
    }


    if (dataWithCalculations.cargoDimensions) {
      const parsedTrailerDims = parseDimensionString(settings.trailerDimensions);
      const parsedCargoDims = parseDimensionString(dataWithCalculations.cargoDimensions);
      const trailerDeckHeightFeet = parseSingleDimensionToFeet(settings.trailerDeckHeight);

      let validationFailed = false;
      const messages: string[] = [];

      if (parsedCargoDims.height !== null && trailerDeckHeightFeet !== null) {
        const totalHeight = parsedCargoDims.height + trailerDeckHeightFeet;
        if (totalHeight > MAX_TOTAL_HEIGHT_FEET) {
          messages.push(`Total height (Deck ${trailerDeckHeightFeet.toFixed(2)}ft + Cargo ${parsedCargoDims.height.toFixed(2)}ft = ${totalHeight.toFixed(2)}ft) exceeds max legal height of ${MAX_TOTAL_HEIGHT_FEET}ft (13'6").`);
          validationFailed = true;
        }
      } else if (parsedCargoDims.height !== null && trailerDeckHeightFeet === null) {
        messages.push(`Trailer Deck Height is not defined in settings; could not validate total height.`);
      }

      if (parsedTrailerDims.length !== null && parsedCargoDims.length !== null && parsedCargoDims.length > parsedTrailerDims.length) {
        messages.push(`Length (${parsedCargoDims.length.toFixed(2)}ft) exceeds trailer length (${parsedTrailerDims.length.toFixed(2)}ft).`);
        validationFailed = true;
      } else if (parsedTrailerDims.length === null && parsedCargoDims.length !== null) {
        messages.push(`Trailer length not defined in settings for full validation.`);
      }

      if (parsedTrailerDims.width !== null && parsedCargoDims.width !== null && parsedCargoDims.width > parsedTrailerDims.width) {
        messages.push(`Width (${parsedCargoDims.width.toFixed(2)}ft) exceeds trailer width (${parsedTrailerDims.width.toFixed(2)}ft).`);
        validationFailed = true;
      } else if (parsedTrailerDims.width === null && parsedCargoDims.width !== null) {
         messages.push(`Trailer width not defined in settings for full validation.`);
      }

      if (validationFailed) {
        toast({
          variant: "destructive",
          title: "Cargo Dimension Error",
          description: "Cargo dimensions are invalid: " + messages.join(" "),
        });
        setIsSubmitting(false);
        return;
      }
    }

    if (isTrialSession || (IS_ADMIN_REVIEW_MODE && user.uid === mockReviewUser.uid)) {
        if (editingLoadId) {
            const updatedLoad = { ...loads.find(l=>l.id===editingLoadId)!, ...dataWithCalculations, id: editingLoadId } as Load;
            setLoads(prevLoads => prevLoads.map(l => l.id === editingLoadId ? updatedLoad : l));
            toast({ title: "Trial/Review: Load Updated", description: `Load ${loadForm.loadNumber || editingLoadId} updated locally.` });
        } else {
            const newLoadNumber = formatLoadDisplayId(new Date(), loads.length + 1);
            const newLoadData = { ...initialLoadFormData, ...dataWithCalculations, loadNumber: newLoadNumber, id: `mock-load-${Date.now()}` } as Load;
            setLoads(prev => [...prev, newLoadData]);
            if (newLoadData.originalClientRequestId) {
              setClientLoadRequests(prev => prev.map(r => r.id === newLoadData.originalClientRequestId ? {...r, status: 'accepted', createdLoadId: newLoadData.id} : r));
            }
            {
              const savedTripId = loadForm.tripId;
              const addedTrip = (savedTripId && savedTripId !== 'none' && savedTripId !== 'auto-create')
                ? trips.find(t => t.id === savedTripId)
                : undefined;
              const where = savedTripId === 'auto-create'
                ? 'as stop 1 of a new multi-stop trip'
                : addedTrip ? `and added to trip "${addedTrip.name}"` : 'as an independent load';
              toast({ title: "Trial/Review: Load Added", description: `Load ${newLoadNumber} added locally ${where}.` });
            }
        }
    } else { 
        if (editingLoadId) {
            try {
              const loadRef = doc(db, `users/${user.uid}/loads`, editingLoadId);
              const sanitizedPayload = sanitizeForFirestore(dataWithCalculations);
              await updateDoc(loadRef, sanitizedPayload);
              // onSnapshot will update local state — no manual setLoads needed
              toast({ title: "Load Updated", description: `Load ${loadForm.loadNumber || editingLoadId} has been successfully updated.` });
            } catch (error: any) {
              console.error('Error updating load:', error);
              toast({ variant: "destructive", title: "Error Updating Load", description: error.message });
              setIsSubmitting(false);
              return;
            }
        } else {
            let nextLoadNumeric = 1;
            const loadsCollectionRef = collection(db, `users/${user.uid}/loads`);
            const q = query(loadsCollectionRef, orderBy('loadNumber', 'desc'), limit(1));
            try {
                const querySnapshot = await getDocs(q);
                if (!querySnapshot.empty) {
                    const lastLoad = querySnapshot.docs[0].data() as Load;
                    // parseLoadSeq handles both "L-0042" (legacy) and "LD-2609-0042" (new)
                    const lastSeq = parseLoadSeq(lastLoad.loadNumber || '');
                    nextLoadNumeric = lastSeq != null ? lastSeq + 1 : (await getDocs(loadsCollectionRef)).size + 1;
                } else {
                     nextLoadNumeric = (await getDocs(loadsCollectionRef)).size + 1;
                }
            } catch (e) {
                console.error("Error fetching last load number, falling back to collection size:", e);
                nextLoadNumeric = (await getDocs(loadsCollectionRef)).size + 1;
            }
            const newLoadNumber = formatLoadDisplayId(new Date(), nextLoadNumeric);
            const newLoadDataForFirestore = { 
              ...dataWithCalculations, 
              status: dataWithCalculations.status || 'pending_approval',
              loadNumber: newLoadNumber, 
              expenses: { payroll: 0, fuel: 0, def: 0, recurring: 0, maintenance: 0, calculated: false } 
            } as Omit<Load, 'id'>;

            const safeLoadData = sanitizeForFirestore(newLoadDataForFirestore);
            try {
              const docRef = await addDoc(collection(db, `users/${user.uid}/loads`), safeLoadData);
              // onSnapshot will update local state — no manual setLoads needed
              const finalSavedLoadData = { ...safeLoadData, id: docRef.id } as Load;
              {
                const savedTripId = loadForm.tripId;
                const addedTrip = (savedTripId && savedTripId !== 'none' && savedTripId !== 'auto-create')
                  ? trips.find(t => t.id === savedTripId)
                  : undefined;
                if (savedTripId === 'auto-create') {
                  toast({ title: "Load created", description: `Load ${newLoadNumber} was created and a new multi-stop trip is being started with it as stop 1.` });
                } else if (addedTrip) {
                  toast({ title: "Load added to trip", description: `Load ${newLoadNumber} was created and added as another stop on "${addedTrip.name}".` });
                } else {
                  toast({ title: "Independent load created", description: `Load ${newLoadNumber} was created as an independent load (not part of a trip).` });
                }
              }

              if (finalSavedLoadData.originalClientRequestId) {
                // Finalize the client load request status
                if (!isTrialSession && !(IS_ADMIN_REVIEW_MODE && user.uid === mockReviewUser.uid)) {
                  try {
                    const requestRef = doc(db, 'clientLoadRequests', finalSavedLoadData.originalClientRequestId);
                    await updateDoc(requestRef, { status: 'accepted', createdLoadId: docRef.id });
                    setClientLoadRequests(prev => prev.map(r => r.id === finalSavedLoadData.originalClientRequestId ? {...r, status: 'accepted', createdLoadId: docRef.id} : r));
                  } catch (err) {
                    console.error("Failed to finalize client load request status:", err);
                  }
                } else {
                  setClientLoadRequests(prev => prev.map(r => r.id === finalSavedLoadData.originalClientRequestId ? {...r, status: 'accepted', createdLoadId: docRef.id} : r));
                }

                const client = clients.find(c => c.id === finalSavedLoadData.clientId);
                if (client && client.contactEmail) {
                    const emailSubject = `Load Approved: ${finalSavedLoadData.loadNumber || finalSavedLoadData.id}`;
                    const emailBody = `Dear ${client.contactName || client.companyName},<br><br>Your load request for ${formatAddress(finalSavedLoadData.origin, 'short')} to ${formatAddress(finalSavedLoadData.destination, 'short')} has been approved. Your Load ID is ${finalSavedLoadData.loadNumber || finalSavedLoadData.id}.<br><br>Thank you,<br>PayloadLogic`;
                    await sendNotificationEmail({ recipientEmail: client.contactEmail, subject: emailSubject, body: emailBody });
                    toast({ title: "Client Notification", description: `Approval notification sent to client for new load ${finalSavedLoadData.loadNumber}.` });
                }
              }

              // Trigger in-app notification & FCM push notification if driver assigned on create AND load is already dispatched
              if (
                finalSavedLoadData.assignedDriverId &&
                finalSavedLoadData.assignedDriverId !== 'none' &&
                (finalSavedLoadData.status === 'dispatched' || finalSavedLoadData.status === 'in-transit')
              ) {
                const assignedDriver = driverProfiles.find(d => d.uid === finalSavedLoadData.assignedDriverId);
                const originLoc = finalSavedLoadData.origin?.city && finalSavedLoadData.origin?.state 
                  ? `${finalSavedLoadData.origin.city}, ${finalSavedLoadData.origin.state}`
                  : (finalSavedLoadData.origin?.city || 'Origin');
                const destLoc = finalSavedLoadData.destination?.city && finalSavedLoadData.destination?.state 
                  ? `${finalSavedLoadData.destination.city}, ${finalSavedLoadData.destination.state}`
                  : (finalSavedLoadData.destination?.city || 'Destination');

                // 1. In-app Firestore notification (100% free onSnapshot system)
                sendDriverNotification({
                  driverId: finalSavedLoadData.assignedDriverId,
                  title: 'New Load Assigned',
                  message: `New Load Assigned from ${originLoc} to ${destLoc}`,
                  loadId: finalSavedLoadData.id,
                }).catch(err => console.warn('Failed to send in-app driver notification on create:', err));

                // 2. FCM push notification fallback
                if (assignedDriver) {
                  sendDriverPushNotification({
                    driver: assignedDriver,
                    originCity: finalSavedLoadData.origin?.city,
                    originState: finalSavedLoadData.origin?.state,
                  }).catch(err => console.warn('Failed to send push notification on load creation:', err));
                }
              }
            } catch (error: any) {
              console.error('Error adding load:', error);
              toast({ variant: "destructive", title: "Error Adding Load", description: error.message });
              setIsSubmitting(false);
              return;
            }
        }
    }
    handleCancelEditLoad();
    localStorage.removeItem('agy_load_draft');
    setIsSubmitting(false);
  };


  const updateLoad = useCallback(async (id: string, updates: Partial<Load>) => {
    if (!user) return;
    const isAllowed = ADMIN_ROLES.includes(user.role as any) || user.role === 'driver';
    if (!isAllowed) return;

    const currentLoad = loads.find(l => l.id === id);
    const effectiveUpdates: Partial<Load> = { ...updates };

    if (updates.assignedDriverId !== undefined) {
      if (updates.assignedDriverId && updates.assignedDriverId !== 'none' && updates.assignedDriverId !== '') {
        const assignedDriver = driverProfiles.find(d => getDriverProfileId(d) === updates.assignedDriverId || d.name?.toLowerCase() === updates.assignedDriverId?.toLowerCase());
        if (assignedDriver) {
          if (isDriverOffDuty(assignedDriver)) {
            toast({
              title: "Assignment Blocked",
              description: `${assignedDriver.name} is currently Off Duty. Cannot route freight to an off-duty driver.`,
              variant: "destructive",
            });
            return;
          }
          effectiveUpdates.assignedDriverId = getDriverProfileId(assignedDriver);
          effectiveUpdates.assignedDriverName = assignedDriver.name;
        }
      } else {
        effectiveUpdates.assignedDriverId = undefined;
        effectiveUpdates.assignedDriverName = undefined;
      }
    } else if (updates.assignedTruckId && !currentLoad?.assignedDriverId) {
      const driverWithTruck = driverProfiles.find(d => d.assignedTruckId === updates.assignedTruckId);
      if (driverWithTruck) {
        effectiveUpdates.assignedDriverId = getDriverProfileId(driverWithTruck);
        effectiveUpdates.assignedDriverName = driverWithTruck.name;
      }
    }

    // Strict Rule: Dispatcher Override Wins.
    // If status is updated manually, record manualOverrideAt so that mathematical telemetry never regresses it.
    if (updates.status && (!currentLoad || updates.status !== currentLoad.status)) {
      effectiveUpdates.manualOverrideAt = new Date().toISOString();
    }
    if (updates.origin && (typeof updates.origin.lat !== 'number' || typeof updates.origin.lng !== 'number')) {
      const coords = await geocodePhysicalAddress(updates.origin);
      if (coords) {
        effectiveUpdates.origin = { ...updates.origin, lat: coords.lat, lng: coords.lng };
        effectiveUpdates.originLat = coords.lat;
        effectiveUpdates.originLng = coords.lng;
      }
    }
    if (updates.destination && (typeof updates.destination.lat !== 'number' || typeof updates.destination.lng !== 'number')) {
      const coords = await geocodePhysicalAddress(updates.destination);
      if (coords) {
        effectiveUpdates.destination = { ...updates.destination, lat: coords.lat, lng: coords.lng };
        effectiveUpdates.destinationLat = coords.lat;
        effectiveUpdates.destinationLng = coords.lng;
      }
    }
    
    const calculateFinalUpdates = (currentLoad: Load): Partial<Load> => {
        let finalUpdates = { ...effectiveUpdates };
        if (effectiveUpdates.distance !== undefined || effectiveUpdates.ratePerMile !== undefined || effectiveUpdates.tarpingFee !== undefined) {
            const newDistance = effectiveUpdates.distance ?? currentLoad.distance;
            const newRatePerMile = effectiveUpdates.ratePerMile ?? currentLoad.ratePerMile;
            const newTarpingFee = effectiveUpdates.tarpingFee ?? (currentLoad.tarpingFee || 0);
            finalUpdates.totalAgreedRate = (newDistance * newRatePerMile) + newTarpingFee;
        }
        if (effectiveUpdates.distance !== undefined) {
            finalUpdates.estimatedDriveTimeHours = (effectiveUpdates.distance || 0) / 55;
        }
        if (effectiveUpdates.origin) {
            const sanitized = sanitizeAddress(effectiveUpdates.origin);
            if (typeof effectiveUpdates.origin.lat === 'number') {
                finalUpdates.originLat = effectiveUpdates.origin.lat;
                finalUpdates.originLng = effectiveUpdates.origin.lng;
            }
            finalUpdates.origin = sanitized;
        }
        if (effectiveUpdates.destination) {
            const sanitized = sanitizeAddress(effectiveUpdates.destination);
            if (typeof effectiveUpdates.destination.lat === 'number') {
                finalUpdates.destinationLat = effectiveUpdates.destination.lat;
                finalUpdates.destinationLng = effectiveUpdates.destination.lng;
            }
            finalUpdates.destination = sanitized;
        }
        if (effectiveUpdates.expenses && currentLoad.expenses) {
            finalUpdates.expenses = { ...currentLoad.expenses, ...effectiveUpdates.expenses };
        }
        
        // Automatic arrival / detention timestamp capture
        const isTransitioningToArrived =
          effectiveUpdates.status === 'arrived' ||
          (effectiveUpdates as any).status === 'Arrived' ||
          effectiveUpdates.status === 'arrived-origin' ||
          effectiveUpdates.status === 'arrived-destination' ||
          effectiveUpdates.driverPhase === 'Arrived';

        if (isTransitioningToArrived) {
          finalUpdates.arrivedAt = effectiveUpdates.arrivedAt || currentLoad.arrivedAt || new Date().toISOString();
        }

        // Post-Delivery & Paperwork Workflow: Timestamp drop-off and transition to paperwork phase
        const isMarkingDelivered =
          effectiveUpdates.status === 'delivered' ||
          effectiveUpdates.driverPhase === 'Complete' ||
          updates.status === 'delivered';

        if (isMarkingDelivered) {
          finalUpdates.deliveredAt = effectiveUpdates.deliveredAt || currentLoad.deliveredAt || new Date().toISOString();
          const hasSignedBol = Boolean(currentLoad.signedBolUrl || effectiveUpdates.signedBolUrl || updates.signedBolUrl);
          finalUpdates.paperworkStatus = hasSignedBol ? 'pod_uploaded' : 'pending_pod';
        }

        if (effectiveUpdates.signedBolUrl || updates.signedBolUrl) {
          finalUpdates.paperworkStatus = 'pod_uploaded';
          finalUpdates.signedBolUploadedAt = effectiveUpdates.signedBolUploadedAt || new Date().toISOString();
        }
        
        // -- Finalize Expenses on Delivery --
        if (updates.status === 'delivered' && currentLoad.status !== 'delivered') {
          const distance = finalUpdates.distance ?? currentLoad.distance ?? 0;
          const deadhead = currentLoad.deadheadMiles ?? 0;
          const totalMiles = distance + deadhead;

          const isLtlLoad = Boolean(currentLoad.isPartialLTL ?? currentLoad.isLtl ?? currentLoad.isPartialLoad);
          const isTripConsolidated = Boolean(currentLoad.tripId && currentLoad.tripId !== 'none');
          let costShare = 1.0;
          if (isLtlLoad || isTripConsolidated) {
             if (currentLoad.deckPercentageUsed !== undefined && currentLoad.deckPercentageUsed > 0) {
               costShare = Math.max(0.01, Math.min(1.0, currentLoad.deckPercentageUsed / 100));
             } else {
               const tripLoads = loads.filter(l => l.tripId === currentLoad.tripId && l.status !== 'delivered');
               costShare = 1 / Math.max(1, tripLoads.length);
             }
          }

          const truckId = currentLoad.assignedTruckId;
          const truck = vehicles.find(v => v.id === truckId);
          const mpg = truck?.mpg ?? settings.truckMpg ?? 10;
          const fuelCostPerGallon = settings.defaultFuelCostPerGallon ?? 4.0;
          const defCostPerGallon = settings.defCostPerGallon ?? 4.5;

          const projFuel = mpg > 0 ? (totalMiles / mpg) * fuelCostPerGallon : 0;
          const projDef = mpg > 0 ? (totalMiles / mpg) * 0.025 * defCostPerGallon : 0;
          const projMaint = 0; // Baseline proj maintenance is usually 0 unless we extract truck maintenance cpm

          const activeTruckCount = Math.max(1, vehicles.filter(v => v.type === 'truck').length);
          const globalMonthlyOverhead = settings.recurringExpenses.reduce((s, e) => s + (e.amount || 0), 0);
          const perTruckGlobalMonthly = globalMonthlyOverhead / activeTruckCount;
          const projRecurring = (perTruckGlobalMonthly / (settings.truckAverageSpeed ? settings.truckAverageSpeed * 24 * 20 : 5000)) * totalMiles * costShare; 

          // Calculate Projected Payroll based on LoadCard logic
          let projPayroll = 0;
          const driver = driverProfiles.find(d => d.uid === currentLoad.assignedDriverId);
          if (driver) {
            if (driver.payType === 'per-mile') {
              projPayroll = totalMiles * (driver.payRate || 0) * costShare;
            } else if (driver.payType === 'hourly') {
              const estHours = driver.estimatedTripHours || (totalMiles > 0 ? totalMiles / (settings.truckAverageSpeed || 55) : 0);
              projPayroll = estHours * (driver.payRate || settings.defaultDriverHourlyRate || 25) * costShare;
            }
          }

          const loadExpenses = expenses.filter(e => e.loadId === currentLoad.id);
          const sumCat = (match: string) => loadExpenses.filter(e => e.category.toLowerCase().includes(match)).reduce((s, e) => s + e.amount, 0);

          const manualFuel = sumCat('fuel');
          const manualDef = sumCat('def');
          const manualPayroll = sumCat('payroll');
          const manualMaint = sumCat('maintenance') || sumCat('maint');
          const manualOverhead = sumCat('recurring') || sumCat('overhead');
          const manualTolls = sumCat('toll');
          const manualOther = loadExpenses.filter(e => !['fuel','def','payroll','maintenance','maint','recurring','overhead','toll'].some(c => e.category.toLowerCase().includes(c))).reduce((s, e) => s + e.amount, 0);

          finalUpdates.expenses = {
             fuel: manualFuel > 0 ? manualFuel : projFuel,
             def: manualDef > 0 ? manualDef : projDef,
             payroll: manualPayroll > 0 ? manualPayroll : projPayroll,
             maintenance: manualMaint > 0 ? manualMaint : projMaint,
             recurring: (manualOverhead > 0 ? manualOverhead : projRecurring) + manualTolls + manualOther,
             calculated: true
          };
        }

        return finalUpdates;
    };

    if (isTrialSession || (IS_ADMIN_REVIEW_MODE && user.uid === mockReviewUser.uid)) {
        try {
          const currentLoad = loads.find(l => l.id === id);
          if (!currentLoad) throw new Error("Load not found");
          const finalUpdates = calculateFinalUpdates(currentLoad);
          setLoads(prevLoads => prevLoads.map(l => l.id === id ? { ...l, ...finalUpdates } as Load : l));

          if (updates.status && updates.status !== currentLoad.status && currentLoad.assignedDriverId) {
            const driverUpdates: Partial<DriverProfile> = {};
            const isDelivered = updates.status === 'delivered' || (updates.status as string) === 'completed';
            const isManualAdvanceToLoaded = updates.status === 'in-transit';
            const isManualAdvanceToOrigin = updates.status === 'arrived-origin' || updates.status === 'loading' || updates.status === 'arrived' || (updates as any).status === 'Arrived';
            const oLat = typeof finalUpdates.origin?.lat === 'number' ? finalUpdates.origin.lat : (typeof currentLoad.origin?.lat === 'number' ? currentLoad.origin.lat : currentLoad.originLat);
            const oLng = typeof finalUpdates.origin?.lng === 'number' ? finalUpdates.origin.lng : (typeof currentLoad.origin?.lng === 'number' ? currentLoad.origin.lng : currentLoad.originLng);

            const destObj = finalUpdates.destination || currentLoad.destination;
            const destCity = (destObj?.city || '').trim();
            const destState = (destObj?.state || '').trim();
            const destString = destCity && destState ? `${destCity}, ${destState}` : (destCity || destState || (typeof destObj === 'string' ? destObj : ''));
            let dLat = typeof finalUpdates.destination?.lat === 'number' ? finalUpdates.destination.lat : (typeof currentLoad.destination?.lat === 'number' ? currentLoad.destination.lat : currentLoad.destinationLat);
            let dLng = typeof finalUpdates.destination?.lng === 'number' ? finalUpdates.destination.lng : (typeof currentLoad.destination?.lng === 'number' ? currentLoad.destination.lng : currentLoad.destinationLng);
            if ((typeof dLat !== 'number' || typeof dLng !== 'number' || isNaN(dLat) || isNaN(dLng)) && destCity) {
              const res = resolveCoordinates(destCity, destState);
              if (res) { dLat = res.lat; dLng = res.lng; }
            }

            if (isDelivered) {
              driverUpdates.availabilityStatus = 'Available';
              driverUpdates.currentStaging = destString;
              driverUpdates.lastLocationCity = destCity;
              driverUpdates.lastLocationState = destState;
              driverUpdates.lastCompletionTimestamp = new Date().toISOString();
              if (typeof dLat === 'number' && typeof dLng === 'number') {
                driverUpdates.currentLat = dLat;
                driverUpdates.currentLng = dLng;
              }
              const existingDriver = driverProfiles.find(d => d.uid === currentLoad.assignedDriverId || d.id === currentLoad.assignedDriverId);
              driverUpdates.telemetry = {
                ...(existingDriver?.telemetry || {}),
                status: 'Available',
                lat: typeof dLat === 'number' ? dLat : existingDriver?.currentLat,
                lng: typeof dLng === 'number' ? dLng : existingDriver?.currentLng,
                updatedAt: new Date().toISOString(),
              };
            } else if (isManualAdvanceToLoaded) {
              driverUpdates.availabilityStatus = 'Active - Stacking Available';
              if (typeof oLat === 'number' && typeof oLng === 'number') {
                driverUpdates.currentLat = oLat;
                driverUpdates.currentLng = oLng;
              }
              const existingDriver = driverProfiles.find(d => d.uid === currentLoad.assignedDriverId || d.id === currentLoad.assignedDriverId);
              driverUpdates.telemetry = {
                ...(existingDriver?.telemetry || {}),
                status: 'In Transit',
                lat: typeof oLat === 'number' ? oLat : existingDriver?.currentLat,
                lng: typeof oLng === 'number' ? oLng : existingDriver?.currentLng,
                updatedAt: new Date().toISOString(),
              };
            } else if (isManualAdvanceToOrigin) {
              driverUpdates.availabilityStatus = 'Active - Stacking Available';
              if (currentLoad.origin?.city) {
                driverUpdates.lastLocationCity = currentLoad.origin.city;
                driverUpdates.lastLocationState = currentLoad.origin.state;
              }
              if (typeof oLat === 'number' && typeof oLng === 'number') {
                driverUpdates.currentLat = oLat;
                driverUpdates.currentLng = oLng;
              }
              const existingDriver = driverProfiles.find(d => d.uid === currentLoad.assignedDriverId || d.id === currentLoad.assignedDriverId);
              driverUpdates.telemetry = {
                ...(existingDriver?.telemetry || {}),
                status: updates.status === 'loading' ? 'Loading' : 'Arrived',
                lat: typeof oLat === 'number' ? oLat : existingDriver?.currentLat,
                lng: typeof oLng === 'number' ? oLng : existingDriver?.currentLng,
                updatedAt: new Date().toISOString(),
              };
            }
            if (Object.keys(driverUpdates).length > 0) {
              setDriverProfiles(prev => prev.map(p => (p.uid === currentLoad.assignedDriverId || p.id === currentLoad.assignedDriverId) ? { ...p, ...driverUpdates } : p));
            }
          }

          toast({ title: "Trial/Review: Load Updated", description: `Load ${id} updated locally.` });
          return;
        } catch (err: any) {
          toast({ variant: "destructive", title: "Delivery Blocked", description: err.message });
          return;
        }
    }

    try {
      const ownerUid = user.role === 'driver' ? (driverOwnerId ?? user.uid) : user.uid;
      const loadRef = doc(db, `users/${ownerUid}/loads`, id);
      const docSnap = await getDoc(loadRef);
      if (!docSnap.exists()) throw new Error("Load not found for update.");
      
      const currentLoad = { id: docSnap.id, ...docSnap.data() } as Load;
      const finalUpdates = calculateFinalUpdates(currentLoad);
      const safeUpdates = sanitizeForFirestore(finalUpdates);

      await updateDoc(loadRef, safeUpdates);
      setLoads(prevLoads => prevLoads.map(l => l.id === id ? { ...currentLoad, ...finalUpdates } as Load : l));

      let toastMessage = "Load details saved.";
      if (updates.status && updates.status !== currentLoad.status) {
        toastMessage = `Load status changed to ${updates.status}.`;
        
        // Handle Driver Availability Tracking
        if (currentLoad.assignedDriverId) {
          const driverUpdates: Partial<DriverProfile> = {};
          
          const isDelivered = updates.status === 'delivered' || (updates.status as string) === 'completed';
          const destObj = finalUpdates.destination || currentLoad.destination;
          const destCity = (destObj?.city || '').trim();
          const destState = (destObj?.state || '').trim();
          const destString = destCity && destState ? `${destCity}, ${destState}` : (destCity || destState || (typeof destObj === 'string' ? destObj : ''));
          let dLat = typeof finalUpdates.destination?.lat === 'number' ? finalUpdates.destination.lat : (typeof currentLoad.destination?.lat === 'number' ? currentLoad.destination.lat : currentLoad.destinationLat);
          let dLng = typeof finalUpdates.destination?.lng === 'number' ? finalUpdates.destination.lng : (typeof currentLoad.destination?.lng === 'number' ? currentLoad.destination.lng : currentLoad.destinationLng);
          if ((typeof dLat !== 'number' || typeof dLng !== 'number' || isNaN(dLat) || isNaN(dLng)) && destCity) {
            const res = resolveCoordinates(destCity, destState);
            if (res) { dLat = res.lat; dLng = res.lng; }
          }

          if (isDelivered) {
            driverUpdates.availabilityStatus = 'Available';
            driverUpdates.currentStaging = destString;
            driverUpdates.lastLocationCity = destCity;
            driverUpdates.lastLocationState = destState;
            driverUpdates.lastCompletionTimestamp = new Date().toISOString();
            if (typeof dLat === 'number' && typeof dLng === 'number') {
              driverUpdates.currentLat = dLat;
              driverUpdates.currentLng = dLng;
            }
            const existingDriver = driverProfiles.find(d => d.uid === currentLoad.assignedDriverId || d.id === currentLoad.assignedDriverId);
            driverUpdates.telemetry = {
              ...(existingDriver?.telemetry || {}),
              status: 'Available',
              lat: typeof dLat === 'number' ? dLat : existingDriver?.currentLat,
              lng: typeof dLng === 'number' ? dLng : existingDriver?.currentLng,
              updatedAt: new Date().toISOString(),
            };
          } else if (
            updates.status === 'arrived' ||
            (updates as any).status === 'Arrived' ||
            updates.status === 'arrived-destination'
          ) {
            driverUpdates.availabilityStatus = 'Active - Stacking Available';
            if (currentLoad.destination?.city) {
              driverUpdates.lastLocationCity = currentLoad.destination.city;
              driverUpdates.lastLocationState = currentLoad.destination.state;
            }
          } else if (updates.status === 'arrived-origin') {
            driverUpdates.availabilityStatus = 'Active - Stacking Available';
            if (currentLoad.origin?.city) {
              driverUpdates.lastLocationCity = currentLoad.origin.city;
              driverUpdates.lastLocationState = currentLoad.origin.state;
            }
          } else if (updates.status === 'in-transit' || updates.status === 'dispatched' || updates.status === 'loading' || updates.status === 'unloading') {
            driverUpdates.availabilityStatus = 'Active - Stacking Available';
          }
          
          // Snap Telemetry to Reality: When a manual override advances status,
          // instantly snap driver telemetry and coordinates to origin coordinates,
          // completing Leg 1 (deadhead) and advancing active routing to Leg 2.
          const isManualAdvanceToLoaded = updates.status === 'in-transit';
          const isManualAdvanceToOrigin = updates.status === 'arrived-origin' || updates.status === 'loading' || updates.status === 'arrived' || (updates as any).status === 'Arrived';
          
          const oLat = typeof finalUpdates.origin?.lat === 'number' ? finalUpdates.origin.lat : (typeof currentLoad.origin?.lat === 'number' ? currentLoad.origin.lat : currentLoad.originLat);
          const oLng = typeof finalUpdates.origin?.lng === 'number' ? finalUpdates.origin.lng : (typeof currentLoad.origin?.lng === 'number' ? currentLoad.origin.lng : currentLoad.originLng);

          if (isManualAdvanceToLoaded) {
            driverUpdates.availabilityStatus = 'Active - Stacking Available';
            if (typeof oLat === 'number' && typeof oLng === 'number') {
              driverUpdates.currentLat = oLat;
              driverUpdates.currentLng = oLng;
            }
            const existingDriver = driverProfiles.find(d => d.uid === currentLoad.assignedDriverId);
            driverUpdates.telemetry = {
              ...(existingDriver?.telemetry || {}),
              status: 'In Transit',
              lat: typeof oLat === 'number' ? oLat : existingDriver?.currentLat,
              lng: typeof oLng === 'number' ? oLng : existingDriver?.currentLng,
              updatedAt: new Date().toISOString(),
            };
          } else if (isManualAdvanceToOrigin) {
            driverUpdates.availabilityStatus = 'Active - Stacking Available';
            if (currentLoad.origin?.city) {
              driverUpdates.lastLocationCity = currentLoad.origin.city;
              driverUpdates.lastLocationState = currentLoad.origin.state;
            }
            if (typeof oLat === 'number' && typeof oLng === 'number') {
              driverUpdates.currentLat = oLat;
              driverUpdates.currentLng = oLng;
            }
            const existingDriver = driverProfiles.find(d => d.uid === currentLoad.assignedDriverId);
            driverUpdates.telemetry = {
              ...(existingDriver?.telemetry || {}),
              status: updates.status === 'loading' ? 'Loading' : 'Arrived',
              lat: typeof oLat === 'number' ? oLat : existingDriver?.currentLat,
              lng: typeof oLng === 'number' ? oLng : existingDriver?.currentLng,
              updatedAt: new Date().toISOString(),
            };
          }
          
          if (Object.keys(driverUpdates).length > 0) {
            const assignedDriver = driverProfiles.find(d => d.uid === currentLoad.assignedDriverId || d.id === currentLoad.assignedDriverId);
            const driverKeys = Array.from(new Set([
              currentLoad.assignedDriverId,
              assignedDriver?.uid,
              assignedDriver?.id
            ].filter(Boolean) as string[]));

            setDriverProfiles(prev => prev.map(p => 
              driverKeys.includes(p.uid) || (p.id && driverKeys.includes(p.id)) 
                ? { ...p, ...driverUpdates } 
                : p
            ));

            if (!isTrialSession && !(IS_ADMIN_REVIEW_MODE && user.uid === mockReviewUser.uid)) {
              const ownerId = user.role === 'driver' ? (driverOwnerId ?? user.uid) : user.uid;
              const sanitizedDriverUpdates = sanitizeForFirestore(driverUpdates);
              
              // 1. Scoped driver profile under users/{ownerId}/driverProfiles/{driverId}
              for (const key of driverKeys) {
                try {
                  const driverRef = doc(db, `users/${ownerId}/driverProfiles`, key);
                  await updateDoc(driverRef, sanitizedDriverUpdates);
                } catch (e) {
                  // Handled if key is alternate identifier
                }
              }

              // 2. Explicitly update root drivers/{driverId} document
              for (const key of driverKeys) {
                try {
                  const rootDriverRef = doc(db, 'drivers', key);
                  await updateDoc(rootDriverRef, sanitizedDriverUpdates);
                } catch (e) {
                  // Best-effort if root drivers collection is mapped
                }
              }
            }
          }
        }

        // Auto-close Completed Trip Containers
        if (updates.status === 'delivered' && currentLoad.tripId) {
          const tripId = currentLoad.tripId;
          const otherLoadsOnTrip = loads.filter(l => l.tripId === tripId && l.id !== id);
          const allOthersDelivered = otherLoadsOnTrip.every(l => l.status === 'delivered');
          if (allOthersDelivered) {
            await updateTrip(tripId, { status: 'completed' });
            // The updateTrip function already triggers a toast, but this happens in the background.
          }
        }

        const client = clients.find(c => c.id === currentLoad.clientId);
        if (client && client.contactEmail) {
          const subject = `Load Update: ${currentLoad.loadNumber || id} - Status: ${updates.status}`;
          const body = `Dear ${client.contactName || client.companyName},<br><br>The status of your load (${formatAddress(currentLoad.origin, 'short')} to ${formatAddress(currentLoad.destination, 'short')}) has been updated to: <strong>${updates.status.toUpperCase()}</strong>.`;
          await sendNotificationEmail({ recipientEmail: client.contactEmail, subject, body });
          toast({ title: "Client Notification", description: `Simulated notification sent for status: ${updates.status}.` });
        }
      }

      // Trigger FCM push notification and in-app notification if a driver was assigned or changed, or if load transitioned to dispatched
      const newlyAssignedDriverId = updates.assignedDriverId || currentLoad.assignedDriverId;
      const isStatusTransitionToDispatched = updates.status === 'dispatched' && currentLoad.status !== 'dispatched';
      const isDriverAssignmentChanged = updates.assignedDriverId && updates.assignedDriverId !== 'none' && updates.assignedDriverId !== currentLoad.assignedDriverId;

      if (newlyAssignedDriverId && newlyAssignedDriverId !== 'none' && (isStatusTransitionToDispatched || isDriverAssignmentChanged)) {
        const assignedDriver = driverProfiles.find(d => d.uid === newlyAssignedDriverId);
        if (assignedDriver) {
          sendDriverPushNotification({
            driver: assignedDriver,
            originCity: finalUpdates.origin?.city || currentLoad.origin?.city,
            originState: finalUpdates.origin?.state || currentLoad.origin?.state,
          }).catch(err => console.warn('Failed to send push notification on updateLoad assignment/dispatch:', err));
        }

        const originLoc = finalUpdates.origin?.city || currentLoad.origin?.city || 'Origin';
        const destLoc = finalUpdates.destination?.city || currentLoad.destination?.city || 'Destination';
        sendDriverNotification({
          driverId: newlyAssignedDriverId,
          title: isStatusTransitionToDispatched ? 'Load Dispatched to You' : 'New Load Assigned',
          message: `Load ${finalUpdates.loadNumber || currentLoad.loadNumber || id} from ${originLoc} to ${destLoc} has been dispatched.`,
          loadId: id,
        }).catch(err => console.warn('Failed in-app driver notification on updateLoad:', err));
      }

      toast({ title: "Load Updated", description: toastMessage });
    } catch (error: any) {
      console.error('Error updating load:', error);
      toast({ variant: "destructive", title: "Error Updating Load", description: error.message });
    }
  }, [user, driverOwnerId, settings, isTrialSession, clients, toast, driverProfiles, loads]); 

  const handleDeleteLoad = async (loadId: string) => {
    if (!user || !ADMIN_ROLES.includes(user.role as any) || !window.confirm("Are you sure you want to delete this load? This action cannot be undone.")) return;
    setIsSubmitting(true);
    if (isTrialSession || (IS_ADMIN_REVIEW_MODE && user.uid === mockReviewUser.uid)) {
        setLoads(prevLoads => prevLoads.filter(l => l.id !== loadId));
        toast({ title: "Trial/Review: Load Deleted", description: `Load ${loadId} removed locally.` });
    } else {
        try {
          await deleteDoc(doc(db, `users/${user.uid}/loads`, loadId));
          setLoads(prevLoads => prevLoads.filter(l => l.id !== loadId));
          toast({ title: "Load Deleted", description: "Load has been successfully deleted." });
        } catch (error: any) {
          console.error('Error deleting load:', error);
          toast({ variant: "destructive", title: "Error Deleting Load", description: error.message });
        }
    }
    setIsSubmitting(false);
  };

  // Maps a driver phase to the dispatcher load status that should apply
  const phaseToLoadStatus = (phase: Load['driverPhase']): Load['status'] => {
    if (phase === 'Complete') return 'delivered';
    if (phase === 'Arrived') return 'arrived';
    if (phase === 'Enroute to Pickup' || phase === 'Getting Loaded' ||
        phase === 'Enroute to Destination' || phase === 'Getting Unloaded') return 'in-transit';
    return 'in-transit';
  };

  const updateLoadPhaseWithLocation = async (loadId: string, phase: Load['driverPhase'], lat?: number, lng?: number, note?: string) => {
    if (!user) return;
    const noteFields = note?.trim()
      ? { driverNote: note.trim(), driverNoteUpdatedAt: new Date().toISOString() }
      : {};
    const autoStatus = phaseToLoadStatus(phase);
    const isDelivered = phase === 'Complete' || autoStatus === 'delivered';
    const deliveryFields = isDelivered ? { deliveredAt: new Date().toISOString() } : {};
    const arrivalFields = (phase === 'Arrived' || autoStatus === 'arrived')
      ? { arrivedAt: new Date().toISOString() }
      : {};
    const stateUpdate = { driverPhase: phase, status: autoStatus, ...noteFields, ...arrivalFields, ...deliveryFields };
    // In review/trial mode update local state only
    if (isTrialSession || (IS_ADMIN_REVIEW_MODE && user.uid === mockReviewUser.uid)) {
      setLoads(prev => prev.map(l => l.id === loadId ? { ...l, ...stateUpdate } : l));
      return;
    }
    const ownerUid = user.role === 'driver' ? (driverOwnerId ?? user.uid) : user.uid;
    try {
      const batch = writeBatch(db);
      const loadRef = doc(db, `users/${ownerUid}/loads`, loadId);
      // Write driverPhase, derived load status, and arrival timestamp atomically
      batch.update(loadRef, { driverPhase: phase, status: autoStatus, ...noteFields, ...arrivalFields });

      if (user.role === 'driver' && driverOwnerId) {
        const driverRef = doc(db, `users/${driverOwnerId}/driverProfiles`, user.uid);
        if (lat !== undefined && lng !== undefined) {
          batch.update(driverRef, { currentLat: lat, currentLng: lng });
        }
      } else if (user.driverProfileId) {
        const driverRef = doc(db, `users/${ownerUid}/driverProfiles`, user.driverProfileId);
        if (lat !== undefined && lng !== undefined) {
          batch.update(driverRef, { currentLat: lat, currentLng: lng });
        }
      }

      await batch.commit();
      setLoads(prev => prev.map(l => l.id === loadId ? { ...l, ...stateUpdate } : l));
    } catch (error) {
      console.error("Error updating load phase/location:", error);
      toast({ variant: "destructive", title: "Update Failed", description: "Could not update status." });
    }
  };


  const reportDriverException = async (loadId: string, flag: Load['driverExceptionFlag'], note?: string) => {
    if (!user) return;
    const now = new Date().toISOString();
    const updates: Partial<Load> = {
      driverExceptionFlag: flag ?? null,
      driverNoteUpdatedAt: now,
      ...(note?.trim() ? { driverNote: note.trim() } : {}),
    };
    if (isTrialSession || (IS_ADMIN_REVIEW_MODE && user.uid === mockReviewUser.uid)) {
      setLoads(prev => prev.map(l => l.id === loadId ? { ...l, ...updates } : l));
      toast({ title: flag ? 'Exception Reported' : 'Exception Cleared', description: flag ?? 'Flag removed.' });
      return;
    }
    const ownerUid = user.role === 'driver' ? (driverOwnerId ?? user.uid) : user.uid;
    try {
      const loadRef = doc(db, `users/${ownerUid}/loads`, loadId);
      // Use deleteField() when clearing the flag so Firestore removes the field
      const firestoreUpdates: Record<string, any> = {
        driverExceptionFlag: flag ?? deleteField(),
        driverNoteUpdatedAt: now,
        ...(note?.trim() ? { driverNote: note.trim() } : {}),
      };
      await updateDoc(loadRef, firestoreUpdates);
      setLoads(prev => prev.map(l => l.id === loadId ? { ...l, ...updates } : l));
      toast({ title: flag ? 'Exception Reported' : 'Exception Cleared', description: flag ?? 'Flag removed.' });
    } catch (error) {
      console.error('Error reporting exception:', error);
      toast({ variant: 'destructive', title: 'Error', description: 'Could not save exception.' });
    }
  };

  const updateDriverNote = async (loadId: string, note: string) => {
    if (!user) return;
    const now = new Date().toISOString();
    const cleanNote = note.trim();
    const updates: Partial<Load> = {
      driverNote: cleanNote || undefined,
      driverNoteUpdatedAt: now,
    };
    if (isTrialSession || (IS_ADMIN_REVIEW_MODE && user.uid === mockReviewUser.uid)) {
      setLoads(prev => prev.map(l => l.id === loadId ? { ...l, ...updates } : l));
      toast({ title: 'Note Sent', description: cleanNote ? 'Note sent to dispatcher.' : 'Note cleared.' });
      return;
    }
    const ownerUid = user.role === 'driver' ? (driverOwnerId ?? user.uid) : user.uid;
    try {
      const loadRef = doc(db, `users/${ownerUid}/loads`, loadId);
      const firestoreUpdates: Record<string, any> = {
        driverNote: cleanNote ? cleanNote : deleteField(),
        driverNoteUpdatedAt: now,
      };
      await updateDoc(loadRef, firestoreUpdates);
      setLoads(prev => prev.map(l => l.id === loadId ? { ...l, ...updates } : l));
      toast({ title: 'Note Sent', description: cleanNote ? 'Note sent to dispatcher.' : 'Note cleared.' });
    } catch (error) {
      console.error('Error updating driver note:', error);
      toast({ variant: 'destructive', title: 'Error', description: 'Could not save note.' });
    }
  };


  const approveClientLoadRequest = async (request: ClientLoadRequest) => {
    const adminRoles = ['admin', 'owner', 'company_admin'];
    if (!user || !adminRoles.includes(user.role ?? '')) return;

    // Check localStorage draft first for this request
    let cachedDraft: Partial<Load> | null = null;
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('agy_load_draft');
        if (raw) {
          const parsed = JSON.parse(raw);
          const rawId = String(request.id || '').replace(/^#/, '');
          const parsedReqId = String(parsed?.originalClientRequestId || '').replace(/^#/, '');
          if (parsed && (!parsed.originalClientRequestId || parsedReqId === rawId || parsed.originalClientRequestId === request.id)) {
            cachedDraft = parsed;
          }
        }
      } catch {}
    }

    // Also check active loadForm in context
    const currentContextReqId = String(loadForm?.originalClientRequestId || '').replace(/^#/, '');
    const cleanRequestId = String(request.id || '').replace(/^#/, '');
    if (loadForm && (currentContextReqId === cleanRequestId || (!loadForm.originalClientRequestId && loadForm.clientId))) {
      cachedDraft = { 
        ...(cachedDraft || {}), 
        ...loadForm,
        clientId: loadForm.clientId || cachedDraft?.clientId || '',
      };
    }

    // Read clientId directly from the pending request object, ignoring email entirely
    const reqClientId = String(
      request.clientId ||
      cachedDraft?.clientId ||
      loadForm?.clientId ||
      ''
    ).trim();
    const cleanReqClientId = reqClientId.replace(/^#/, '');

    // Match clientId directly against clients array
    const matchingClient = clients.find(c => {
      const cId = String(c.id || '').trim();
      const cCleanId = cId.replace(/^#/, '');
      const cClientId = (c as any).clientId ? String((c as any).clientId).trim().replace(/^#/, '') : '';
      return Boolean(reqClientId && (cId === reqClientId || cCleanId === cleanReqClientId || cClientId === cleanReqClientId));
    });

    const resolvedClientId = matchingClient?.id || reqClientId;
    const resolvedClientName = matchingClient?.companyName || (request.companyName && !request.companyName.includes('@') ? request.companyName : '');

    const loadDataFromRequest: any = {
      ...cachedDraft,
      clientId: resolvedClientId,
      clientName: resolvedClientName,
      companyName: resolvedClientName,
      origin: cachedDraft?.origin || request.origin,
      destination: cachedDraft?.destination || request.destination,
      pickupDateTime: cachedDraft?.pickupDateTime || toDateTimeLocalInput(request.requestedPickupDateTime), 
      deliveryDateTime: cachedDraft?.deliveryDateTime || toDateTimeLocalInput(request.requestedDeliveryDateTime), 
      ratePerMile: cachedDraft?.ratePerMile ?? 0,
      distance: cachedDraft?.distance ?? 0,
      status: cachedDraft?.status || 'pending',
      cargoDescription: cachedDraft?.cargoDescription || request.cargoDescription,
      cargoQuantity: cachedDraft?.cargoQuantity ?? request.cargoQuantity ?? 1,
      cargoWeightNum: cachedDraft?.cargoWeightNum ?? request.cargoWeightNum,
      cargoLength: cachedDraft?.cargoLength ?? request.cargoLength,
      cargoWidth: cachedDraft?.cargoWidth ?? request.cargoWidth,
      cargoHeight: cachedDraft?.cargoHeight ?? request.cargoHeight,
      placementMode: cachedDraft?.placementMode || request.placementMode || 'standard',
      requiresTarping: cachedDraft?.requiresTarping ?? false,
      tarpingFee: cachedDraft?.tarpingFee ?? 0,
      originalClientRequestId: request.id,
      requestedByClientName: request.requestedByClientName,
      requestedByAuthUid: request.requestedByClientUid || reqClientId,
    };
    setLoadForm(loadDataFromRequest);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('agy_load_draft', JSON.stringify(loadDataFromRequest));
      } catch {}
    }
    setEditingLoadId(null); 
    setActiveTab('loads'); 
  
    if (!isTrialSession && !(IS_ADMIN_REVIEW_MODE && user?.uid === mockReviewUser.uid)) {
        try {
            const requestRef = doc(db, 'clientLoadRequests', request.id!);
            // Mark as 'in_review' so it stays in pending list but admin knows it's being worked on
            await updateDoc(requestRef, { status: 'in_review' }); 
            setClientLoadRequests(prev => prev.map(r => r.id === request.id ? {...r, status: 'in_review'} : r));
        } catch (error: any) {
            console.warn("Could not update client request status in Firestore:", error);
            setClientLoadRequests(prev => prev.map(r => r.id === request.id ? {...r, status: 'in_review'} : r));
        }
    } else {
        setClientLoadRequests(prev => prev.map(r => r.id === request.id ? {...r, status: 'in_review'} : r));
    }
    toast({ title: "Request In Review", description: "Load form pre-filled. Complete the details and click Add Load to save and finalize approval." });
  };

  const rejectClientLoadRequest = async (requestId: string, reason?: string) => {
    const adminRoles = ['admin', 'owner', 'company_admin'];
    if (user && !adminRoles.includes(user.role ?? '')) return;
    if (isTrialSession || (IS_ADMIN_REVIEW_MODE && user?.uid === mockReviewUser.uid)) {
      setClientLoadRequests(prev => prev.map(r => r.id === requestId ? {...r, status: 'rejected', rejectionReason: reason} : r));
      toast({ title: "Request Declined", description: "The client load request has been declined." });
      return;
    }
    try {
      const requestRef = doc(db, 'clientLoadRequests', requestId);
      const updateData: Record<string, any> = { status: 'rejected' };
      if (reason) {
        updateData.rejectionReason = reason;
      }
      await updateDoc(requestRef, updateData);
      setClientLoadRequests(prev => prev.map(r => r.id === requestId ? {...r, status: 'rejected', ...(reason ? { rejectionReason: reason } : {})} : r));
      toast({ title: "Request Declined", description: "The client load request has been declined." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: "Could not decline request: " + error.message });
    }
  };

  const addExpense = async () => {
    if (!user || !ADMIN_ROLES.includes(user.role as any)) return;
    setIsSubmitting(true);
    if (isTrialSession || (IS_ADMIN_REVIEW_MODE && user.uid === mockReviewUser.uid)) {
        setExpenses(prev => [...prev, { ...expenseForm, id: `mock-expense-${Date.now()}` }]);
    } else {
        try {
          await addDoc(collection(db, `users/${user.uid}/expenses`), expenseForm);
          // onSnapshot listener will add the new doc automatically — no manual push needed
        } catch (error: any) {
          toast({ variant: "destructive", title: "Error Adding Expense", description: error.message });
          setIsSubmitting(false);
          return;
        }
    }
    setExpenseForm({ date: new Date().toISOString().split('T')[0], category: '', amount: 0, loadId: '', notes: '' });
    toast({ title: "Expense Added", description: "Expense has been successfully recorded." });
    setIsSubmitting(false);
  };

  const addClient = async () => {
    if (!user || !ADMIN_ROLES.includes(user.role as any)) return;
    setIsSubmitting(true);
    if (isTrialSession || (IS_ADMIN_REVIEW_MODE && user.uid === mockReviewUser.uid)) {
        setClients(prev => [...prev, { ...clientForm, id: `mock-client-${Date.now()}` }]);
    } else {
        try {
          await addDoc(collection(db, `users/${user.uid}/clients`), clientForm);
          // onSnapshot listener will add the new doc automatically — no manual push needed
        } catch (error: any) {
          toast({ variant: "destructive", title: "Error Adding Client", description: error.message });
          setIsSubmitting(false);
          return;
        }
    }
    setClientForm({ companyName: '', contactName: '', contactEmail: '', contactPhone: '', address: emptyAddress });
    localStorage.removeItem('agy_client_draft');
    toast({ title: "Client Added", description: "New client has been successfully added." });
    setIsSubmitting(false);
  };

  const updateClient = async (id: string, updates: Partial<Client>) => {
    if (!user || !ADMIN_ROLES.includes(user.role as any)) return;
    setIsSubmitting(true);
    if (isTrialSession || (IS_ADMIN_REVIEW_MODE && user.uid === mockReviewUser.uid)) {
        setClients(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
    } else {
        try {
          const clientRef = doc(db, `users/${user.uid}/clients`, id);
          await updateDoc(clientRef, updates);
          setClients(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
        } catch (error: any) {
          toast({ variant: "destructive", title: "Error Updating Client", description: error.message });
        }
    }
    setIsSubmitting(false);
  };
  const deleteClient = async (id: string) => {
    if (!user || !ADMIN_ROLES.includes(user.role as any)) return;
    setIsSubmitting(true);
    if (isTrialSession || (IS_ADMIN_REVIEW_MODE && user.uid === mockReviewUser.uid)) {
      setClients(prev => prev.filter(c => c.id !== id));
      toast({ title: 'Trial/Review: Client Deleted', description: 'Client removed locally.' });
    } else {
      try {
        await deleteDoc(doc(db, `users/${user.uid}/clients`, id));
        setClients(prev => prev.filter(c => c.id !== id));
        toast({ title: 'Client Deleted', description: 'Client has been successfully deleted.' });
      } catch (error: any) {
        console.error('Error deleting client:', error);
        toast({ variant: 'destructive', title: 'Error Deleting Client', description: error.message });
      }
    }
    setIsSubmitting(false);
  };


  const updateSettings = async () => {
    if (!user || !ADMIN_ROLES.includes(user.role as any)) return;
    setIsSubmitting(true);
    if (isTrialSession || (IS_ADMIN_REVIEW_MODE && user.uid === mockReviewUser.uid)) {
        setSettings(settingsForm);
        toast({ title: "Trial/Review: Settings Saved", description: "Settings updated locally." });
    } else {
        try {
          const settingsRef = doc(db, `users/${user.uid}/settings`, SETTINGS_DOC_ID);
          await updateDoc(settingsRef, settingsForm);
          setSettings(settingsForm);
        } catch (error: any) {
          toast({ variant: "destructive", title: "Error Updating Settings", description: error.message });
        }
    }
    // No need to manually clear settingsForm if we want it to stay as it is, 
    // but we should ensure the draft is cleared.
    localStorage.removeItem('agy_settings_draft');
    setIsSubmitting(false);
  };



  const calculateVehicleCPM = (vehicleId: string, monthStr?: string) => {
    const vehicle = vehicles.find(v => v.id === vehicleId);
    if (!vehicle) return 0;

    const targetMonth = monthStr || formatDate(new Date(), 'yyyy-MM');

    // ── 1. Monthly Fixed Costs ─────────────────────────────────────────────
    // Fixed costs are predictable and should be divided by EXPECTED monthly
    // miles (not actual — actual may be very low mid-month and produce
    // absurdly inflated CPM that cascades into projected profit calculations).
    let fixedCosts = 0;
    if (vehicle.monthlyRecurringExpenses) {
      fixedCosts += (vehicle.monthlyRecurringExpenses.insurance || 0);
      fixedCosts += (vehicle.monthlyRecurringExpenses.payment || 0);
      fixedCosts += (vehicle.monthlyRecurringExpenses.maintenanceFund || 0);
    }
    if (vehicle.monthlyFixedCosts) {
      fixedCosts += vehicle.monthlyFixedCosts.reduce((sum, cost) => sum + (cost.amount || 0), 0);
    }
    // ELD / telematics monthly subscription
    fixedCosts += (vehicle.eldCostPerMonth || 0);
    // Per-vehicle freeform recurring items
    if (vehicle.recurringExpenses?.length) {
      fixedCosts += vehicle.recurringExpenses.reduce((sum: number, exp: RecurringExpenseItem) => sum + (exp.amount || 0), 0);
    }

    // Expected monthly miles: prefer vehicle-specific setting, fall back to
    // global settings value, then the 5,000-mile industry benchmark.
    const expectedMonthlyMiles =
      (vehicle.estimatedMonthlyMiles && vehicle.estimatedMonthlyMiles > 0)
        ? vehicle.estimatedMonthlyMiles
        : (settings.truckAverageSpeed > 0 ? settings.truckAverageSpeed * 24 * 20 : 0) || 5_000;

    const fixedCPM = fixedCosts / expectedMonthlyMiles;

    // ── 2. Variable Costs from Expenses this month ─────────────────────────
    // Variable costs (fuel receipts, repairs) are tracked as actual expenses
    // and divided by actual miles driven this month.
    const monthVariableExpenses = expenses
      .filter(exp => (exp.truckId === vehicleId || exp.trailerId === vehicleId) && exp.date?.startsWith(targetMonth))
      .reduce((sum, exp) => sum + exp.amount, 0);

    // ── 3. Actual mileage from delivered loads this month ─────────────────
    const actualMiles = loads
      .filter(l => l.assignedTruckId === vehicleId && l.status === 'delivered' && l.deliveryDateTime?.startsWith(targetMonth))
      .reduce((sum, l) => sum + (l.distance || 0) + (l.deadheadMiles || 0), 0);

    // Variable CPM only meaningful when we have actual miles
    const variableCPM = actualMiles > 0 ? monthVariableExpenses / actualMiles : 0;

    // ── 4. Per-mile operating cost from vehicle record ────────────────────
    const vehicleOpCPM = vehicle.operatingCostPerMile ?? 0;

    const totalCPM = fixedCPM + variableCPM + vehicleOpCPM;
    return parseFloat(totalCPM.toFixed(2));
  };

  const archiveVehicleCPM = async (vehicleId: string, monthStr?: string) => {
    const vehicle = vehicles.find(v => v.id === vehicleId);
    if (!vehicle) return;

    const targetMonth = monthStr || formatDate(new Date(), 'yyyy-MM');
    const cpm = calculateVehicleCPM(vehicleId, targetMonth);
    
    // 3. Mileage from Loads
    const totalMiles = loads
      .filter(l => l.assignedTruckId === vehicleId && l.status === 'delivered' && l.deliveryDateTime?.startsWith(targetMonth))
      .reduce((sum, l) => sum + (l.distance || 0) + (l.deadheadMiles || 0), 0);

    // 1+2. Total Costs
    let fixedCosts = 0;
    if (vehicle.monthlyRecurringExpenses) {
      fixedCosts += (vehicle.monthlyRecurringExpenses.insurance || 0) + (vehicle.monthlyRecurringExpenses.payment || 0) + (vehicle.monthlyRecurringExpenses.maintenanceFund || 0);
    }
    const variableCosts = expenses
      .filter(exp => (exp.truckId === vehicleId || exp.trailerId === vehicleId) && exp.date?.startsWith(targetMonth))
      .reduce((sum, exp) => sum + exp.amount, 0);

    const historyEntry = {
      month: targetMonth,
      cpm,
      totalMiles,
      totalCosts: fixedCosts + variableCosts
    };

    const newHistory = [...(vehicle.cpmHistory || [])];
    const existingIndex = newHistory.findIndex(h => h.month === targetMonth);
    if (existingIndex >= 0) {
      newHistory[existingIndex] = historyEntry;
    } else {
      newHistory.push(historyEntry);
    }

    // Keep only last 12 months for cleanliness
    const trimmedHistory = newHistory.sort((a, b) => b.month.localeCompare(a.month)).slice(0, 12);

    await updateVehicle(vehicleId, { cpmHistory: trimmedHistory });
    toast({ title: "CPM Archived", description: `Archived CPM for ${targetMonth}` });
  };

  useEffect(() => {
    if (user?.role !== 'admin' || !loads.length) return;

    const updatesToApply = new Map<string, Partial<Load>>();
    const allCurrentLoads = [...loads];

    allCurrentLoads.forEach(load => {
      if (load.status === 'delivered' && load.id) {
        const loadSpecificExpenses = expenses.filter(exp => exp.loadId === load.id);
        const manualFuelExpense = loadSpecificExpenses.find(exp => exp.category.toLowerCase() === 'fuel');
        const totalTripMiles = (load.distance || 0) + (load.deadheadMiles || 0);

        const assignedTruck = load.assignedTruckId ? vehicles.find(v => v.id === load.assignedTruckId) : null;
        const assignedDriver = load.assignedDriverId ? driverProfiles.find(p => p.uid === load.assignedDriverId) : null;

        const truckMpg = (assignedTruck && assignedTruck.mpg) ? assignedTruck.mpg : settings.truckMpg;
        const fuelCost = manualFuelExpense ? manualFuelExpense.amount
            : (totalTripMiles > 0 && truckMpg > 0 && settings.defaultFuelCostPerGallon > 0)
            ? (totalTripMiles / truckMpg) * settings.defaultFuelCostPerGallon : 0;

        const manualDefExpense = loadSpecificExpenses.find(exp => exp.category.toLowerCase() === 'def');
        // DEF = 2.5% of diesel volume × DEF price. Use mpg-based formula (consistent with LoadCard/LoadForm).
        // Legacy formula used /250 (assumes 6 MPG); this is now mpg-aware.
        const defCost = manualDefExpense ? manualDefExpense.amount
            : (totalTripMiles > 0 && truckMpg > 0 && settings.defCostPerGallon > 0)
            ? (totalTripMiles / truckMpg) * 0.025 * settings.defCostPerGallon : 0;
        
        let payroll = 0;
        if (assignedDriver) {
          if (assignedDriver.payType === 'per-mile') {
            payroll = totalTripMiles * (assignedDriver.payRate || 0);
          } else if (assignedDriver.payType === 'hourly') {
            // Estimated hours: use driver's estimatedTripHours if set, else miles ÷ average speed
            const estHours = assignedDriver.estimatedTripHours
              || (totalTripMiles > 0 ? totalTripMiles / (settings.truckAverageSpeed || 55) : 0);
            payroll = estHours * (assignedDriver.payRate || settings.defaultDriverHourlyRate || 25);
          } else {
            // percentage (default)
            const rate = assignedDriver.payRate || assignedDriver.payrollPercentage || settings.payrollPercentage;
            payroll = load.totalAgreedRate * (rate / 100);
          }
        } else {
          // No driver assigned — use global default pay model
          if (settings.defaultDriverPayType === 'hourly') {
            const estHours = totalTripMiles > 0 ? totalTripMiles / (settings.truckAverageSpeed || 55) : 0;
            payroll = estHours * (settings.defaultDriverHourlyRate || 25);
          } else {
            payroll = load.totalAgreedRate * (settings.payrollPercentage / 100);
          }
        }

        const assignedTrailer = load.assignedTrailerId ? vehicles.find(v => v.id === load.assignedTrailerId) : null;

        /**
         * Sums ALL monthly asset-level costs configured on a vehicle:
         *   - monthlyRecurringExpenses (insurance / payment / maintenanceFund)
         *   - eldCostPerMonth           (ELD / per-truck telematics subscription)
         *   - monthlyFixedCosts[]       (additional named fixed cost line items)
         *   - recurringExpenses[]       (freeform per-vehicle recurring items)
         * Returns 0 when the vehicle has no cost fields configured.
         */
        const getMonthlyTotal = (vehicle: Vehicle | null | undefined) => {
          if (!vehicle) return 0;
          let total = 0;
          if (vehicle.monthlyRecurringExpenses) {
            total += (vehicle.monthlyRecurringExpenses.insurance || 0);
            total += (vehicle.monthlyRecurringExpenses.payment || 0);
            // NOTE: maintenanceFund is intentionally excluded here.
            // It is already billed as the per-mile maintenance reserve line ($0.20/mi).
            // Including it here would double-count it against every load.
          }
          // ELD / telematics device cost (trucks only)
          total += (vehicle.eldCostPerMonth || 0);
          if (vehicle.monthlyFixedCosts) {
            total += vehicle.monthlyFixedCosts.reduce((sum, cost) => sum + (cost.amount || 0), 0);
          }
          if (vehicle.recurringExpenses && vehicle.recurringExpenses.length > 0) {
            total += vehicle.recurringExpenses.reduce((sum: number, exp: RecurringExpenseItem) => sum + (exp.amount || 0), 0);
          }
          return total;
        };

        const truckMonthly   = getMonthlyTotal(assignedTruck);
        const trailerMonthly = getMonthlyTotal(assignedTrailer);

        /**
         * Overhead proration — miles-based (not days-based).
         *
         * Uses Math.max(8_500, truck.estimatedMonthlyMiles) as the denominator to enforce
         * a minimum 8,500-mile baseline. This prevents loads on low-utilization months from
         * bearing disproportionately high overhead allocations.
         * maintenanceFund is excluded from this total (it is the separate maintenance reserve line).
         */
        const OVERHEAD_MONTHLY_MILES = Math.max(
          8_500,
          assignedTruck?.estimatedMonthlyMiles ?? 0
        );
        const activeTruckCount = Math.max(1, vehicles.filter(v => v.type === 'truck').length);
        const globalMonthlyOverhead = settings.recurringExpenses.reduce((sum, expense) => sum + expense.amount, 0);
        const perTruckGlobalMonthly = globalMonthlyOverhead / activeTruckCount;

        const vehicleMonthlyFixed = truckMonthly + trailerMonthly;
        const totalMonthlyFixed = vehicleMonthlyFixed + perTruckGlobalMonthly;
        const overheadPerMile = totalMonthlyFixed / OVERHEAD_MONTHLY_MILES;

        const isLtlLoad = Boolean(load.isPartialLTL ?? load.isLtl ?? load.isPartialLoad);
        const isTripConsolidated = Boolean(load.tripId && load.tripId !== 'none');
        let expenseCostShare = 1.0;
        if (isLtlLoad || isTripConsolidated) {
          if (load.deckPercentageUsed !== undefined && load.deckPercentageUsed > 0) {
            expenseCostShare = Math.max(0.01, Math.min(1.0, load.deckPercentageUsed / 100));
          } else {
            const tripLoads = loads.filter(l => l.tripId === load.tripId && l.status !== 'delivered');
            expenseCostShare = 1 / Math.max(1, tripLoads.length);
          }
        }

        const totalRecurringForLoad = overheadPerMile * totalTripMiles * expenseCostShare;

        // Maintenance reserve: pure per-mile maintenance reserve rate (NOT the truck's full CPM).
        // Uses the financial profile baseline rate or settings rate (no hardcoded placeholder).
        const maintenanceReserveRate = financialProfile?.maintenanceCostPerMile ?? settings.defaultOperatingCostPerMile ?? 0;
        const totalOperatingCost = totalTripMiles * maintenanceReserveRate * expenseCostShare;

        const newExpensesPayload = {
          payroll: parseFloat(payroll.toFixed(2)), 
          fuel: parseFloat(fuelCost.toFixed(2)),
          def: parseFloat(defCost.toFixed(2)), 
          recurring: parseFloat(totalRecurringForLoad.toFixed(2)),
          maintenance: parseFloat(totalOperatingCost.toFixed(2)),
          calculated: true
        };

        const existingExpenses = load.expenses || { calculated: false, payroll: 0, fuel: 0, def: 0, recurring: 0, maintenance: 0 };
        
        if (
          !existingExpenses.calculated || 
          existingExpenses.payroll !== newExpensesPayload.payroll ||
          existingExpenses.fuel !== newExpensesPayload.fuel || 
          existingExpenses.def !== newExpensesPayload.def ||
          existingExpenses.recurring !== newExpensesPayload.recurring ||
          existingExpenses.maintenance !== newExpensesPayload.maintenance
        ) {
          updatesToApply.set(load.id, { expenses: newExpensesPayload });
        }

      }
    });
    
    if (updatesToApply.size > 0) {
        if (isTrialSession || (IS_ADMIN_REVIEW_MODE && user.uid === mockReviewUser.uid)) {
            setLoads(prevLoads => prevLoads.map(l => l.id && updatesToApply.has(l.id) ? { ...l, ...updatesToApply.get(l.id) } : l));
            return;
        }
        const batch = writeBatch(db);
        updatesToApply.forEach((update, id) => batch.update(doc(db, `users/${user.uid}/loads`, id), update));
        batch.commit().then(() => {
            setLoads(prevLoads => prevLoads.map(l => l.id && updatesToApply.has(l.id) ? { ...l, ...updatesToApply.get(l.id) } : l));
        }).catch(error => {
            toast({ variant: "destructive", title: "Error Calculating Expenses", description: "Could not save all calculated load expenses." });
        });
    }
  }, [loads, settings, expenses, user, toast, isTrialSession]);

  const generateAgreement = async (loadData: Load) => {
    if (!user || !ADMIN_ROLES.includes(user.role as any)) return;
    const client = clients.find(c => c.id === loadData.clientId);
    if (!client) {
        toast({ variant: "destructive", title: "Client Not Found", description: "Cannot generate agreement without client details." });
        return;
    }
    setIsSubmitting(true);
    try {
      // Optimized: Dynamic import to reduce initial bundle size
      const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
      const pdfDoc = await PDFDocument.create();
      let page = pdfDoc.addPage([600, 850]); 
      const { width, height } = page.getSize();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const fontSize = 10, titleFontSize = 16, subTitleFontSize = 12, lineSpacing = 15, sectionSpacing = 25, margin = 60;
      let yPos = height - margin - 10;


      const drawTextLine = (text: string, fontToUse: any, size: number, x: number, y: number, color = rgb(0,0,0)) => {
        page.drawText(text, { x, y, font: fontToUse, size, color });
        return y - size - 3; 
      };

      yPos = drawTextLine('Hotshot Trucking Agreement', boldFont, titleFontSize, margin, yPos);
      if (loadData.loadNumber) {
        yPos = drawTextLine(`Load ID: ${loadData.loadNumber}`, boldFont, subTitleFontSize - 2, width - margin - 100, height - margin); 
      }
      yPos -= lineSpacing;
      yPos = drawTextLine(`Date of Agreement: ${new Date().toLocaleDateString()}`, font, fontSize, margin, yPos);
      yPos -= sectionSpacing;
      
      // Basic Agreement Text logic (omitted for brevity but functional as before)
      yPos = drawTextLine('Carrier Information:', boldFont, subTitleFontSize, margin, yPos);
      yPos = drawTextLine(`${settings.carrierName}`, font, fontSize, margin + 20, yPos);
      yPos = drawTextLine(`${formatAddress(settings.carrierAddress)}`, font, fontSize, margin + 20, yPos);

      yPos -= sectionSpacing;

      yPos = drawTextLine('Client Information:', boldFont, subTitleFontSize, margin, yPos);
      yPos = drawTextLine(`${client.companyName}`, font, fontSize, margin + 20, yPos);
      yPos = drawTextLine(`Contact: ${client.contactName}`, font, fontSize, margin + 20, yPos);
      yPos -= sectionSpacing;

      yPos = drawTextLine('Load Details:', boldFont, subTitleFontSize, margin, yPos);
      yPos = drawTextLine(`Origin: ${formatAddress(loadData.origin)}`, font, fontSize, margin + 20, yPos);

      // Consignee / Deliver To block — show company name prominently when present
      yPos = drawTextLine('Consignee / Deliver To:', boldFont, fontSize, margin + 20, yPos);
      if (loadData.destination?.companyName) {
        yPos = drawTextLine(loadData.destination.companyName, boldFont, fontSize, margin + 40, yPos);
      }
      const destAddressLine = [
        loadData.destination?.street,
        loadData.destination?.city,
        loadData.destination?.state,
        loadData.destination?.zip,
      ].filter(Boolean).join(', ');
      yPos = drawTextLine(destAddressLine || 'N/A', font, fontSize, margin + 40, yPos);

      yPos = drawTextLine(`Cargo: ${loadData.cargoDescription || 'N/A'}`, font, fontSize, margin + 20, yPos);
      if (loadData.requiresTarping && loadData.tarpingFee) {
        yPos = drawTextLine(`Base Rate: $${((loadData.distance || 0) * (loadData.ratePerMile || 0)).toFixed(2)}`, font, fontSize, margin + 20, yPos);
        yPos = drawTextLine(`Tarping Fee: $${loadData.tarpingFee.toFixed(2)}`, font, fontSize, margin + 20, yPos);
      }
      yPos = drawTextLine(`Total Agreed Rate: $${loadData.totalAgreedRate.toFixed(2)}`, boldFont, fontSize, margin + 20, yPos);

      yPos -= sectionSpacing;

      // --- Terms & Conditions Section ---
      yPos = drawTextLine('Terms & Conditions:', boldFont, subTitleFontSize, margin, yPos);
      
      const terms = [
        { label: 'Cargo Damage:', text: 'Carrier is not liable for damage resulting from improper packaging or inherent vice of the cargo (e.g., 2 light poles). Claims must be noted on the BOL at time of delivery.' },
        { label: 'Payment Terms:', text: 'Payment is due upon delivery unless otherwise specified. A 1.5% late fee applies after 30 days.' },
        { label: 'Detention Policy:', text: 'Standard loading/unloading time is 2 hours. Detention will be billed at $75.00 per hour thereafter.' }
      ];

      for (const term of terms) {
        yPos = drawTextLine(term.label, boldFont, fontSize, margin + 20, yPos);
        const words = term.text.split(' ');
        let currentLine = '';
        const maxWidth = width - (margin * 2) - 40;
        
        for (const word of words) {
          const testLine = currentLine ? `${currentLine} ${word}` : word;
          const lineWidth = font.widthOfTextAtSize(testLine, fontSize);
          if (lineWidth > maxWidth) {
            yPos = drawTextLine(currentLine, font, fontSize, margin + 40, yPos);
            currentLine = word;
          } else {
            currentLine = testLine;
          }
        }
        yPos = drawTextLine(currentLine, font, fontSize, margin + 40, yPos);
        yPos -= 5;
      }
      
      yPos -= sectionSpacing;

      // Check if we need a new page for signature block
      if (yPos < 150) {
        page = pdfDoc.addPage([600, 850]);
        yPos = height - margin;
      }

      // --- Signature Block ---
      const sigColWidth = (width - (margin * 2)) / 2;
      
      // Carrier Column
      let sigY = yPos;
      sigY = drawTextLine('Carrier (Mock Carrier LLC):', boldFont, fontSize, margin, sigY);
      sigY -= 20;
      page.drawLine({ start: { x: margin, y: sigY }, end: { x: margin + sigColWidth - 20, y: sigY }, thickness: 1 });
      drawTextLine('Authorized Signature', font, 8, margin, sigY - 10);
      sigY -= 40;
      page.drawLine({ start: { x: margin, y: sigY }, end: { x: margin + sigColWidth - 20, y: sigY }, thickness: 1 });
      drawTextLine('Printed Name', font, 8, margin, sigY - 10);
      sigY -= 40;
      page.drawLine({ start: { x: margin, y: sigY }, end: { x: margin + sigColWidth - 20, y: sigY }, thickness: 1 });
      drawTextLine('Date', font, 8, margin, sigY - 10);

      // Customer Column
      sigY = yPos;
      sigY = drawTextLine('Customer:', boldFont, fontSize, margin + sigColWidth, sigY);
      sigY -= 20;
      page.drawLine({ start: { x: margin + sigColWidth, y: sigY }, end: { x: width - margin, y: sigY }, thickness: 1 });
      drawTextLine('Authorized Signature', font, 8, margin + sigColWidth, sigY - 10);
      sigY -= 40;
      page.drawLine({ start: { x: margin + sigColWidth, y: sigY }, end: { x: width - margin, y: sigY }, thickness: 1 });
      drawTextLine('Printed Name', font, 8, margin + sigColWidth, sigY - 10);
      sigY -= 40;
      page.drawLine({ start: { x: margin + sigColWidth, y: sigY }, end: { x: width - margin, y: sigY }, thickness: 1 });
      drawTextLine('Date', font, 8, margin + sigColWidth, sigY - 10);

      
      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `agreement-${loadData.loadNumber || loadData.id || 'newLoad'}.pdf`;
      link.click(); URL.revokeObjectURL(link.href);
      toast({ title: "Agreement Generated", description: "PDF has been downloaded." });
    } catch (error: any) {
      console.error('PDF generation error:', error);
      toast({ variant: "destructive", title: "PDF Error", description: "Could not generate service agreement." });
    } finally { setIsSubmitting(false); }
  };

  const generateInvoice = async (loadData: Load) => {
    if (!user || !ADMIN_ROLES.includes(user.role as any)) return;
    const client = clients.find(c => c.id === loadData.clientId);
    if (!client) {
        toast({ variant: "destructive", title: "Client Not Found", description: "Cannot generate invoice without client details." });
        return;
    }
    setIsSubmitting(true);
    try {
      const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
      const pdfDoc = await PDFDocument.create();
      let page = pdfDoc.addPage([600, 850]); 
      const { width, height } = page.getSize();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const fontSize = 10, titleFontSize = 24, subTitleFontSize = 12, lineSpacing = 15, sectionSpacing = 25, margin = 60;
      let yPos = height - margin - 10;


      const drawTextLine = (text: string, fontToUse: any, size: number, x: number, y: number, color = rgb(0,0,0)) => {
        page.drawText(text, { x, y, font: fontToUse, size, color });
        return y - size - 3; 
      };

      yPos = drawTextLine('INVOICE', boldFont, titleFontSize, margin, yPos);
      yPos = drawTextLine(`${settings.carrierName}`, boldFont, subTitleFontSize, margin, yPos - 5);
      yPos = drawTextLine(`${formatAddress(settings.carrierAddress)}`, font, fontSize, margin, yPos);
      
      const headerRightX = width - margin - 150;
      let headerRightY = height - margin;
      headerRightY = drawTextLine(`Invoice #: INV-${loadData.loadNumber || loadData.id?.substring(0,7)}`, boldFont, fontSize, headerRightX, headerRightY);
      headerRightY = drawTextLine(`Date: ${new Date().toLocaleDateString()}`, font, fontSize, headerRightX, headerRightY);
      headerRightY = drawTextLine(`Due: Upon Receipt`, boldFont, fontSize, headerRightX, headerRightY);

      yPos -= sectionSpacing * 2;
      
      const colWidth = (width - margin * 2) / 2;
      let billToY = yPos;
      billToY = drawTextLine('BILL TO:', boldFont, fontSize, margin, billToY);
      billToY = drawTextLine(`${client.companyName}`, font, fontSize, margin, billToY);
      billToY = drawTextLine(`${client.contactName}`, font, fontSize, margin, billToY);
      
      yPos -= sectionSpacing * 3;

      // Table Header
      page.drawRectangle({ x: margin, y: yPos, width: width - margin * 2, height: 20, color: rgb(0.95, 0.95, 0.95) });
      drawTextLine('DESCRIPTION', boldFont, 10, margin + 5, yPos + 5);
      drawTextLine('AMOUNT', boldFont, 10, width - margin - 60, yPos + 5);
      yPos -= 30;

      // Base Rate
      const baseRate = (loadData.distance || 0) * (loadData.ratePerMile || 0);
      drawTextLine(`Freight Charges: ${loadData.distance} miles @ $${loadData.ratePerMile.toFixed(2)}/mi`, font, fontSize, margin + 5, yPos);
      drawTextLine(`$${baseRate.toFixed(2)}`, font, fontSize, width - margin - 60, yPos);
      yPos -= lineSpacing;

      // Tarping
      if (loadData.requiresTarping && loadData.tarpingFee) {
        drawTextLine('Tarping Fee', font, fontSize, margin + 5, yPos);
        drawTextLine(`$${loadData.tarpingFee.toFixed(2)}`, font, fontSize, width - margin - 60, yPos);
        yPos -= lineSpacing;
      }

      if (loadData.signedBolUrl) {
        drawTextLine('Proof of Delivery (POD): Signed BOL on file and verified', font, 9, margin + 5, yPos, rgb(0.1, 0.4, 0.2));
        yPos -= lineSpacing;
      }

      yPos -= sectionSpacing;
      page.drawLine({ start: { x: width - margin - 150, y: yPos }, end: { x: width - margin, y: yPos }, thickness: 1 });
      yPos -= 20;
      drawTextLine('TOTAL DUE:', boldFont, 14, width - margin - 150, yPos);
      drawTextLine(`$${loadData.totalAgreedRate.toFixed(2)}`, boldFont, 14, width - margin - 80, yPos);

      yPos -= sectionSpacing * 2;
      drawTextLine('Payment Instructions:', boldFont, subTitleFontSize, margin, yPos);
      yPos -= lineSpacing;
      const paymentNote = settings.defaultSpecialTerms || "Please make payment via check or wire transfer. Late fees may apply.";
      
      const words = paymentNote.split(' ');
      let currentLine = '';
      const maxWidth = width - (margin * 2);
      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const lineWidth = font.widthOfTextAtSize(testLine, fontSize);
        if (lineWidth > maxWidth) {
          yPos = drawTextLine(currentLine, font, fontSize, margin, yPos);
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }
      drawTextLine(currentLine, font, fontSize, margin, yPos);

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `invoice-${loadData.loadNumber || loadData.id || 'newLoad'}.pdf`;
      link.click(); URL.revokeObjectURL(link.href);
      toast({ title: "Invoice Generated", description: "PDF has been downloaded." });
    } catch (error: any) {
      console.error('PDF generation error:', error);
      toast({ variant: "destructive", title: "PDF Error", description: "Could not generate invoice." });
    } finally { setIsSubmitting(false); }
  };


  const addTrip = async (tripData: Omit<Trip, 'id'>): Promise<Trip> => {
    setIsSubmitting(true);

    const tripDateStr = tripData.date || (tripData.name && tripData.name.match(/\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}/)?.[0]) || new Date().toISOString().split('T')[0];

    // Check if an existing open/active trip container matches selected truckId, trailerId, and date
    if (tripData.assignedTruckId && tripData.assignedTrailerId) {
      const existingMatch = trips.find(t => {
        if (t.status === 'completed') return false;
        const matchesTruck = t.assignedTruckId === tripData.assignedTruckId;
        const matchesTrailer = t.assignedTrailerId === tripData.assignedTrailerId;
        const tDateStr = t.date || (t.name && t.name.match(/\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}/)?.[0]);
        const matchesDate = !tDateStr || !tripDateStr || tDateStr === tripDateStr;
        return matchesTruck && matchesTrailer && matchesDate;
      });

      if (existingMatch) {
        setIsSubmitting(false);
        toast({
          title: 'Existing Container Reused',
          description: `Assigned to existing open container "${existingMatch.tripNumber || existingMatch.name}".`,
        });
        return existingMatch;
      }
    }

    // ── Trial / review mode — local-only ──────────────────────────────────────
    if (isTrialSession || (IS_ADMIN_REVIEW_MODE && user?.uid === mockReviewUser.uid)) {
      const tripNumber = formatTripNumber(trips.length + 1);
      const newTrip = { ...tripData, date: tripDateStr, tripNumber, id: `trip-${Date.now()}` } as Trip;
      setTrips(prev => [...prev, newTrip]);
      toast({ title: 'Trip Created', description: `Trip ${tripNumber} "${tripData.name}" created locally.` });
      setIsSubmitting(false);
      return newTrip;
    }

    if (!user) { setIsSubmitting(false); throw new Error('Not authenticated'); }

    // ── Production — check Firestore for existing open container matching truck, trailer, and date ──
    const tripsRef = collection(db, `users/${user.uid}/trips`);
    if (tripData.assignedTruckId && tripData.assignedTrailerId) {
      try {
        const openTripsQuery = query(
          tripsRef,
          where('assignedTruckId', '==', tripData.assignedTruckId),
          where('assignedTrailerId', '==', tripData.assignedTrailerId)
        );
        const openSnap = await getDocs(openTripsQuery);
        const matchedDoc = openSnap.docs.find(d => {
          const data = d.data() as Trip;
          if (data.status === 'completed') return false;
          const dDate = data.date || (data.name && data.name.match(/\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}/)?.[0]);
          return !dDate || !tripDateStr || dDate === tripDateStr;
        });

        if (matchedDoc) {
          const matchedTrip = { id: matchedDoc.id, ...matchedDoc.data() } as Trip;
          setTrips(prev => prev.some(t => t.id === matchedTrip.id) ? prev : [...prev, matchedTrip]);
          toast({
            title: 'Existing Container Reused',
            description: `Assigned to existing open container "${matchedTrip.tripNumber || matchedTrip.name}".`,
          });
          setIsSubmitting(false);
          return matchedTrip;
        }
      } catch (e) {
        console.warn('Error querying existing trips in Firestore:', e);
      }
    }

    // ── Derive sequential tripNumber then write to Firestore ─────
    let nextSeq = 1;
    try {
      const q = query(tripsRef, orderBy('tripNumber', 'desc'), limit(1));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const lastTrip = snap.docs[0].data() as Trip;
        const lastSeq = parseTripSeq(lastTrip.tripNumber || '');
        nextSeq = lastSeq != null ? lastSeq + 1 : (await getDocs(tripsRef)).size + 1;
      } else {
        nextSeq = (await getDocs(tripsRef)).size + 1;
      }
    } catch (e) {
      console.error('Error fetching last trip number, falling back to collection size:', e);
      nextSeq = trips.length + 1;
    }
    const tripNumber = formatTripNumber(nextSeq);

    // Strip undefined values before writing
    const safeTripData = sanitizeForFirestore({ ...tripData, date: tripDateStr, tripNumber }) as Omit<Trip, 'id'>;

    try {
      const docRef = await addDoc(tripsRef, safeTripData);
      const newTrip = { ...safeTripData, id: docRef.id } as Trip;
      // onSnapshot will update state; we also update locally for immediate feedback
      setTrips(prev => [...prev.filter(t => t.id !== docRef.id), newTrip]);
      toast({ title: 'Trip Created', description: `Trip ${tripNumber} "${tripData.name}" has been created.` });
      setIsSubmitting(false);
      return newTrip;
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error Creating Trip', description: error.message });
      setIsSubmitting(false);
      throw error;
    }
  };

  const updateTrip = async (id: string, updates: Partial<Trip>) => {
    // Check if assignedDriverId is being newly set or changed
    const currentTrip = trips.find(t => t.id === id);
    const newDriverId = updates.assignedDriverId;
    const isNewDriverAssignment = newDriverId && newDriverId !== currentTrip?.assignedDriverId;

    // Calculate and persist aggregate deck space and weight metrics on the Trip
    const effectiveTripLoads = loads.filter(l => l.tripId === id && l.status !== 'delivered');
    const effectiveTrailerId = updates.assignedTrailerId ?? currentTrip?.assignedTrailerId ?? effectiveTripLoads[0]?.assignedTrailerId;
    const effectiveTrailer = effectiveTrailerId ? vehicles.find(v => v.id === effectiveTrailerId) : undefined;
    const trailerLength = effectiveTrailer?.trailerLength ?? 40;
    const trailerMaxWeight = effectiveTrailer?.payloadCapacity || Math.max(0, (effectiveTrailer?.gvwr || 0) - (effectiveTrailer?.emptyWeight || 0));

    const usedDeckSpace = effectiveTripLoads.reduce((sum, l) => sum + (l.cargoLength || 0) * (l.cargoQuantity || 1), 0);
    const remainingDeckSpace = Math.max(0, trailerLength - usedDeckSpace);
    const usedWeight = effectiveTripLoads.reduce((sum, l) => sum + (l.cargoWeightNum || 0) * (l.cargoQuantity || 1), 0);
    const remainingPayload = Math.max(0, trailerMaxWeight - usedWeight);

    const mergedUpdates: Partial<Trip> = {
      ...updates,
      usedDeckSpace,
      remainingDeckSpace,
      usedWeight,
      remainingPayload,
    };

    // Update local state immediately for responsive UI
    setTrips(prev => prev.map(t => t.id === id ? { ...t, ...mergedUpdates } : t));

    // Persist to Firestore (best-effort for non-trial sessions)
    if (user && !isTrialSession && !(IS_ADMIN_REVIEW_MODE && user.uid === mockReviewUser.uid)) {
      const safe = sanitizeForFirestore(mergedUpdates);
      await updateDoc(doc(db, `users/${user.uid}/trips`, id), safe).catch(console.error);
    }
    toast({ title: 'Trip Updated', description: 'Trip information has been saved.' });

    // Sync driver staging location when a trip manifest completes
    if (updates.status === 'completed') {
      const tripLoads = loads.filter(l => l.tripId === id);
      const targetDriverId = updates.assignedDriverId || currentTrip?.assignedDriverId || tripLoads[0]?.assignedDriverId;
      if (targetDriverId) {
        const lastDelivered = tripLoads.find(l => l.status === 'delivered') || tripLoads[tripLoads.length - 1];
        if (lastDelivered) {
          const destObj = lastDelivered.destination;
          const destCity = (destObj?.city || '').trim();
          const destState = (destObj?.state || '').trim();
          const destString = destCity && destState ? `${destCity}, ${destState}` : (destCity || destState || '');
          if (destString) {
            updateDriverProfile(targetDriverId, {
              currentStaging: destString,
              lastLocationCity: destCity,
              lastLocationState: destState,
              availabilityStatus: 'Available',
            });
          }
        }
      }
    }

    // Auto-deduct HOS when assigned to a driver
    if (isNewDriverAssignment) {
      const targetDriver = driverProfiles.find(d => d.uid === newDriverId);
      if (targetDriver) {
        // Calculate total miles from loads associated with this trip
        const tripLoads = loads.filter(l => l.tripId === id);
        const totalTripMiles = tripLoads.reduce((sum, l) => sum + (l.distance || 0) + (l.deadheadMiles || 0), 0);
        const speed = (settings?.truckAverageSpeed && settings.truckAverageSpeed > 0) ? settings.truckAverageSpeed : 55;
        const estDriveHours = totalTripMiles > 0 ? totalTripMiles / speed : 0;

        if (estDriveHours > 0) {
          const currentHos = targetDriver.estimatedHosRemaining ?? 11.0;
          const newHos = Math.max(0, Math.round((currentHos - estDriveHours) * 10) / 10);
          updateDriverProfile(newDriverId, { estimatedHosRemaining: newHos });
          toast({
            title: 'HOS Adjusted',
            description: `Deducted ${estDriveHours.toFixed(1)} hrs from ${targetDriver.name}'s HOS. Remaining: ${newHos.toFixed(1)} hrs.`,
          });
        }
      }
    }
  };

  const handleDeleteTrip = async (id: string) => {
    setTrips(prev => prev.filter(t => t.id !== id));
    // Clear tripId on all loads that belonged to this trip
    setLoads(prev => prev.map(l => l.tripId === id ? { ...l, tripId: null as any } : l));
    if (user && !isTrialSession && !(IS_ADMIN_REVIEW_MODE && user.uid === mockReviewUser.uid)) {
      // Delete the trip document
      await deleteDoc(doc(db, `users/${user.uid}/trips`, id)).catch(console.error);
      // Best-effort: clear tripId on affected load documents
      const affected = loads.filter(l => l.tripId === id);
      await Promise.all(affected.map(l =>
        updateDoc(doc(db, `users/${user.uid}/loads`, l.id!), { tripId: deleteField() }).catch(console.error)
      ));
    }
    toast({ title: 'Trip Deleted', description: 'Trip has been removed.' });
  };


  const getFuelOptimizationProfit = () => {
    let totalBilledFuel = 0;
    let totalActualFuelCost = 0;
    // Include trips that have at least one odometer
    trips.filter(t => t.startOdometer).forEach(trip => {
      const tripLoads = loads.filter(l => l.tripId === trip.id);
      if (tripLoads.length === 0) return;

      const billedFuelForTrip = tripLoads.reduce((sum, load) => {
          const totalMiles = (load.distance || 0) + (load.deadheadMiles || 0);
          const estFuel = (totalMiles > 0 && settings.truckMpg > 0 && settings.defaultFuelCostPerGallon > 0)
            ? (totalMiles / settings.truckMpg) * settings.defaultFuelCostPerGallon : 0;
          return sum + estFuel;
      }, 0);

      // If we have endOdometer, use actual. Otherwise, optimization is 0 (projected actual = billed)
      let actualFuelCost = 0;
      if (trip.endOdometer && trip.endOdometer > trip.startOdometer) {
        const actualDistance = trip.endOdometer - trip.startOdometer;
        actualFuelCost = (actualDistance > 0 && settings.truckMpg > 0 && settings.defaultFuelCostPerGallon > 0)
          ? (actualDistance / settings.truckMpg) * settings.defaultFuelCostPerGallon : 0;
      } else {
        // Projected optimization if trip is active: show billed vs sum of individual (which is 0 optimization)
        // Or if the user hasn't finished, we don't show optimization yet.
        actualFuelCost = billedFuelForTrip; 
      }

      totalBilledFuel += billedFuelForTrip;
      totalActualFuelCost += actualFuelCost;
    });

    return totalBilledFuel - totalActualFuelCost;
  };

  const cleanObject = (obj: any) => {
    const newObj = { ...obj };
    Object.keys(newObj).forEach(key => {
      if (newObj[key] === undefined) {
        delete newObj[key];
      } else if (newObj[key] && typeof newObj[key] === 'object' && !Array.isArray(newObj[key])) {
        newObj[key] = cleanObject(newObj[key]);
      }
    });
    return newObj;
  };

  const addVehicle = async (vehicleData: Omit<Vehicle, 'id'>) => {
    setIsSubmitting(true);
    const vehicle = cleanObject(vehicleData);

    // Enforce Plan Limits on Trucks (Power Units)
    if (vehicle.type === 'truck') {
      const currentTrucks = vehicles.filter(v => v.type === 'truck').length;
      const check = canAddTruck(currentTrucks, subscriptionTier, settings?.extraTrucksCount || 0, trial.hasEvaluationAccess, isOwnerOrAdmin);
      if (!check.allowed) {
        setIsSubmitting(false);
        const errorMsg = check.reason || 'Starter plan is limited to 1 power unit (truck). Upgrade to Fleet Pro to add additional trucks.';
        toast({
          variant: "destructive",
          title: "Plan Limit Reached",
          description: errorMsg,
          duration: 7000,
        });
        throw new Error(errorMsg);
      }
    }

    if (isTrialSession || (IS_ADMIN_REVIEW_MODE && user?.uid === mockReviewUser.uid)) {
      setVehicles([...vehicles, { id: `mock-vehicle-${Date.now()}`, ...vehicle }]);
      toast({ title: "Vehicle Added", description: `${vehicle.name} registered locally.` });
    } else if (user) {
      try {
        const docRef = await addDoc(collection(db, `users/${user.uid}/vehicles`), vehicle);
        setVehicles([...vehicles, { id: docRef.id, ...vehicle }]);
        toast({ title: "Vehicle Added", description: `${vehicle.name} has been registered.` });
      } catch (error: any) {
        console.error("Error adding vehicle:", error);
        toast({ variant: "destructive", title: "Error", description: error.message || "Could not add vehicle." });
        setIsSubmitting(false);
        throw error;
      }
    }
    setIsSubmitting(false);
  };

  const updateVehicle = async (id: string, updateData: Partial<Vehicle>) => {
    setIsSubmitting(true);
    const updates = cleanObject(updateData);
    if (isTrialSession || (IS_ADMIN_REVIEW_MODE && user?.uid === mockReviewUser.uid)) {
      setVehicles(vehicles.map(v => v.id === id ? { ...v, ...updates } : v));
      toast({ title: "Trial/Review: Vehicle Updated", description: "Changes saved locally." });
    } else if (user) {
      try {
        await updateDoc(doc(db, `users/${user.uid}/vehicles`, id), updates);
        setVehicles(vehicles.map(v => v.id === id ? { ...v, ...updates } : v));
        toast({ title: "Vehicle Updated", description: "Changes have been saved." });
      } catch (error: any) {
        console.error("Error updating vehicle:", error);
        toast({ variant: "destructive", title: "Error", description: error.message || "Could not update vehicle." });
      }
    }
    setIsSubmitting(false);
  };

  const deleteVehicle = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this vehicle?")) return;
    setIsSubmitting(true);
    if (isTrialSession || (IS_ADMIN_REVIEW_MODE && user?.uid === mockReviewUser.uid)) {
      setVehicles(vehicles.filter(v => v.id !== id));
      toast({ title: "Trial/Review: Vehicle Deleted" });
    } else if (user) {
      try {
        await deleteDoc(doc(db, `users/${user.uid}/vehicles`, id));
        setVehicles(vehicles.filter(v => v.id !== id));
        toast({ title: "Vehicle Deleted" });
      } catch (error: any) {
        console.error("Error deleting vehicle:", error);
        toast({ variant: "destructive", title: "Error", description: error.message || "Could not delete vehicle." });
      }
    }
    setIsSubmitting(false);
  };

  const addDriverProfile = async (profile: DriverProfile) => {
    setIsSubmitting(true);
    // Enforce Plan Limits on Drivers
    const currentDrivers = driverProfiles.length;
    const check = canAddDriver(currentDrivers, subscriptionTier, isOwnerOrAdmin);
    if (!check.allowed) {
      setIsSubmitting(false);
      const errorMsg = check.reason || 'Starter plan includes 1 driver login. Please upgrade to Fleet Pro for unlimited driver accounts.';
      toast({
        variant: "destructive",
        title: "Plan Limit Reached",
        description: errorMsg,
        duration: 7000,
      });
      throw new Error(errorMsg);
    }

    const enrichedProfile: DriverProfile = {
      ...profile,
      estimatedHosRemaining: profile.estimatedHosRemaining ?? 11.0,
    };
    if (isTrialSession || (IS_ADMIN_REVIEW_MODE && user?.uid === mockReviewUser.uid)) {
      setDriverProfiles([...driverProfiles, enrichedProfile]);
      toast({ title: "Trial/Review: Driver Created", description: `${enrichedProfile.name} registered locally.` });
    } else if (user) {
      try {
        await setDoc(doc(db, `users/${user.uid}/driverProfiles`, enrichedProfile.uid), enrichedProfile);
        setDriverProfiles([...driverProfiles, enrichedProfile]);
        toast({ title: "Driver Profile Created", description: `${enrichedProfile.name} is now registered.` });
      } catch (error: any) {
        console.error("Error adding driver profile:", error);
        toast({ variant: "destructive", title: "Error", description: error.message || "Could not add driver profile." });
        setIsSubmitting(false);
        throw error;
      }
    }
    setIsSubmitting(false);
  };

  const updateDriverProfile = async (uid: string, updates: Partial<DriverProfile>) => {
    setIsSubmitting(true);
    if (isTrialSession || (IS_ADMIN_REVIEW_MODE && user?.uid === mockReviewUser.uid)) {
      setDriverProfiles(driverProfiles.map(p => (p.uid === uid || p.id === uid) ? { ...p, ...updates } : p));
      toast({ title: "Trial/Review: Driver Updated" });
    } else if (user) {
      try {
        // Firestore rejects `undefined` values — strip them out.
        // If an optional field (e.g. estimatedTripHours) was cleared, omit it entirely.
        const sanitized = Object.fromEntries(
          Object.entries(updates).filter(([, v]) => v !== undefined)
        );
        const ownerId = (user.role === 'driver' && driverOwnerId) ? driverOwnerId : user.uid;
        
        // 1. Scoped driver profile document
        await updateDoc(doc(db, `users/${ownerId}/driverProfiles`, uid), sanitized).catch(console.error);

        // 2. Target drivers/{driverId} document directly
        await updateDoc(doc(db, 'drivers', uid), sanitized).catch(() => {});

        setDriverProfiles(prev => prev.map(p => (p.uid === uid || p.id === uid) ? { ...p, ...updates } : p));
        toast({ title: "Driver Profile Updated" });
      } catch (error: any) {
        console.error("Error updating driver profile:", error);
        toast({ variant: "destructive", title: "Error", description: error.message || "Could not update driver profile." });
      }
    }
    setIsSubmitting(false);
  };

  const deleteDriverProfile = async (uid: string) => {
    if (!window.confirm("Are you sure you want to remove this driver profile?")) return;
    setIsSubmitting(true);
    if (isTrialSession || (IS_ADMIN_REVIEW_MODE && user?.uid === mockReviewUser.uid)) {
      setDriverProfiles(driverProfiles.filter(p => p.uid !== uid));
      toast({ title: "Trial/Review: Driver Removed" });
    } else if (user) {
      try {
        await deleteDoc(doc(db, `users/${user.uid}/driverProfiles`, uid));
        setDriverProfiles(driverProfiles.filter(p => p.uid !== uid));
        toast({ title: "Driver Profile Removed" });
      } catch (error: any) {
        console.error("Error removing driver profile:", error);
        toast({ variant: "destructive", title: "Error", description: error.message || "Could not remove driver profile." });
      }
    }
    setIsSubmitting(false);
  };



  // ── PROOF OF DELIVERY ──────────────────────────────────────────────────────────
  // Saves a signed e-POD to Firestore.
  // For admin users: writes to users/{adminUid}/pods/{loadId}
  // For driver users: writes to users/{driverOwnerId}/pods/{loadId}
  const savePOD = async (pod: import('@/types').ProofOfDelivery): Promise<void> => {
    if (isTrialSession || (IS_ADMIN_REVIEW_MODE && user?.uid === mockReviewUser.uid)) {
      // In review mode, just log — no Firestore write
      console.info('[Review Mode] POD saved (not persisted):', pod.loadId);
      return;
    }
    if (!user) throw new Error('Not authenticated');
    // Drivers write to their owning admin's pods sub-collection
    const ownerUid = user.role === 'driver' ? (driverOwnerId ?? user.uid) : user.uid;
    const podRef = doc(db, `users/${ownerUid}/pods`, pod.loadId);
    await setDoc(podRef, {
      ...pod,
      submittedByDriverId: user.uid,
      createdAt: serverTimestamp(),
    });
  };

  // ── IN-TRANSIT EXPENSE LOGGING ──────────────────────────────────────────
  // Writes an actual expense and receipt to users/{ownerUid}/loads/{loadId}/actualExpenses sub-collection.
  // Updates local state and syncs to parent load doc for instant reactivity.
  // loadId is nullable: downtime expenses (fuel, tires, oil, deadhead) have no load but are
  // always attached to a driverId / truckId / trailerId.
  const addActualExpense = async (
    loadId: string | null,
    expenseData: Omit<ActualExpense, 'id'>
  ): Promise<ActualExpense> => {
    setIsSubmitting(true);
    const ownerUid = user?.role === 'driver' ? (driverOwnerId ?? user.uid) : (user?.uid ?? '');

    // Resolve driver name + equipment
    let driverName = user?.displayName || user?.email || 'Driver';
    if (user?.role === 'driver' && user.uid) {
      const dp = driverProfiles.find(p => p.uid === user.uid);
      if (dp?.name) driverName = dp.name;
    }
    const resolvedDriverId = expenseData.driverId || user?.uid || '';
    const resolvedProfile = driverProfiles.find(p => p.uid === resolvedDriverId);
    const resolvedTruckId = expenseData.truckId ?? resolvedProfile?.assignedTruckId ?? null;
    const resolvedTrailerId = expenseData.trailerId ?? resolvedProfile?.assignedTrailerId ?? null;

    const cleanData: any = {
      loadId: loadId || null,
      driverId: resolvedDriverId,
      truckId: resolvedTruckId,
      trailerId: resolvedTrailerId,
      category: expenseData.category,
      amount: Number(expenseData.amount) || 0,
      receiptUrl: expenseData.receiptUrl || '',
      createdAt: expenseData.createdAt || new Date().toISOString(),
      receiptUploadedAt: expenseData.receiptUploadedAt || new Date().toISOString(),
      submittedByDriverId: user?.uid || '',
      submittedByDriverName: driverName,
    };
    if (expenseData.gallonsPurchased !== undefined && expenseData.gallonsPurchased !== null && !isNaN(Number(expenseData.gallonsPurchased))) {
      cleanData.gallonsPurchased = Number(expenseData.gallonsPurchased);
    }
    if (expenseData.notes) {
      cleanData.notes = expenseData.notes.trim();
    }

    if (!loadId) {
      // Downtime expense: stored at users/{ownerUid}/actualExpenses (no load association)
      if (isTrialSession || !user || (IS_ADMIN_REVIEW_MODE && user.uid === mockReviewUser.uid)) {
        const mockExp: ActualExpense = { id: `mock-exp-${Date.now()}`, ...cleanData };
        toast({ title: 'Expense Logged', description: `$${cleanData.amount.toFixed(2)} recorded for ${cleanData.category}.` });
        setIsSubmitting(false);
        return mockExp;
      }
      try {
        const docRef = await addDoc(collection(db, `users/${ownerUid}/actualExpenses`), sanitizeForFirestore(cleanData));
        toast({ title: 'Expense Logged', description: `$${cleanData.amount.toFixed(2)} recorded for ${cleanData.category}.` });
        return { id: docRef.id, ...cleanData } as ActualExpense;
      } catch (err: any) {
        console.error('Error adding downtime expense:', err);
        toast({ variant: 'destructive', title: 'Error Logging Expense', description: err.message || 'Failed to save expense.' });
        throw err;
      } finally {
        setIsSubmitting(false);
      }
    }

    if (isTrialSession || !user || (IS_ADMIN_REVIEW_MODE && user.uid === mockReviewUser.uid)) {
      const newExp: ActualExpense = { id: `mock-exp-${Date.now()}`, ...cleanData };
      setLoads(prev => prev.map(l => {
        if (l.id === loadId) {
          const existing = l.actualExpenses || [];
          return { ...l, actualExpenses: [...existing, newExp] };
        }
        return l;
      }));
      toast({ title: 'Expense Logged', description: `$${cleanData.amount.toFixed(2)} recorded for ${cleanData.category}.` });
      setIsSubmitting(false);
      return newExp;
    }

    try {
      const subcollRef = collection(db, `users/${ownerUid}/loads/${loadId}/actualExpenses`);
      const docRef = await addDoc(subcollRef, sanitizeForFirestore(cleanData));
      const newExp: ActualExpense = { id: docRef.id, ...cleanData };

      // Also sync array to parent load document in Firestore for instant query & offline cache
      const loadRef = doc(db, `users/${ownerUid}/loads`, loadId);
      await updateDoc(loadRef, {
        actualExpenses: arrayUnion(sanitizeForFirestore(newExp)),
      }).catch(e => console.warn('Could not arrayUnion to load doc:', e));

      // Update in local React state
      setLoads(prev => prev.map(l => {
        if (l.id === loadId) {
          const existing = (l.actualExpenses || []).filter(e => e.id !== docRef.id);
          return { ...l, actualExpenses: [...existing, newExp] };
        }
        return l;
      }));

      toast({ title: 'Expense Logged', description: `$${cleanData.amount.toFixed(2)} recorded for ${cleanData.category}.` });
      setIsSubmitting(false);
      return newExp;
    } catch (err: any) {
      console.error('Error adding actual expense:', err);
      toast({ variant: 'destructive', title: 'Error Logging Expense', description: err.message || 'Failed to save expense.' });
      setIsSubmitting(false);
      throw err;
    }
  };

  const fetchActualExpenses = async (loadId: string): Promise<ActualExpense[]> => {
    if (!user) return [];
    const ownerUid = user.role === 'driver' ? (driverOwnerId ?? user.uid) : user.uid;
    if (isTrialSession || (IS_ADMIN_REVIEW_MODE && user.uid === mockReviewUser.uid)) {
      const l = loads.find(x => x.id === loadId);
      return l?.actualExpenses || [];
    }
    try {
      const subcollRef = collection(db, `users/${ownerUid}/loads/${loadId}/actualExpenses`);
      const snap = await getDocs(subcollRef);
      const fetched: ActualExpense[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as ActualExpense));
      setLoads(prev => prev.map(l => l.id === loadId ? { ...l, actualExpenses: fetched } : l));
      return fetched;
    } catch (err) {
      console.warn(`Error querying actualExpenses sub-collection for load ${loadId}:`, err);
      const l = loads.find(x => x.id === loadId);
      return l?.actualExpenses || [];
    }
  };

  // ── CREATE DRIVER ACCOUNT ──────────────────────────────────────────────────────
  // Creates a Firebase Auth user for a driver WITHOUT displacing the admin session,
  // by using a secondary (temporary) Firebase app instance.
  // Then writes:
  //   - users/{driverUid}/profile/main   → { role: 'driver', driverOwnerId: adminUid }
  //   - users/{adminUid}/driverProfiles/{driverUid} → the DriverProfile document
  // Secure Admin SDK API driver creation flow:
  // Calls /api/create-driver which uses firebase-admin to create user with random password,
  // sets role: 'driver', writes the driver profile to Firestore, and generates a password reset link.
  const createDriverAccount = async (
    driverEmail: string,
    driverPassword?: string,
    driverProfileData?: DriverProfile,
  ): Promise<
    | {
        uid: string;
        authUid?: string;
        loginEmail?: string;
        tempPassword?: string;
        driverAccessToken?: string;
        driverPortalUrl?: string;
        loginUrl?: string;
        passwordResetLink?: string;
        emailSent?: boolean;
        smsShareUrl?: string | null;
        smsBody?: string;
        profile?: DriverProfile;
      }
    | { code: string; message: string }
  > => {
    if (!user || (user.role !== 'admin' && user.role !== 'owner' && user.role !== 'company_admin')) {
      return { code: 'permission-denied', message: 'Only company admins can create driver accounts.' };
    }

    // Enforce Plan Limits on Drivers
    const currentDrivers = driverProfiles.length;
    const driverCheck = canAddDriver(currentDrivers, subscriptionTier, isOwnerOrAdmin);
    if (!driverCheck.allowed) {
      const errorMsg = driverCheck.reason || 'Starter plan includes 1 driver login. Please upgrade to Fleet Pro for unlimited driver accounts.';
      toast({
        variant: "destructive",
        title: "Plan Limit Reached",
        description: errorMsg,
        duration: 7000,
      });
      return { code: 'plan-limit-exceeded', message: errorMsg };
    }
    const adminUid = user.uid;
    const cleanEmail = (driverEmail || driverProfileData?.email || '').trim().toLowerCase();
    const cleanPhone = (driverProfileData?.phone || '').trim();
    const driverName = driverProfileData?.name || (cleanEmail ? cleanEmail.split('@')[0] : 'Fleet Driver');

    try {
      const idToken = authUser ? await authUser.getIdToken().catch(() => '') : '';
      const res = await fetch('/api/create-driver', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({
          email: cleanEmail,
          phone: cleanPhone,
          password: driverPassword,
          name: driverName,
          adminUid,
          driverUid: driverProfileData?.uid,
          companyName: settings?.carrierName || user.carrierLegalName || 'PayloadLogic Fleet',
          driverProfileData,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to create driver account.');
      }

      const newDriverUid = data.uid;
      const fullProfile: DriverProfile = {
        ...(driverProfileData || {}),
        ...(data.profile || {}),
        uid: newDriverUid,
        authUid: data.authUid,
        email: cleanEmail || data.loginEmail || '',
        loginEmail: data.loginEmail,
        tempPassword: data.tempPassword,
        driverAccessToken: data.driverAccessToken,
        driverPortalUrl: data.driverPortalUrl,
        driverAccountCreated: true,
        name: driverName,
        status: driverProfileData?.status || 'active',
        cdlStatus: driverProfileData?.cdlStatus || 'Non-CDL',
      };

      // Also persist directly via client Firestore SDK so owner's real-time roster updates immediately even if local dev has no service account
      try {
        await setDoc(doc(db, `users/${adminUid}/driverProfiles`, newDriverUid), sanitizeForFirestore(fullProfile), { merge: true });
      } catch (clientWriteErr) {
        console.warn('Non-fatal client-side driverProfile write notice:', clientWriteErr);
      }

      // Update local state
      setDriverProfiles(prev => [...prev.filter(p => p.uid !== newDriverUid), fullProfile]);
      toast({
        title: 'Limited Driver View Account Created',
        description: cleanEmail
          ? `Driver View login created for ${fullProfile.name} (${data.loginEmail}).`
          : `Driver View login & magic link created for ${fullProfile.name}.`,
      });

      return {
        uid: newDriverUid,
        authUid: data.authUid,
        loginEmail: data.loginEmail,
        tempPassword: data.tempPassword,
        driverAccessToken: data.driverAccessToken,
        driverPortalUrl: data.driverPortalUrl,
        loginUrl: data.loginUrl,
        passwordResetLink: data.passwordResetLink,
        emailSent: data.emailSent,
        smsShareUrl: data.smsShareUrl,
        smsBody: data.smsBody,
        profile: fullProfile,
      };
    } catch (error: any) {
      console.error('Error creating driver account via API:', error);
      return { code: error?.code ?? 'creation-error', message: error?.message ?? 'Failed to create driver account.' };
    }
  };

  const activateOwnerRole = async () => {
    if (!user) {
      toast({ variant: 'destructive', title: 'Sign-in Required', description: 'Please sign in first before activating owner bypass.' });
      return;
    }
    setIsSubmitting(true);
    try {
      const profileRef = doc(db, `users/${user.uid}/profile/main`);
      const rootUserRef = doc(db, `users/${user.uid}`);
      const settingsRef = doc(db, `users/${user.uid}/settings`, SETTINGS_DOC_ID);
      const updates = {
        role: 'owner' as const,
        isOwner: true,
        isAdmin: true,
        isBypassActive: true,
        subscriptionTier: 'fleetPro' as const,
        dotVerificationStatus: 'valid_verified' as const,
        dotVerificationTimestamp: new Date().toISOString(),
        carrierLegalName: user.carrierLegalName || 'Owner Fleet Operations',
      };
      await Promise.all([
        setDoc(profileRef, updates, { merge: true }),
        setDoc(rootUserRef, updates, { merge: true }),
        setDoc(settingsRef, { subscriptionTier: 'fleetPro' }, { merge: true }),
      ]);
      setUser(prev => prev ? ({ ...prev, ...updates, role: 'owner' }) : null);
      toast({
        title: "Owner Bypass Active",
        description: "Your account has been granted permanent owner status (Fleet Pro, unlimited fleet, zero cost, USDOT exempt).",
      });
    } catch (err: any) {
      console.error("Error activating owner role:", err);
      toast({ variant: 'destructive', title: 'Activation Failed', description: err.message || 'Could not update role in Firestore.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const value: AppContextType = {
    user, isOwnerOrAdmin, activateOwnerRole, driverOwnerId, appDisplayState,
    isLoading, setIsLoading, initializationError,
    isTrialSession,
    currentTime,
    activeTab,
    setActiveTab,
    goBackInApp,
    viewClientRequestId,
    setViewClientRequestId,
    onboardingStep, setOnboardingStep,
    email, setEmail, password, setPassword, handleSignUp, handleSignIn, handleSignOut, handleStartTrial, continueToDashboard,
    isSubmitting, setIsSubmitting, loads, expenses, clients, isClientsLoading, settings, clientLoadRequests, vehicles, driverProfiles,
    financialProfile, isFinancialProfileComplete, saveFinancialProfile,
    hasActiveTruck, hasActiveDriver, hasTargetDailyProfit, fleetSubTab, setFleetSubTab, settingsSubTab, setSettingsSubTab, saveTargetDailyProfit,
    isFleetFinancialModalOpen, setIsFleetFinancialModalOpen, isFleetSetupUserOpened, openFleetFinancialSetup,
    subscriptionTier, chosenTier, trial, planLimits, billingInterval, setSubscriptionTier, approveExtraTruck,
    isHelpOpen, setIsHelpOpen, activeHelpTopic, openHelpTopic,
    settingsForm, setSettingsForm, updateSettings,
    clientForm, setClientForm, addClient, updateClient, deleteClient,
    expenseForm, setExpenseForm, addExpense,
    loadForm, setLoadForm, editingLoadId, setEditingLoadId, handleSaveLoad, updateLoad, handleDeleteLoad,
    handleStartEditLoad, handleCancelEditLoad, approveClientLoadRequest, rejectClientLoadRequest, generateAgreement, generateInvoice,
    updateLoadPhaseWithLocation, reportDriverException, updateDriverNote,
    trips, addTrip, updateTrip, handleDeleteTrip, getFuelOptimizationProfit,
    addVehicle, updateVehicle, deleteVehicle, addDriverProfile, updateDriverProfile, deleteDriverProfile,
    calculateVehicleCPM, archiveVehicleCPM,
    previewRole, setPreviewRole,
    savePOD, createDriverAccount,
    addActualExpense, fetchActualExpenses,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = (): AppContextType => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
