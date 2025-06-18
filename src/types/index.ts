
import type { User as FirebaseUser } from 'firebase/auth';
import type { Timestamp } from 'firebase/firestore';

export type Load = {
  id?: string;
  loadNumber?: string; // Added for unique load identifier
  clientId: string; // Refers to Client.id (the company client)
  origin: string;
  destination: string;
  rate: number;
  distance: number;
  status: 'pending' | 'in-transit' | 'delivered' | 'client-request-approved';
  expenses: {
    payroll: number;
    fuel: number;
    def: number;
    recurring: number;
    calculated: boolean;
  };
  cargoDescription?: string;
  requestedPickupDate?: string; // Should be ISO date string
  specialTerms?: string;
  originalClientRequestId?: string;
  requestedByClientName?: string;
  requestedByAuthUid?: string;
};

export type Expense = {
  id?: string;
  date: string; // ISO string
  category: string;
  amount: number;
  loadId?: string;
};

export type Client = { // This is the trucking company's client (e.g., Acme Corp)
  id?: string;
  name: string;
  contact: string;
};

export type RecurringExpenseItem = {
  name: string;
  amount: number;
};

export type Settings = {
  payrollPercentage: number;
  defaultFuelCostPerGallon: number;
  defCostPerGallon: number;
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
  requestedPickupDate: string; // ISO Date string
  requestedByClientUid: string;
  requestedByClientName: string | null;
  submissionTimestamp: Timestamp;
  status: 'new' | 'viewed' | 'accepted' | 'rejected';
  createdLoadId?: string;
};
