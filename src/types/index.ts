
import type { User as FirebaseUser } from 'firebase/auth';
import type { Timestamp } from 'firebase/firestore';

export type Load = {
  id?: string;
  clientId: string; // Refers to Client.id (the company client)
  origin: string;
  destination: string;
  rate: number;
  distance: number;
  status: 'pending' | 'in-transit' | 'delivered' | 'client-request-approved'; // Added new status
  expenses: {
    payroll: number;
    fuel: number;
    def: number;
    recurring: number;
    calculated: boolean;
  };
  cargoDescription?: string;
  requestedPickupDate?: string; // Should be ISO date string
  specialTerms?: string; // Added for more detailed contracts
  // Fields related to original client request if this load was created from one
  originalClientRequestId?: string;
  requestedByClientName?: string; // Name of the client user who submitted
  requestedByAuthUid?: string; // Auth UID of the client user
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
  // Potentially link to a Firebase Auth UID if this client company has a primary portal user
  // authUid?: string;
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
  loadingFee?: number; // Optional: for contracts
  detentionFeeRate?: number; // Optional: for contracts, per hour
  defaultSpecialTerms?: string; // Optional: default terms for contracts
};

// Represents the authenticated user, potentially with an app-specific role
export type User = FirebaseUser & {
  role?: 'admin' | 'client'; // Application-specific role
};

// Separate UserProfile stored in Firestore, e.g., /users/{uid}/profile
export type UserProfile = {
  role: 'admin' | 'client';
  // other profile fields if needed
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
  // Optional: link to the Load document created by admin
  createdLoadId?: string;
};
