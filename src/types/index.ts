
import type { User as FirebaseUser } from 'firebase/auth';
import type { Timestamp, FieldValue } from 'firebase/firestore';

export type Address = {
  /** Business / company name at this address (e.g. "Mercedes-Benz of Morgantown"). */
  companyName?: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  contactName?: string;
  contactPhone?: string;
  lat?: number;
  lng?: number;
};


/** One stop in a multi-leg trip manifest (pickup or dropoff). */
export type RouteLeg = {
  type: 'pickup' | 'dropoff';
  location: string;
  loadId: string;
  isDeadhead?: boolean;
  label?: string;
};

export type Trip = {
  id: string;
  name: string;
  /** Auto-generated manifest identifier, e.g. "TRIP-2026-8942" */
  tripNumber?: string;
  /** Direct driver assignment on the trip level */
  assignedDriverId?: string;
  loadIds: string[];
  startOdometer: number;
  endOdometer?: number;
  actualFuelCost?: number;
  assignedTruckId?: string;
  assignedTrailerId?: string;
  status: 'planned' | 'active' | 'completed';
  /** Date of trip run (ISO or YYYY-MM-DD) */
  date?: string;
  /** Sum of linear feet consumed by all assigned loads */
  usedDeckSpace?: number;
  /** Trailer deck length minus usedDeckSpace */
  remainingDeckSpace?: number;
  /** Total cargo weight assigned to trip in lbs */
  usedWeight?: number;
  /** Trailer max payload minus usedWeight in lbs */
  remainingPayload?: number;
};


export type Load = {

  id?: string;
  loadNumber?: string;
  clientId: string;
  clientName?: string;
  companyName?: string;
  origin: Address;
  destination: Address;
  originLat?: number;
  originLng?: number;
  destinationLat?: number;
  destinationLng?: number;

  pickupDateTime: string; // ISO string for date and time
  deliveryDateTime: string; // ISO string for date and time
  ratePerMile: number;
  distance: number;
  deadheadMiles: number;
  tripId?: string; // Link to a Trip
  totalAgreedRate: number; // Calculated: (distance * ratePerMile) + (tarpingFee || 0)

  status:
    | 'pending_approval'
    | 'approved'
    | 'pending'
    | 'client-request-approved'
    | 'dispatched'
    | 'Deadheading'
    | 'arrived-origin'
    | 'loading'
    | 'in-transit'
    | 'arrived-destination'
    | 'unloading'
    | 'delivered'
    // Legacy / alias variants for backwards compatibility
    | 'arrived'
    | 'Arrived'
    | 'waiting'
    | 'on-break'
    | 'idle';
  expenses: {
    payroll: number;
    fuel: number;
    def: number;
    recurring: number;
    maintenance?: number;
    calculated: boolean;
  };

  cargoDescription?: string;
  cargoLength?: number; // In feet
  cargoWidth?: number;  // In feet
  cargoHeight?: number; // In feet
  cargoWeightNum?: number; // In lbs
  cargoQuantity?: number; // Number of units (e.g., pallets)
  placementMode?: 'standard' | 'stacked' | 'nested';
  linkedLoadId?: string;
  cargoDimensions?: string; // Legacy e.g., "10ft L x 8ft W x 6ft H"
  cargoWeight?: string; // Legacy e.g., "5000 lbs"
  isLtl?: boolean; // Less-Than-Truckload / Partial freight flag
  isPartialLoad?: boolean; // Alias for LTL / partial load
  isPartialLTL?: boolean; // Explicit LTL / partial freight distribution toggle flag
  deckPercentageUsed?: number; // Estimated or overridden percentage of deck space used (1-100)
  specialTerms?: string;
  requiresTarping?: boolean;
  tarpingFee?: number;
  originalClientRequestId?: string;
  requestedByClientName?: string | null; // Name of the person who requested, if from client portal
  requestedByClientEmail?: string | null; // Email of the client / broker contact
  requestedByAuthUid?: string | null; // Auth UID of the client user who requested
  /** BOL Source configuration: 'broker' = Broker Provided (External), 'system' = System Generated (Internal) */
  bolSource?: 'broker' | 'system';
  /** URL of the outbound active BOL document (uploaded broker PDF/image or generated internal PDF) for transit */
  outboundBolUrl?: string;
  /** File name or display title of the outbound active BOL document */
  outboundBolFileName?: string;
  /** ISO timestamp when the outbound BOL was uploaded or generated */
  outboundBolGeneratedAt?: string;
  estimatedDriveTimeHours?: number; // Calculated: distance / truckAverageSpeed
  tripDuration?: number; // Manual override for duration in days
  assignedTruckId?: string;
  assignedTrailerId?: string;
  assignedDriverId?: string;
  assignedDriverName?: string;
  driverId?: string;
  driverName?: string;
  driverPhase?: 'Enroute to Pickup' | 'Arrived' | 'Getting Loaded' | 'Enroute to Destination' | 'Getting Unloaded' | 'Complete';
  /** Exact ISO local timestamp when status was transitioned to 'Arrived' for detention pay calculations */
  arrivedAt?: string | null;
  /** Alias for arrivedAt / arrival timestamp */
  arrivalTimestamp?: string | null;
  /** Exact ISO timestamp when drop-off was completed and marked Delivered */
  deliveredAt?: string | null;
  /** Administrative paperwork status: 'pending_pod' (awaiting signed BOL) or 'pod_uploaded' (ready for invoicing) */
  paperworkStatus?: 'pending_pod' | 'pod_uploaded' | 'invoiced' | 'closed';
  /** Whether the facility detention clock is currently active */
  detentionActive?: boolean;
  /** ISO timestamp when a dispatcher manually overrode or advanced status, locking out math regressions */
  manualOverrideAt?: string;
  /** Download URL of the signed Bill of Lading (BOL / POD) uploaded to Cloud Storage */
  signedBolUrl?: string;
  /** ISO timestamp when the signed BOL was uploaded */
  signedBolUploadedAt?: string;
  /** Exception flag set by the driver independently of phase */
  driverExceptionFlag?: 'Mechanical Issue' | 'Health / Medical' | 'DOT Break / Rest' | 'Weather / Traffic' | null;
  /** Latest short note from the driver, attached to a phase update or exception report */
  driverNote?: string;
  /** ISO timestamp of the last driver note or exception update */
  driverNoteUpdatedAt?: string;
  /** Driver assignment acceptance status in restricted Driver View */
  driverAcceptedStatus?: 'pending' | 'accepted' | 'declined';
  driverAcceptedAt?: string;
  driverDeclinedAt?: string;
  driverDeclineReason?: string;
  /** In-transit actual expenses logged by driver or admin with receipts, stored in sub-collection actualExpenses */
  actualExpenses?: ActualExpense[];
};

export type ActualExpenseCategory = 'Fuel' | 'DEF' | 'Maintenance/Repair' | 'Parts' | 'Tow/Recovery' | 'Tire Repair' | 'Oil Change' | 'Deadhead' | 'Tolls' | 'Scale Ticket' | 'Other';

export interface ActualExpense {
  id?: string;
  /** Optional: downtime / non-load expenses have no associated load. */
  loadId?: string | null;
  /** Always attached: the driver, truck and trailer the expense belongs to. */
  driverId?: string;
  truckId?: string | null;
  trailerId?: string | null;
  category: ActualExpenseCategory;
  amount: number;
  gallonsPurchased?: number;
  notes?: string;
  receiptUrl?: string;
  receiptUploadedAt?: string;
  submittedByDriverId?: string;
  submittedByDriverName?: string;
  createdAt: string;
}

export type Expense = {
  id?: string;
  date: string; // ISO string
  category: string;
  amount: number;
  loadId?: string;
  truckId?: string;
  trailerId?: string;
  notes?: string;
};

export type Client = {
  id?: string;
  companyName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  address?: Address;
  isPinned?: boolean;
};

export type AppNotification = {
  id: string;
  driverId: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string; // ISO string
  loadId?: string;
};

export type RecurringExpenseItem = {
  id?: string;
  name: string;
  amount: number;
  category?: string; // Optional grouping label for fleet-overhead items (e.g., 'Facility & Base', 'Tech & Comms')
};

export type Settings = {
  payrollPercentage: number;
  /** Target net business profit per operational day per truck (used in rate calculator). Default: $300. */
  targetDailyBusinessProfit?: number;
  /** Company default driver pay model — overridden per driver profile. */
  defaultDriverPayType?: 'percentage' | 'per-mile' | 'hourly';
  /** Default driver hourly rate when defaultDriverPayType is 'hourly'. */
  defaultDriverHourlyRate?: number;
  defaultFuelCostPerGallon: number;
  defCostPerGallon: number;
  truckMpg: number;
  truckAverageSpeed: number;
  recurringExpenses: RecurringExpenseItem[];
  recurringExpensesLastUpdated?: string;
  carrierName: string;
  carrierAddress: Address;

  carrierDotNumber: string;
  carrierMcNumber: string;
  carrierContactName: string;
  carrierContactPhone: string;
  carrierContactEmail: string;
  dotVerificationStatus?: 'valid_verified' | 'valid_unverified' | 'invalid' | 'blocked_trial_used';
  dotVerificationTimestamp?: string;
  carrierLegalName?: string;
  carrierDbaName?: string;
  carrierOperatingStatus?: string;
  carrierCity?: string;
  carrierState?: string;
  loadingFee?: number;


  detentionFeeRate?: number;
  defaultSpecialTerms?: string;
  trailerType: string;
  trailerDimensions: string;
  trailerWeightCapacity: string;
  trailerHitchType: 'gooseneck' | 'fifth-wheel' | '';
  trailerDeckHeight: string;
  maxWeightCapacity?: number;
  maxLengthCapacity?: number;
  defaultOperatingCostPerMile: number;
  cargoSafetyBuffer?: number;
  CARGO_SAFETY_BUFFER?: number;
  monthlyMaintenance?: number;
  subscriptionTier?: 'starter' | 'fleetPro';
  extraTrucksCount?: number;
  /** Billing period of the current plan. Absent = monthly (all pre-existing accounts). */
  billingInterval?: 'monthly' | 'sixMonth' | 'annual';
};

export type Vehicle = {
  id: string;
  unitNumber: string; // e.g. "101"
  name: string; // e.g. "Main Truck"
  type: 'truck' | 'trailer';

  make?: string;
  model?: string;
  year?: number;
  vin?: string;
  isPaidOff: boolean;
  recurringExpenses: RecurringExpenseItem[];
  assignedDriverId?: string;
  mpg?: number;
  gvwr?: number; // Structural GVWR (lbs) — door-sticker value; unrestricted user entry (Class 3–8+)

  maxTongueWeightCapacity?: number; // Max hitch / gooseneck tongue load the truck can accept (lbs)
  emptyWeight?: number; // Empty Weight (lbs)
  payloadCapacity?: number; // Max Cargo Weight (lbs)
  deckHeight?: number; // Deck Height from Ground (inches)
  trailerLength?: number; // Deck Length (ft)
  trailerWidth?: number; // Deck Width (ft)
  axleConfiguration?: string;
  averageSpeed?: number;
  monthlyFixedCosts?: RecurringExpenseItem[];
  monthlyRecurringExpenses?: {
    insurance: number;
    payment: number;
    maintenanceFund: number;
  };
  eldCostPerMonth?: number;       // ELD device / per-truck telematics subscription ($/mo)
  operatingCostPerMile?: number;
  estimatedMonthlyMiles?: number;
  avgFuelPrice?: number;
  avgDefCostPerGallon?: number; // DEF cost per gallon; used with DEF_RATIO (2.5%) for dynamic DEF calc
  monthlyVariableCosts?: {
    fuel: number;
    maintenance: number;
    tolls: number;
  };
  cpmHistory?: {
    month: string; // "YYYY-MM"
    cpm: number;
    totalMiles: number;
    totalCosts: number;
  }[];
};

export type DriverStatus = 'active' | 'on-leave' | 'terminated' | 'off-duty' | 'Off Duty';

export type DriverProfile = {
  id?: string;
  uid: string;
  name: string;
  email: string;
  phone: string;
  cdlExpirationDate: string;
  medicalCardExpirationDate: string;
  assignedTruckId?: string;
  assignedTrailerId?: string;
  status: DriverStatus;
  /** Federal licensing class — defaults to 'Non-CDL' when unset */
  cdlStatus?: 'Class A CDL' | 'Non-CDL';
  payrollPercentage?: number;
  payPercentageOfGross?: number;
  idNumber?: string;
  description?: string;
  payType?: 'percentage' | 'per-mile' | 'hourly';
  payRate?: number;
  /** Estimated hours per trip — used for hourly pay model calculation */
  estimatedTripHours?: number;
  availabilityStatus?: 'Available' | 'In Transit' | 'Off Duty' | 'Active - Stacking Available';
  currentTripId?: string;
  currentStaging?: string;
  lastLocationCity?: string;
  lastLocationState?: string;
  lastCompletionTimestamp?: string;
  currentLat?: number;
  currentLng?: number;
  /** Live driver GPS and route telemetry */
  telemetry?: {
    status?: 'Deadheading' | 'In Transit' | 'Arrived' | 'Unloading' | 'Available' | 'Off Duty' | string;
    speed?: number;
    lat?: number;
    lng?: number;
    heading?: number;
    updatedAt?: string;
  };
  /** Estimated Hours of Service remaining (defaults to 11.0 daily drive limit) */
  estimatedHosRemaining?: number;
  /** Firebase Cloud Messaging device push token */
  fcmToken?: string;
  /** Web Push API standard browser subscription for lock-screen popups */
  webPushSubscription?: any;
  /** Driver Self-Onboarding Status */
  onboardingStatus?: 'pending' | 'completed' | 'expired';
  onboardingToken?: string;
  onboardingSentAt?: string;
  onboardingExpiresAt?: string;
  onboardingCompletedAt?: string;
  onboardingLink?: string;
  /** Additional driver self-onboarding details */
  cdlNumber?: string;
  licenseIssuingState?: string;
  endorsements?: string[];
  additionalEndorsements?: string;
  licenseFrontUrl?: string;
  licenseFrontName?: string;
  licenseBackUrl?: string;
  licenseBackName?: string;
  medicalCardUrl?: string;
  medicalCardName?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelationship?: string;
  homeAddress?: string;
  homeCity?: string;
  homeState?: string;
  homeZip?: string;
  driverNotes?: string;
  /** Limited Driver View Account credentials & portal access */
  authUid?: string;
  loginEmail?: string;
  tempPassword?: string;
  driverAccessToken?: string;
  driverPortalUrl?: string;
  driverAccountCreated?: boolean;
  driverAccountCreatedAt?: string;
};

export function isDriverOffDuty(driver?: Partial<DriverProfile> | null): boolean {
  if (!driver) return false;
  return (
    driver.status === 'off-duty' ||
    driver.status === 'Off Duty' ||
    driver.availabilityStatus === 'Off Duty'
  );
}




export type FinancialProfile = {
  monthlyTruckPayment?: number;
  insurancePremiums?: number;
  targetDriverCPM?: number;
  targetProfitMargin?: number;
  targetDailyBusinessProfit?: number;
  estimatedMonthlyMiles?: number;
  fuelCostPerGallon?: number;
  maintenanceCostPerMile?: number;
  isCompleted?: boolean;
  updatedAt?: string;
};

export type User = FirebaseUser & {
  role?: 'admin' | 'client' | 'driver' | 'owner' | 'company_admin';
  isOwner?: boolean;
  isAdmin?: boolean;
  isBypassActive?: boolean;
  driverProfileId?: string;
  /** UID of the company/admin account that owns this driver's Firestore data. Set only when role === 'driver'. */
  driverOwnerId?: string;
  clientId?: string;
  companyName?: string;
  usdotNumber?: string;
  mcNumber?: string;
  fmcsaCredential?: string;
  dotVerificationStatus?: 'valid_verified' | 'valid_unverified' | 'invalid' | 'blocked_trial_used';
  dotVerificationTimestamp?: string;
  carrierLegalName?: string;
  carrierDbaName?: string;
  carrierOperatingStatus?: string;
  carrierCity?: string;
  carrierState?: string;
  financial_profile?: FinancialProfile;
  subscriptionTier?: 'starter' | 'fleetPro';
};

export type UserProfile = {
  role: 'owner' | 'driver' | 'client' | 'company_admin' | 'admin';
  isOwner?: boolean;
  isAdmin?: boolean;
  isBypassActive?: boolean;
  displayName?: string;
  driverProfileId?: string; // Link to DriverProfile if role is driver
  /** UID of the admin/owner account that this driver belongs to. Required when role === 'driver'. */
  driverOwnerId?: string;
  clientId?: string;
  companyName?: string;
  usdotNumber?: string;
  mcNumber?: string;
  fmcsaCredential?: string;
  dotVerificationStatus?: 'valid_verified' | 'valid_unverified' | 'invalid' | 'blocked_trial_used';
  dotVerificationTimestamp?: string;
  carrierLegalName?: string;
  carrierDbaName?: string;
  carrierOperatingStatus?: string;
  carrierCity?: string;
  carrierState?: string;
  financial_profile?: FinancialProfile;
  subscriptionTier?: 'starter' | 'fleetPro';
};

/**
 * A financial-field-redacted view of a Load document, safe to expose to driver accounts.
 * Strips ratePerMile, totalAgreedRate, expenses, and broker payment amounts.
 * Drivers should only receive this subset — never the raw Load document.
 */
export type DriverSafeLoad = Omit<Load, 'ratePerMile' | 'totalAgreedRate' | 'expenses'>;


export type ClientLoadRequest = {
  id?: string;
  clientId: string;
  companyName?: string;
  clientEmail?: string;
  origin: Address;
  destination: Address;
  cargoDescription: string;
  cargoQuantity?: number;
  cargoWeightNum?: number;
  cargoLength?: number;
  cargoWidth?: number;
  cargoHeight?: number;
  placementMode?: 'standard' | 'stacked' | 'nested';
  requestedPickupDateTime: string; 
  requestedDeliveryDateTime: string; 
  requestContactName: string;
  requestContactEmail: string;
  requestContactPhone: string;
  requestedByClientUid: string; 
  requestedByClientName: string | null; 
  submissionTimestamp: Timestamp | FieldValue;
  status: 'new' | 'in_review' | 'viewed' | 'accepted' | 'rejected';
  createdLoadId?: string;
  rejectionReason?: string;
};

export type ClientRequest = ClientLoadRequest;

/* ─────────────────────────────────────────────────────────────────────────────
   PROOF OF DELIVERY (e-POD)
   Stored at: users/{uid}/pods/{loadId}
   Created when a driver submits delivery confirmation via EpodModal.
───────────────────────────────────────────────────────────────────────────── */
export type ProofOfDelivery = {
  loadId: string;
  loadNumber?: string;
  /** Name of the person who accepted delivery */
  receivedBy: string;
  /** ISO timestamp of the delivery confirmation */
  deliveredAt: string;
  /** Condition notes entered at delivery (e.g. "minor surface scratch on panel 3") */
  conditionNotes: string;
  /** Canvas-captured signature as a PNG data URL (base64) */
  signatureDataUrl: string;
  /** Optional delivery photo as a data URL (base64, captured via camera or file upload) */
  photoDataUrl?: string;
  /** Download URL of the signed BOL / POD document in Cloud Storage */
  signedBolUrl?: string;
  /** GPS coordinates at time of delivery, if geolocation was available */
  gpsLat?: number;
  gpsLng?: number;
  /** UID of the driver who submitted the POD */
  submittedByDriverId?: string;
  submittedByDriverName?: string;
  /** Firestore server timestamp of when the POD was written */
  createdAt?: Timestamp | FieldValue;
};

/* ─────────────────────────────────────────────────────────────────────────────
   DECK SEQUENCING — LIFO (Last-In, First-Out)
   Used by TripBuilderPanel and DriverDashboard to display deck stack order.
   lifoPosition: 1 = first-off the trailer (top of stack / delivered last in trip),
                 N = last-off (bottom of stack / delivered first in trip).
───────────────────────────────────────────────────────────────────────────── */
export type DeckPosition = {
  loadId: string;
  /** 1-based index: 1 = top of deck (first delivery), N = bottom (last delivery) */
  deckOrder: number;
  /** Distance to this load's delivery destination (used for LIFO sort) */
  deliveryDistance: number;
  /** True if this is the bottom load — it was loaded first, delivered last */
  isBottomLoad: boolean;
  /** True if this is the top load — it was loaded last, delivered first */
  isTopLoad: boolean;
};

