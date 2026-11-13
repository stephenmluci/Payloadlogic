import React, { useState } from 'react';
import type { Client, Address } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { User, Phone, Mail, Building2, MapPin, ClipboardPaste, CheckCircle2, PlusCircle, RotateCcw, Sparkles } from 'lucide-react';
import { AddressFields } from '../common/AddressFields';
import { sanitizePhoneDigits, handlePhonePaste } from '@/lib/utils';

type ClientFormProps = {
  clientForm: Omit<Client, 'id'>;
  setClientForm: React.Dispatch<React.SetStateAction<Omit<Client, 'id'>>>;
  onSubmit: (e: React.FormEvent) => void;
  isSubmitting?: boolean;
  onCancel?: () => void;
};

/**
 * Attempts to parse a single-line address string into its component parts.
 * Supported format: "Company Name, Street Address, City, ST 12345"
 * Also handles: "Company Name, Street Address, City, ST, 12345" (zip in separate segment)
 */
function parseAddressString(raw: string): {
  companyName: string;
  street: string;
  city: string;
  state: string;
  zip: string;
} | null {
  const parts = raw.split(',').map(p => p.trim()).filter(Boolean);
  if (parts.length < 3) return null;

  const companyName = parts[0];
  const street = parts[1];
  const city = parts[2];

  // The state+zip may be combined ("IL 60152") or split ("IL", "60152")
  const stateZipRaw = parts.slice(3).join(' ').trim();

  // Match: optional whitespace, 2-letter state, whitespace, 5-digit zip (with optional -4)
  const stateZipMatch = stateZipRaw.match(/^([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
  if (!stateZipMatch) return null;

  const state = stateZipMatch[1].toUpperCase();
  const zip = stateZipMatch[2];

  if (!companyName || !street || !city) return null;

  return { companyName, street, city, state, zip };
}

export function ClientForm({ clientForm, setClientForm, onSubmit, isSubmitting, onCancel }: ClientFormProps) {
  const [parseBanner, setParseBanner] = useState<'success' | 'error' | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    const cleanValue = name === 'contactPhone' ? sanitizePhoneDigits(value) : value;
    setClientForm(prev => ({ ...prev, [name]: cleanValue }));
  };

  const handleAddressChange = (field: keyof Address, value: string) => {
    setClientForm(prev => ({
      ...prev,
      address: {
        ...(prev.address as Address || { street: '', city: '', state: '', zip: '' }),
        [field]: value
      }
    }));
  };

  /** Fires when the user pastes into the Company Name field */
  const handleCompanyNamePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text').trim();
    if (!pasted.includes(',')) return;

    const parsed = parseAddressString(pasted);
    if (!parsed) {
      setParseBanner('error');
      setTimeout(() => setParseBanner(null), 3500);
      return;
    }

    e.preventDefault();

    setClientForm(prev => ({
      ...prev,
      companyName: parsed.companyName,
      address: {
        ...(prev.address as Address || {}),
        street: parsed.street,
        city: parsed.city,
        state: parsed.state,
        zip: parsed.zip,
      } as Address,
    }));

    setParseBanner('success');
    setTimeout(() => setParseBanner(null), 4000);
  };

  const handleReset = () => {
    setClientForm({
      companyName: '',
      contactName: '',
      contactEmail: '',
      contactPhone: '',
      address: { street: '', city: '', state: '', zip: '' }
    });
  };

  return (
    <Card className="border border-slate-200 shadow-sm bg-white rounded-xl">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-lg font-bold text-slate-900">Add New Client Company</CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Register a shipper or broker to quickly populate loads and origin points.
              </CardDescription>
            </div>
          </div>
          {onCancel && (
            <Button variant="ghost" size="sm" onClick={onCancel} className="text-slate-500">
              Cancel
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <form onSubmit={onSubmit} className="space-y-5">
          {/* Quick Paste Notification Banners */}
          {parseBanner === 'success' && (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3.5 py-2.5 text-xs text-emerald-800 animate-in fade-in">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span><strong>Address auto-filled!</strong> Verified address components have been mapped to their fields.</span>
            </div>
          )}
          {parseBanner === 'error' && (
            <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3.5 py-2.5 text-xs text-amber-800 animate-in fade-in">
              <ClipboardPaste className="h-4 w-4 text-amber-600 shrink-0" />
              <span>Could not auto-parse address. Expected format: <em>Company, Street, City, ST Zip</em></span>
            </div>
          )}

          {/* ── Section 1: Basic Company & Contact Information ────── */}
          <div className="space-y-3.5">
            <div className="flex items-center justify-between pb-1 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-slate-400" />
                Company & Contact Information
              </span>
              <span className="text-[11px] text-slate-400 flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-amber-500" />
                Paste address into Company Name to auto-fill
              </span>
            </div>

            {/* Company Name */}
            <div>
              <Label htmlFor="companyName" className="text-xs font-medium text-slate-700">
                Company / Shipper Name <span className="text-red-500">*</span>
              </Label>
              <div className="relative mt-1">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  id="companyName"
                  name="companyName"
                  autoComplete="organization"
                  value={clientForm.companyName}
                  onChange={handleInputChange}
                  onPaste={handleCompanyNamePaste}
                  placeholder="e.g. Caterpillar Logistics or ABC Steel Corp"
                  className="pl-9 h-9 text-xs"
                  required
                />
              </div>
            </div>

            {/* Primary Contact Name */}
            <div>
              <Label htmlFor="contactName" className="text-xs font-medium text-slate-700">
                Primary Contact Person <span className="text-red-500">*</span>
              </Label>
              <div className="relative mt-1">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input 
                  id="contactName"
                  name="contactName"
                  autoComplete="name"
                  value={clientForm.contactName} 
                  onChange={handleInputChange} 
                  placeholder="e.g. Sarah Jenkins (Dispatch Coordinator)"
                  className="pl-9 h-9 text-xs"
                  required
                />
              </div>
            </div>

            {/* Email & Phone side-by-side */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <Label htmlFor="contactEmail" className="text-xs font-medium text-slate-700">
                  Contact Email <span className="text-red-500">*</span>
                </Label>
                <div className="relative mt-1">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input 
                    id="contactEmail"
                    name="contactEmail"
                    type="email"
                    autoComplete="email"
                    value={clientForm.contactEmail} 
                    onChange={handleInputChange} 
                    placeholder="e.g. sarah@abcsteel.com"
                    className="pl-9 h-9 text-xs"
                    required
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="contactPhone" className="text-xs font-medium text-slate-700">
                  Contact Phone <span className="text-red-500">*</span>
                </Label>
                <div className="relative mt-1">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input 
                    id="contactPhone"
                    name="contactPhone"
                    type="tel"
                    autoComplete="tel"
                    value={clientForm.contactPhone} 
                    onChange={handleInputChange} 
                    onPaste={(e) => handlePhonePaste(e, (sanitized) => setClientForm(prev => ({ ...prev, contactPhone: sanitized })))}
                    placeholder="e.g. 555-123-4567"
                    maxLength={14}
                    className="pl-9 h-9 text-xs"
                    required
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ── Section 2: Physical / Facility Location ─────────────── */}
          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between pb-1 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-slate-400" />
                Facility / Pickup Address (Default Origin)
              </span>
              <span className="text-[11px] text-slate-400">
                Pre-fills origin shipper on loads
              </span>
            </div>

            <div className="bg-slate-50/70 border border-slate-200/80 rounded-lg p-3.5">
              <AddressFields 
                label="Company Address"
                address={clientForm.address as Address}
                onChange={handleAddressChange}
                hideCompany={true}
                hideContact={true}
                enableAutocomplete={true}
                onCompanyParsed={(company) => {
                  if (!clientForm.companyName || clientForm.companyName.trim() === '') {
                    setClientForm(prev => ({ ...prev, companyName: company }));
                  }
                }}
              />
            </div>
          </div>

          {/* ── Form Actions ────────────────────────────────────────── */}
          <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleReset}
              disabled={isSubmitting}
              className="text-xs text-slate-600 hover:text-slate-800"
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1.5 text-slate-400" />
              Clear Form
            </Button>

            <div className="flex items-center gap-2">
              {onCancel && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onCancel}
                  disabled={isSubmitting}
                  className="text-xs"
                >
                  Cancel
                </Button>
              )}
              <Button 
                type="submit" 
                size="sm" 
                disabled={isSubmitting} 
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-xs"
              >
                <PlusCircle className="h-3.5 w-3.5 mr-1.5" />
                {isSubmitting ? 'Adding Client...' : 'Add Client Company'}
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
