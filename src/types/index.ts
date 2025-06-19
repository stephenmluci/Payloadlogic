
import type { User as FirebaseUser } from 'firebase/auth';
import type { Timestamp } from 'firebase/firestore';

export type Load = {
  id?: string;
  loadNumber?: string;
  clientId: string;
  origin: string;
  destination: string;
  pickupDateTime: string; // ISO string for date and time
  deliveryDateTime: string; // ISO string for date and time
  ratePerMile: number;
  distance: number;
  totalAgreedRate: number; // Calculated: distance * ratePerMile
  status: 'pending' | 'in-transit' | 'delivered' | 'client-request-approved';
  expenses: {
    payroll: number;
    fuel: number;
    def: number;
    recurring: number;
    calculated: boolean;
  };
  cargoDescription?: string;
  specialTerms?: string;
  originalClientRequestId?: string;
  requestedByClientName?: string; // Name of the person who requested, if from client portal
  requestedByAuthUid?: string; // Auth UID of the client user who requested
};

export type Expense = {
  id?: string;
  date: string; // ISO string
  category: string;
  amount: number;
  loadId?: string;
};

export type Client = {
  id?: string;
  companyName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  address?: string;
};

export type RecurringExpenseItem = {
  name: string;
  amount: number;
};

export type Settings = {
  payrollPercentage: number;
  defaultFuelCostPerGallon: number;
  defCostPerGallon: number;
  truckMpg: number; // Added
  truckAverageSpeed: number; // Added
  recurringExpenses: RecurringExpenseItem[];
  carrierName: string;
  carrierAddress: string;
  carrierDotNumber: string;
  carrierMcNumber: string;
  carrierContactName: string;
  carrierContactPhone: string;
  carrierContactEmail: string;
  loadingFee?: number;
  detentionFeeRate?: number;
  defaultSpecialTerms?: string;
};

export type User = FirebaseUser & {
  role?: 'admin' | 'client';
};

export type UserProfile = {
  role: 'admin' | 'client';
};

export type ClientLoadRequest = {
  id?: string;
  origin: string;
  destination: string;
  cargoDescription: string;
  requestedPickupDate: string; // ISO Date string (YYYY-MM-DD from client input)
  requestedByClientUid: string;
  requestedByClientName: string | null;
  submissionTimestamp: Timestamp;
  status: 'new' | 'viewed' | 'accepted' | 'rejected';
  createdLoadId?: string;
};

