
import React from 'react';
import { ExpenseForm } from './ExpenseForm';
import { ExpensesTable } from './ExpensesTable';
import { useApp } from '@/context/AppContext';

export function ExpensesPage() {
  const { 
    expenses, 
    loads, 
    settings,
    expenseForm, 
    setExpenseForm, 
    addExpense,
    isSubmitting: isSubmittingExpense
  } = useApp();

  const handleExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await addExpense();
  };

  const sortedExpenses = [...expenses].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="p-4 md:p-6 space-y-8">
      <div>
        <h1 className="text-3xl font-bold font-headline mb-2">Expense Tracking</h1>
        <p className="text-muted-foreground">Log and monitor all your operational expenses.</p>
      </div>
      
      <ExpenseForm 
        expenseForm={expenseForm}
        setExpenseForm={setExpenseForm}
        loads={loads}
        settings={settings}
        onSubmit={handleExpenseSubmit}
        isSubmitting={isSubmittingExpense}
      />
      
      <div className="mt-10">
        <h2 className="text-2xl font-semibold font-headline mb-4">Expense History</h2>
        <ExpensesTable expenses={sortedExpenses} loads={loads} />
      </div>
    </div>
  );
}
