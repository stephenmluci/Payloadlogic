import type { User as FirebaseUser } from 'firebase/auth';

export type Load = {
  id?: string;
  clientId: string;
  origin: string;
  destination: string;
  rate: number;
  distance: number;
  status: 'pending' | 'in-transit' | 'delivered';
  expenses: {
    payroll: number;
    fuel: number;
    def: number;
    recurring: number;
    calculated: boolean;
  };
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
  name: string;
  contact: string;
};

export type RecurringExpenseItem = {
  name: string;
  amount: number;
};

export type Settings = {
  payrollPercentage: number;
  defCostPerGallon: number;
  recurringExpenses: RecurringExpenseItem[];
};

export type User = FirebaseUser;
