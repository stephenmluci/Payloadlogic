
import React, { useEffect } from 'react'; // Import useEffect
import type { Expense, Load, Settings } from '@/types'; // Import Settings
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CalendarDays, Tag, DollarSign, Link2 } from 'lucide-react';

type ExpenseFormProps = {
  expenseForm: Omit<Expense, 'id'>;
  setExpenseForm: React.Dispatch<React.SetStateAction<Omit<Expense, 'id'>>>;
  loads: Load[];
  settings: Settings; // Add settings prop
  onSubmit: (e: React.FormEvent) => void;
  isSubmitting?: boolean;
};

const NO_LOAD_VALUE = "_NO_LOAD_SELECTED_";

export function ExpenseForm({ expenseForm, setExpenseForm, loads, settings, onSubmit, isSubmitting }: ExpenseFormProps) {
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type } = e.target;
    setExpenseForm(prev => ({ ...prev, [name]: type === 'number' ? Number(value) : value }));
  };

  const handleLoadIdChange = (selectedValue: string) => {
    setExpenseForm(prev => ({
      ...prev,
      loadId: selectedValue === NO_LOAD_VALUE ? '' : selectedValue
    }));
  };

  useEffect(() => {
    if (expenseForm.category.toLowerCase() === 'payroll' && expenseForm.loadId && expenseForm.loadId !== NO_LOAD_VALUE) {
      const selectedLoad = loads.find(load => load.id === expenseForm.loadId);
      if (selectedLoad && settings.payrollPercentage > 0) {
        const calculatedPayroll = (selectedLoad.totalAgreedRate * settings.payrollPercentage) / 100;
        // Only update if the amount is not already set or differs significantly, to avoid feedback loops if user manually changes it.
        // Or simply always set it if category is payroll & load is selected.
        // For simplicity, we'll set it. The user can then override if they wish.
        if (expenseForm.amount !== calculatedPayroll) {
           setExpenseForm(prev => ({ ...prev, amount: parseFloat(calculatedPayroll.toFixed(2)) }));
        }
      }
    }
  }, [expenseForm.category, expenseForm.loadId, loads, settings, setExpenseForm, expenseForm.amount]);


  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="text-2xl font-headline">Add New Expense</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label htmlFor="date">Date</Label>
              <div className="relative">
                <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  id="date"
                  name="date"
                  type="date"
                  value={expenseForm.date}
                  onChange={handleInputChange}
                  className="pl-10"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="category">Category</Label>
              <div className="relative">
                <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  id="category"
                  name="category"
                  value={expenseForm.category}
                  onChange={handleInputChange}
                  placeholder="e.g., Fuel, Maintenance, Payroll"
                  className="pl-10"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label htmlFor="amount">Amount ($)</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  id="amount"
                  name="amount"
                  type="number"
                  step="0.01"
                  value={expenseForm.amount}
                  onChange={handleInputChange}
                  placeholder="e.g., 150.75"
                  className="pl-10"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="loadId">Associated Load (Optional)</Label>
               <div className="relative">
                <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground z-10" />
                <Select
                  value={expenseForm.loadId || NO_LOAD_VALUE} 
                  onValueChange={handleLoadIdChange}
                >
                  <SelectTrigger id="loadId" className="pl-10">
                    <SelectValue placeholder="Select a load" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_LOAD_VALUE}>None</SelectItem>
                    {loads.map(load => (
                      <SelectItem key={load.id} value={load.id!}>
                        {load.loadNumber ? `${load.loadNumber}: ` : ''}{load.origin} → {load.destination}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <Button type="submit" className="w-full sm:w-auto" disabled={isSubmitting}>
            {isSubmitting ? 'Adding Expense...' : 'Add Expense'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
