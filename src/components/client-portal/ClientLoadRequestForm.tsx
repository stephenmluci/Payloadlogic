'use client';
import React from 'react';
import type { ClientLoadRequest, Address } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CalendarClock, Package, FileText, User, Mail, Phone, MapPin, CalendarDays, Send, Building2, Weight, Ruler, Hash } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AddressFields } from '../common/AddressFields';
import { DispatcherDateTimePicker } from '../common/DispatcherDateTimePicker';
import { sanitizePhoneDigits, handlePhonePaste } from '@/lib/utils';

type ClientLoadRequestFormProps = {
  requestForm: Omit<ClientLoadRequest, 'id' | 'requestedByClientUid' | 'requestedByClientName' | 'submissionTimestamp' | 'status'>;
  setRequestForm: React.Dispatch<React.SetStateAction<Omit<ClientLoadRequest, 'id' | 'requestedByClientUid' | 'requestedByClientName' | 'submissionTimestamp' | 'status'>>>;
  onSubmit: (e: React.FormEvent) => void;
  isSubmitting?: boolean;
};

export function ClientLoadRequestForm({ requestForm, setRequestForm, onSubmit, isSubmitting }: ClientLoadRequestFormProps) {
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    if (name === 'requestContactPhone') {
      const cleanValue = sanitizePhoneDigits(value);
      setRequestForm(prev => ({ ...prev, [name]: cleanValue }));
      return;
    }
    if (type === 'number') {
      const parsed = value === '' ? undefined : parseFloat(value);
      setRequestForm(prev => ({ ...prev, [name]: parsed }));
      return;
    }
    setRequestForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setRequestForm(prev => ({ ...prev, [name]: value }));
  };

  const handleAddressChange = (type: 'origin' | 'destination', field: keyof Address, value: string) => {
    setRequestForm(prev => ({
      ...prev,
      [type]: {
        ...(prev[type] as Address || { street: '', city: '', state: '', zip: '' }),
        [field]: value
      }
    }));
  };

  const currentDateTimeLocal = new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);

  const totalWeight = ((requestForm.cargoWeightNum || 0) * (requestForm.cargoQuantity || 1));

  return (
    <form onSubmit={onSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <AddressFields 
              label="Origin (Pickup)"
              address={requestForm.origin as Address}
              onChange={(field, value) => handleAddressChange('origin', field, value)}
              required
            />
            <AddressFields 
              label="Destination (Delivery)"
              address={requestForm.destination as Address}
              onChange={(field, value) => handleAddressChange('destination', field, value)}
              required
            />
          </div>

      {/* ── Freight & Cargo Specifications ── */}
      <div className="space-y-4 border rounded-xl p-4 bg-slate-50/50">
        <div className="flex items-center gap-2 border-b pb-3">
          <Package className="h-5 w-5 text-primary" />
          <div>
            <h3 className="text-base font-semibold text-foreground">Freight &amp; Cargo Specifications</h3>
            <p className="text-xs text-muted-foreground">Provide physical dimensions and weight so dispatch can assign appropriate trailer space.</p>
          </div>
        </div>

        {/* Commodity / Freight Description */}
        <div>
          <Label htmlFor="cargoDescription">Commodity / Freight Description</Label>
          <div className="relative mt-1">
            <Package className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
            <Textarea
              id="cargoDescription"
              name="cargoDescription"
              value={requestForm.cargoDescription}
              onChange={handleInputChange}
              placeholder="e.g., Structural steel beams, crated machinery, commercial HVAC units"
              className="pl-10 min-h-[85px] bg-white"
              required
            />
          </div>
        </div>

        {/* Weight & Quantity */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="cargoQuantity">Quantity / Units</Label>
            <div className="relative mt-1">
              <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="cargoQuantity"
                name="cargoQuantity"
                type="number"
                min="1"
                step="1"
                value={requestForm.cargoQuantity ?? 1}
                onChange={handleInputChange}
                placeholder="e.g., 1"
                className="pl-9 bg-white"
                required
              />
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">Number of distinct units/pieces.</p>
          </div>

          <div>
            <Label htmlFor="cargoWeightNum">Unit Weight (lbs)</Label>
            <div className="relative mt-1">
              <Weight className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="cargoWeightNum"
                name="cargoWeightNum"
                type="number"
                min="0"
                step="1"
                value={requestForm.cargoWeightNum !== undefined ? requestForm.cargoWeightNum : ''}
                onChange={handleInputChange}
                placeholder="e.g., 4500"
                className="pl-9 bg-white"
                required
              />
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">Weight per individual unit.</p>
          </div>

          <div className="bg-white border rounded-lg p-3 flex flex-col justify-center">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total Cargo Weight</span>
            <span className="text-lg font-black text-slate-800">
              {totalWeight.toLocaleString()} <span className="text-sm font-semibold text-slate-500">lbs</span>
            </span>
            {totalWeight > 10000 && (
              <span className="text-[10px] font-semibold text-amber-600 mt-0.5">Heavy freight payload</span>
            )}
          </div>
        </div>

        {/* Dimensions & Placement */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <Label htmlFor="cargoLength">Length (ft)</Label>
            <div className="relative mt-1">
              <Ruler className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="cargoLength"
                name="cargoLength"
                type="number"
                min="0"
                step="any"
                value={requestForm.cargoLength !== undefined ? requestForm.cargoLength : ''}
                onChange={handleInputChange}
                placeholder="e.g., 15.5"
                className="pl-9 bg-white"
                required
              />
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">Per-unit length in feet.</p>
          </div>

          <div>
            <Label htmlFor="cargoWidth">Width (ft)</Label>
            <div className="relative mt-1">
              <Ruler className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="cargoWidth"
                name="cargoWidth"
                type="number"
                min="0"
                step="any"
                value={requestForm.cargoWidth !== undefined ? requestForm.cargoWidth : ''}
                onChange={handleInputChange}
                placeholder="e.g., 8.2"
                className="pl-9 bg-white"
                required
              />
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">Standard deck max 8.5ft.</p>
          </div>

          <div>
            <Label htmlFor="cargoHeight">Height (ft)</Label>
            <div className="relative mt-1">
              <Ruler className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="cargoHeight"
                name="cargoHeight"
                type="number"
                min="0"
                step="any"
                value={requestForm.cargoHeight !== undefined ? requestForm.cargoHeight : ''}
                onChange={handleInputChange}
                placeholder="e.g., 6.5"
                className="pl-9 bg-white"
              />
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">Height in feet (e.g. 6.5 ft).</p>
          </div>

          <div>
            <Label htmlFor="placementMode">Loading / Placement Mode</Label>
            <div className="mt-1">
              <Select
                value={requestForm.placementMode || 'standard'}
                onValueChange={(val) => handleSelectChange('placementMode', val)}
              >
                <SelectTrigger id="placementMode" className="bg-white">
                  <SelectValue placeholder="Standard" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Standard (Side-by-side / Floor)</SelectItem>
                  <SelectItem value="stacked">Stacked (Vertical 2-High)</SelectItem>
                  <SelectItem value="nested">Nested / Compact</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">How items sit on trailer deck.</p>
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <Label htmlFor="requestedPickupDateTime">Requested Pickup Date & Time</Label>
          <div className="mt-1">
            <DispatcherDateTimePicker
              id="requestedPickupDateTime"
              name="requestedPickupDateTime"
              value={requestForm.requestedPickupDateTime}
              onChange={(val) => setRequestForm(prev => ({ ...prev, requestedPickupDateTime: val }))}
            />
          </div>
        </div>
        <div>
          <Label htmlFor="requestedDeliveryDateTime">Requested Delivery Date & Time</Label>
          <div className="mt-1">
            <DispatcherDateTimePicker
              id="requestedDeliveryDateTime"
              name="requestedDeliveryDateTime"
              value={requestForm.requestedDeliveryDateTime}
              onChange={(val) => setRequestForm(prev => ({ ...prev, requestedDeliveryDateTime: val }))}
            />
          </div>
        </div>
      </div>

      <div className="space-y-4 border-t pt-4 mt-4">
        <h3 className="text-md font-medium text-foreground">Contact &amp; Business Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <Label htmlFor="companyName">Company / Business Name</Label>
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                id="companyName"
                name="companyName"
                value={requestForm.companyName || ''}
                onChange={handleInputChange}
                placeholder="e.g. Acme Industrial, LLC"
                className="pl-10"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="requestContactName">Your Name</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                id="requestContactName"
                name="requestContactName"
                value={requestForm.requestContactName}
                onChange={handleInputChange}
                placeholder="Full Name"
                className="pl-10"
                required
              />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <Label htmlFor="requestContactEmail">Email Address</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                id="requestContactEmail"
                name="requestContactEmail"
                type="email"
                value={requestForm.requestContactEmail}
                onChange={handleInputChange}
                placeholder="you@example.com"
                className="pl-10"
                required
              />
            </div>
          </div>
          <div>
            <Label htmlFor="requestContactPhone">Phone Number</Label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                id="requestContactPhone"
                name="requestContactPhone"
                type="tel"
                value={requestForm.requestContactPhone}
                onChange={handleInputChange}
                onPaste={(e) => handlePhonePaste(e, (sanitized) => setRequestForm(prev => ({ ...prev, requestContactPhone: sanitized })))}
                placeholder="e.g., 5551234567"
                maxLength={10}
                className="pl-10"
                required
              />
            </div>
          </div>
        </div>
      </div>
      
      <Button type="submit" className="w-full sm:w-auto" disabled={isSubmitting}>
        <Send className="mr-2 h-4 w-4" />
        {isSubmitting ? 'Submitting Request...' : 'Submit Load Request'}
      </Button>
    </form>
  );
}
