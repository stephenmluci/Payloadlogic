
import React from 'react';
import type { RecurringExpenseItem } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Percent, Droplet, Repeat, Trash2, PlusCircle, Save, Building2, Hash, User, Phone, Mail, Fuel, FileText, DollarSign, Gauge, GaugeCircle, Truck, Tag, Ruler, Weight, ArrowUpFromLine } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useApp } from '@/context/AppContext';

export function SettingsPage() {
  const {
    settingsForm,
    setSettingsForm,
    updateSettings,
    isSubmitting: isSavingSettings,
  } = useApp();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    const requiredNumericFields = ['payrollPercentage', 'defaultFuelCostPerGallon', 'defCostPerGallon', 'truckMpg', 'truckAverageSpeed'];
    const optionalNumericFields = ['loadingFee', 'detentionFeeRate'];

    if (requiredNumericFields.includes(name)) {
      setSettingsForm(prev => ({ ...prev, [name]: value === '' ? 0 : Number(value) }));
    } else if (optionalNumericFields.includes(name)) {
      setSettingsForm(prev => ({ ...prev, [name]: value === '' ? undefined : Number(value) }));
    } else {
      setSettingsForm(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleRadioChange = (value: string) => {
    setSettingsForm(prev => ({...prev, trailerHitchType: value as 'gooseneck' | 'fifth-wheel' | ''}));
  }

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
      [field]: field === 'amount' ? (value === '' ? 0 : Number(value)) : value
    };
    setSettingsForm(prev => ({ ...prev, recurringExpenses: updatedExpenses }));
  };

  const removeRecurringExpense = (index: number) => {
    setSettingsForm(prev => ({
      ...prev,
      recurringExpenses: prev.recurringExpenses.filter((_, i) => i !== index)
    }));
  };

  return (
    <div className="p-4 md:p-6 space-y-8">
      <div>
        <h1 className="text-3xl font-bold font-headline mb-2">System Settings</h1>
        <p className="text-muted-foreground">Configure default operational parameters for your business.</p>
      </div>

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl font-headline">Business Configuration</CardTitle>
          <CardDescription>Set operational defaults, truck info, carrier information, contract terms, and recurring expenses.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold mb-3">Operational Defaults</h3>
            <div className="space-y-4">
              <div>
                <Label htmlFor="payrollPercentage">Payroll Percentage (%)</Label>
                <div className="relative">
                  <Percent className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input id="payrollPercentage" name="payrollPercentage" type="number" value={settingsForm.payrollPercentage} onChange={handleInputChange} className="pl-10" />
                </div>
              </div>
              <div>
                <Label htmlFor="defaultFuelCostPerGallon">Default Fuel Cost per Gallon ($)</Label>
                <div className="relative">
                  <Fuel className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input id="defaultFuelCostPerGallon" name="defaultFuelCostPerGallon" type="number" step="0.01" value={settingsForm.defaultFuelCostPerGallon} onChange={handleInputChange} className="pl-10" />
                </div>
              </div>
              <div>
                <Label htmlFor="defCostPerGallon">DEF Cost per Gallon ($)</Label>
                <div className="relative">
                  <Droplet className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input id="defCostPerGallon" name="defCostPerGallon" type="number" step="0.01" value={settingsForm.defCostPerGallon} onChange={handleInputChange} className="pl-10" />
                </div>
              </div>
            </div>
          </div>
          <Separator />
          <div>
            <h3 className="text-lg font-semibold mb-3 flex items-center"><Truck className="h-5 w-5 mr-2 text-primary" /> Truck Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label htmlFor="truckMpg">Miles per Gallon (MPG)</Label>
                <div className="relative">
                  <Gauge className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input id="truckMpg" name="truckMpg" type="number" step="0.1" value={settingsForm.truckMpg} onChange={handleInputChange} className="pl-10" placeholder="e.g., 6.5" />
                </div>
              </div>
              <div>
                <Label htmlFor="truckAverageSpeed">Average Speed (mph)</Label>
                <div className="relative">
                  <GaugeCircle className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input id="truckAverageSpeed" name="truckAverageSpeed" type="number" step="1" value={settingsForm.truckAverageSpeed} onChange={handleInputChange} className="pl-10" placeholder="e.g., 60" />
                </div>
              </div>
            </div>
          </div>
          <Separator />
          <div>
            <h3 className="text-lg font-semibold mb-3 flex items-center"><Truck className="h-5 w-5 mr-2 text-primary" /> Trailer Information</h3>
            <div className="space-y-4">
              <div>
                <Label>Hitch Type</Label>
                <RadioGroup value={settingsForm.trailerHitchType} onValueChange={handleRadioChange} className="flex items-center space-x-4 pt-2">
                  <div className="flex items-center space-x-2"><RadioGroupItem value="gooseneck" id="gooseneck" /><Label htmlFor="gooseneck">Gooseneck</Label></div>
                  <div className="flex items-center space-x-2"><RadioGroupItem value="fifth-wheel" id="fifth-wheel" /><Label htmlFor="fifth-wheel">Fifth Wheel</Label></div>
                </RadioGroup>
              </div>
              <div>
                <Label htmlFor="trailerDeckHeight">Deck Height</Label>
                <div className="relative">
                  <ArrowUpFromLine className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input id="trailerDeckHeight" name="trailerDeckHeight" value={settingsForm.trailerDeckHeight || ''} onChange={handleInputChange} placeholder="e.g., 34 in" className="pl-10" />
                </div>
              </div>
              <div>
                <Label htmlFor="trailerType">Trailer Type</Label>
                <div className="relative">
                  <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input id="trailerType" name="trailerType" value={settingsForm.trailerType || ''} onChange={handleInputChange} placeholder="e.g., Flatbed, Car Hauler, Step Deck" className="pl-10" />
                </div>
              </div>
              <div>
                <Label htmlFor="trailerDimensions">Trailer Dimensions (e.g., L x W)</Label>
                <div className="relative">
                  <Ruler className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input id="trailerDimensions" name="trailerDimensions" value={settingsForm.trailerDimensions || ''} onChange={handleInputChange} placeholder="e.g., 48ft L x 8.5ft W or 53ft L" className="pl-10" />
                </div>
              </div>
              <div>
                <Label htmlFor="trailerWeightCapacity">Trailer Weight Capacity (e.g., lbs or kg)</Label>
                <div className="relative">
                  <Weight className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input id="trailerWeightCapacity" name="trailerWeightCapacity" value={settingsForm.trailerWeightCapacity || ''} onChange={handleInputChange} placeholder="e.g., 48000 lbs" className="pl-10" />
                </div>
              </div>
            </div>
          </div>
          <Separator />
          <div>
            <h3 className="text-lg font-semibold mb-3 flex items-center"><Building2 className="h-5 w-5 mr-2 text-primary" /> Carrier Information</h3>
            <div className="space-y-4">
              <div><Label htmlFor="carrierName">Carrier Name</Label><Input id="carrierName" name="carrierName" value={settingsForm.carrierName || ''} onChange={handleInputChange} placeholder="Your Company Name" /></div>
              <div><Label htmlFor="carrierAddress">Carrier Address</Label><Input id="carrierAddress" name="carrierAddress" value={settingsForm.carrierAddress || ''} onChange={handleInputChange} placeholder="123 Trucking Way, City, State ZIP" /></div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div><Label htmlFor="carrierDotNumber">DOT Number</Label><div className="relative"><Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" /><Input id="carrierDotNumber" name="carrierDotNumber" value={settingsForm.carrierDotNumber || ''} onChange={handleInputChange} className="pl-10" placeholder="e.g., 1234567" /></div></div>
                <div><Label htmlFor="carrierMcNumber">MC Number</Label><div className="relative"><Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" /><Input id="carrierMcNumber" name="carrierMcNumber" value={settingsForm.carrierMcNumber || ''} onChange={handleInputChange} className="pl-10" placeholder="e.g., 987654" /></div></div>
              </div>
              <h4 className="text-md font-medium pt-2">Carrier Contact</h4>
              <div><Label htmlFor="carrierContactName">Contact Full Name</Label><div className="relative"><User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" /><Input id="carrierContactName" name="carrierContactName" value={settingsForm.carrierContactName || ''} onChange={handleInputChange} className="pl-10" placeholder="e.g., John Doe" /></div></div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div><Label htmlFor="carrierContactPhone">Contact Phone</Label><div className="relative"><Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" /><Input id="carrierContactPhone" name="carrierContactPhone" type="tel" value={settingsForm.carrierContactPhone || ''} onChange={handleInputChange} className="pl-10" placeholder="e.g., (555) 123-4567" /></div></div>
                <div><Label htmlFor="carrierContactEmail">Contact Email</Label><div className="relative"><Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" /><Input id="carrierContactEmail" name="carrierContactEmail" type="email" value={settingsForm.carrierContactEmail || ''} onChange={handleInputChange} className="pl-10" placeholder="e.g., contact@example.com" /></div></div>
              </div>
            </div>
          </div>
          <Separator />
          <div>
            <h3 className="text-lg font-semibold mb-3 flex items-center"><FileText className="h-5 w-5 mr-2 text-primary" /> Contract Defaults</h3>
            <div className="space-y-4">
              <div>
                <Label htmlFor="loadingFee">Default Loading/Unloading Fee ($) (Optional)</Label>
                <div className="relative"><DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" /><Input id="loadingFee" name="loadingFee" type="number" step="0.01" value={settingsForm.loadingFee === undefined ? '' : settingsForm.loadingFee} onChange={handleInputChange} placeholder="e.g., 50.00" className="pl-10" /></div>
              </div>
              <div>
                <Label htmlFor="detentionFeeRate">Default Detention Fee Rate ($/hr) (Optional)</Label>
                <div className="relative"><DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" /><Input id="detentionFeeRate" name="detentionFeeRate" type="number" step="0.01" value={settingsForm.detentionFeeRate === undefined ? '' : settingsForm.detentionFeeRate} onChange={handleInputChange} placeholder="e.g., 75.00" className="pl-10" /></div>
              </div>
              <div><Label htmlFor="defaultSpecialTerms">Default Special Terms for Contracts</Label><Textarea id="defaultSpecialTerms" name="defaultSpecialTerms" value={settingsForm.defaultSpecialTerms || ''} onChange={handleInputChange} placeholder="Enter standard terms and conditions that apply to most contracts..." rows={4} /></div>
            </div>
          </div>
          <Separator />
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold flex items-center"><Repeat className="h-5 w-5 mr-2 text-primary" /> Recurring Expenses</h3>
              <Button variant="outline" size="sm" onClick={addRecurringExpense}><PlusCircle className="h-4 w-4 mr-2" /> Add Expense</Button>
            </div>
            <div className="space-y-3">
              {settingsForm.recurringExpenses.map((expense, index) => (
                <div key={index} className="flex items-center space-x-2 p-3 bg-muted/30 rounded-md">
                  <Input value={expense.name} onChange={(e) => updateRecurringExpense(index, 'name', e.target.value)} placeholder="Expense name (e.g., Insurance)" className="flex-grow" />
                  <Input type="number" value={expense.amount} onChange={(e) => updateRecurringExpense(index, 'amount', e.target.value)} placeholder="Amount" className="w-32" />
                  <Button variant="ghost" size="icon" onClick={() => removeRecurringExpense(index)} aria-label="Remove expense"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              ))}
              {settingsForm.recurringExpenses.length === 0 && (<p className="text-sm text-muted-foreground text-center py-2">No recurring expenses added yet.</p>)}
            </div>
          </div>
        </CardContent>
        <CardFooter className="border-t pt-6">
          <Button onClick={updateSettings} className="w-full sm:w-auto" disabled={isSavingSettings}>
            <Save className="h-4 w-4 mr-2" />
            {isSavingSettings ? 'Saving...' : 'Save All Settings'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
