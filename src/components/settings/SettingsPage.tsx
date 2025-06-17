import React from 'react';
import type { Settings, RecurringExpenseItem } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Percent, Droplet, Repeat, Trash2, PlusCircle, Save } from 'lucide-react';

type SettingsPageProps = {
  settingsForm: Settings;
  setSettingsForm: React.Dispatch<React.SetStateAction<Settings>>;
  updateSettings: () => Promise<void>;
  isSavingSettings?: boolean;
};

export function SettingsPage({ settingsForm, setSettingsForm, updateSettings, isSavingSettings }: SettingsPageProps) {
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setSettingsForm(prev => ({ ...prev, [name]: Number(value) }));
  };

  const addRecurringExpense = () => {
    setSettingsForm(prev => ({
      ...prev,
      recurringExpenses: [...prev.recurringExpenses, { name: '', amount: 0 }]
    }));
  };

  const updateRecurringExpense = (index: number, field: keyof RecurringExpenseItem, value: string | number) => {
    const updatedExpenses = [...settingsForm.recurringExpenses];
    updatedExpenses[index] = { 
      ...updatedExpenses[index], 
      [field]: field === 'amount' ? Number(value) : value 
    };
    setSettingsForm(prev => ({ ...prev, recurringExpenses: updatedExpenses }));
  };

  const removeRecurringExpense = (index: number) => {
    setSettingsForm(prev => ({
      ...prev,
      recurringExpenses: prev.recurringExpenses.filter((_, i) => i !== index)
    }));
  };

  const handleSaveSettings = async () => {
    await updateSettings();
  };

  return (
    <div className="p-4 md:p-6 space-y-8">
      <div>
        <h1 className="text-3xl font-bold font-headline mb-2">System Settings</h1>
        <p className="text-muted-foreground">Configure default operational parameters for your business.</p>
      </div>
      
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl font-headline">Operational Defaults</CardTitle>
          <CardDescription>Set percentages, costs, and recurring expenses.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <Label htmlFor="payrollPercentage">Payroll Percentage (%)</Label>
            <div className="relative">
              <Percent className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input 
                id="payrollPercentage"
                name="payrollPercentage"
                type="number"
                value={settingsForm.payrollPercentage} 
                onChange={handleInputChange}
                className="pl-10"
              />
            </div>
          </div>
          
          <div>
            <Label htmlFor="defCostPerGallon">DEF Cost per Gallon ($)</Label>
            <div className="relative">
              <Droplet className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input 
                id="defCostPerGallon"
                name="defCostPerGallon"
                type="number"
                step="0.01"
                value={settingsForm.defCostPerGallon} 
                onChange={handleInputChange}
                className="pl-10"
              />
            </div>
          </div>
          
          <Separator />

          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold flex items-center">
                <Repeat className="h-5 w-5 mr-2 text-primary" /> Recurring Expenses
              </h3>
              <Button variant="outline" size="sm" onClick={addRecurringExpense}>
                <PlusCircle className="h-4 w-4 mr-2" /> Add Expense
              </Button>
            </div>
            
            <div className="space-y-3">
              {settingsForm.recurringExpenses.map((expense, index) => (
                <div key={index} className="flex items-center space-x-2 p-3 bg-muted/30 rounded-md">
                  <Input 
                    value={expense.name} 
                    onChange={(e) => updateRecurringExpense(index, 'name', e.target.value)} 
                    placeholder="Expense name (e.g., Insurance)" 
                    className="flex-grow"
                  />
                  <Input 
                    type="number"
                    value={expense.amount} 
                    onChange={(e) => updateRecurringExpense(index, 'amount', e.target.value)} 
                    placeholder="Amount" 
                    className="w-32"
                  />
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => removeRecurringExpense(index)}
                    aria-label="Remove expense"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
              {settingsForm.recurringExpenses.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-2">No recurring expenses added yet.</p>
              )}
            </div>
          </div>
        </CardContent>
        <CardFooter className="border-t pt-6">
          <Button onClick={handleSaveSettings} className="w-full sm:w-auto" disabled={isSavingSettings}>
            <Save className="h-4 w-4 mr-2" />
            {isSavingSettings ? 'Saving...' : 'Save Settings'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
