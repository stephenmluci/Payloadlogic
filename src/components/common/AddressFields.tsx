
import React, { useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MapPin, Check } from 'lucide-react';
import type { Address } from '@/types';
import { handlePhonePaste, formatPhoneNumber } from '@/lib/utils';
import { parseAddressBlock } from '@/lib/addressParser';
export { parseAddressBlock };

type AddressFieldsProps = {
  label: string;
  prefix?: string;
  address: Address;
  onChange: (field: keyof Address, value: string) => void;
  required?: boolean;
  hideCompany?: boolean;
  hideContact?: boolean;
  onCompanyParsed?: (company: string) => void;
};

export function AddressFields({ label, prefix: customPrefix, address, onChange, required, hideCompany, hideContact, onCompanyParsed }: AddressFieldsProps) {
  const safeAddress = address || { street: '', city: '', state: '', zip: '' };
  const prefix = customPrefix || label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const streetInputRef = useRef<HTMLInputElement>(null);
  const [pasteNotice, setPasteNotice] = useState(false);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneNumber(e.target.value);
    onChange('contactPhone', formatted);
  };

  const handleContactPhonePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    handlePhonePaste(e, (sanitized) => {
      const formatted = formatPhoneNumber(sanitized);
      onChange('contactPhone', formatted);
    });
  };

  const applyParsedAddress = (parsed: Partial<Address>) => {
    // Clear existing fields first so leftover values from a previous address do not remain
    onChange('companyName', parsed.companyName || '');
    onChange('street', parsed.street || '');
    onChange('city', parsed.city || '');
    onChange('state', parsed.state || '');
    onChange('zip', parsed.zip || '');
    if (parsed.companyName && hideCompany && onCompanyParsed) {
      onCompanyParsed(parsed.companyName);
    }
    if (!hideContact) {
      onChange('contactName', parsed.contactName || '');
      onChange('contactPhone', parsed.contactPhone || '');
    }
    setPasteNotice(true);
    setTimeout(() => setPasteNotice(false), 2500);
  };

  /** Fire when the user pastes into Company Name, Street, or Contact — try to parse a full or partial address. */
  const handleAddressPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text/plain') || e.clipboardData.getData('text');
    if (!text) return;
    const parsed = parseAddressBlock(text, hideCompany);
    if (!parsed) return; // single-line street-only paste — let browser handle it normally
    e.preventDefault();
    applyParsedAddress(parsed);
  };

  const handleSmartInput = (field: 'companyName' | 'street', value: string) => {
    const prevValue = field === 'street' ? (safeAddress.street || '') : (safeAddress.companyName || '');
    const isBulkInsert = value.length - prevValue.length >= 6;

    if (value.includes(',')) {
      const parsed = parseAddressBlock(value, hideCompany);
      // Split immediately when a zip code is present or on bulk paste/autofill (e.g. mobile keyboard)
      if (parsed && (parsed.zip || isBulkInsert)) {
        applyParsedAddress(parsed);
        return;
      }
    }
    onChange(field, value);
  };

  const handleStreetBlur = () => {
    const current = safeAddress.street || '';
    if (!current.includes(',')) return;
    const parsed = parseAddressBlock(current, hideCompany);
    if (parsed) {
      applyParsedAddress(parsed);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" />
          <Label className="text-sm font-semibold text-slate-700">{label}</Label>
        </div>
        <div className="flex items-center gap-2">
          {pasteNotice && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
              <Check className="h-3 w-3" /> Filled
            </span>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {/* Company / Business Name */}
        {!hideCompany && (
          <div>
            <Input
              id={prefix + '-company'}
              name={prefix + '-company'}
              autoComplete="new-password"
              value={safeAddress.companyName || ''}
              onChange={(e) => handleSmartInput('companyName', e.target.value)}
              onPaste={handleAddressPaste}
              placeholder="Company / Business Name (optional) — paste full address here"
              className="bg-white"
            />
          </div>
        )}

        {/* Street Address */}
        <div>
          <Input
            ref={streetInputRef}
            id={prefix + '-street'}
            name={prefix + '-street'}
            autoComplete="new-password"
            value={safeAddress.street || ''}
            onChange={(e) => handleSmartInput('street', e.target.value)}
            onPaste={handleAddressPaste}
            onBlur={handleStreetBlur}
            placeholder="Street Address (or paste full address string here...)"
            required={required}
            className="bg-white"
          />
        </div>

        {/* City / State / Zip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="md:col-span-1">
            <Input
              id={prefix + '-city'}
              name={prefix + '-city'}
              autoComplete="new-password"
              value={safeAddress.city || ''}
              onChange={(e) => onChange('city', e.target.value)}
              placeholder="City"
              required={required}
              className="bg-white"
            />
          </div>
          <div>
            <Input
              id={prefix + '-state'}
              name={prefix + '-state'}
              autoComplete="new-password"
              value={safeAddress.state || ''}
              onChange={(e) => onChange('state', e.target.value)}
              placeholder="State"
              required={required}
              className="bg-white"
            />
          </div>
          <div>
            <Input
              id={prefix + '-zip'}
              name={prefix + '-zip'}
              autoComplete="new-password"
              value={safeAddress.zip || ''}
              onChange={(e) => onChange('zip', e.target.value)}
              placeholder="Zip Code"
              required={required}
              className="bg-white"
            />
          </div>
        </div>

        {/* Contact Person / Phone */}
        {!hideContact && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            <div>
              <Input
                id={prefix + '-contact-name'}
                name={prefix + '-contact-name'}
                value={safeAddress.contactName || ''}
                onChange={(e) => onChange('contactName', e.target.value)}
                placeholder="Contact Person"
                className="bg-white"
              />
            </div>
            <div>
              <Input
                id={prefix + '-contact-phone'}
                name={prefix + '-contact-phone'}
                type="tel"
                value={safeAddress.contactPhone || ''}
                onChange={handlePhoneChange}
                onPaste={handleContactPhonePaste}
                placeholder="Contact Phone (e.g. (123) 456-7890)"
                maxLength={14}
                className="bg-white"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
