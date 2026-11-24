import React, { useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { MapPin, ClipboardPaste, Check } from 'lucide-react';
import type { Address } from '@/types';
import { handlePhonePaste, formatPhoneNumber } from '@/lib/utils';
import { parseAddressBlock, extractPhoneFromAddressText } from '@/lib/addressParser';
export { parseAddressBlock };

type AddressFieldsProps = {
  label: string;
  prefix?: string;
  address: Address;
  onChange: (field: keyof Address, value: string) => void;
  onBulkChange?: (updates: Partial<Address>) => void;
  required?: boolean;
  highlightMissing?: boolean;
  hideCompany?: boolean;
  hideContact?: boolean;
  hidePasteButton?: boolean;
  onCompanyParsed?: (company: string) => void;
};

export function AddressFields({
  label,
  prefix: customPrefix,
  address,
  onChange,
  onBulkChange,
  required,
  highlightMissing,
  hideCompany,
  hideContact,
  hidePasteButton,
  onCompanyParsed,
}: AddressFieldsProps) {
  const safeAddress = address || { street: '', city: '', state: '', zip: '' };
  const prefix = customPrefix || label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const streetInputRef = useRef<HTMLInputElement>(null);
  const [pasteNotice, setPasteNotice] = useState(false);
  const [showPasteBox, setShowPasteBox] = useState(false);
  const [pasteDraft, setPasteDraft] = useState('');

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

  const applyParsedAddress = (parsed: Partial<Address>, closePastePanel = true) => {
    const updates: Partial<Address> = {
      companyName: parsed.companyName || '',
      street: parsed.street || '',
      city: parsed.city || '',
      state: parsed.state || '',
      zip: parsed.zip || '',
      ...(!hideContact
        ? {
            contactName: parsed.contactName || '',
            contactPhone: parsed.contactPhone || '',
          }
        : {}),
    };

    if (onBulkChange) {
      onBulkChange(updates);
    } else {
      onChange('companyName', updates.companyName || '');
      onChange('street', updates.street || '');
      onChange('city', updates.city || '');
      onChange('state', updates.state || '');
      onChange('zip', updates.zip || '');
      if (!hideContact) {
        onChange('contactName', updates.contactName || '');
        onChange('contactPhone', updates.contactPhone || '');
      }
    }

    if (parsed.companyName && hideCompany && onCompanyParsed) {
      onCompanyParsed(parsed.companyName);
    }

    if (closePastePanel) {
      setShowPasteBox(false);
      setPasteDraft('');
    }
    setPasteNotice(true);
    setTimeout(() => setPasteNotice(false), 2500);
  };

  const handleFillFromDraft = (rawText: string, closePastePanel = true) => {
    const trimmed = rawText.trim();
    if (!trimmed) return false;

    const parsed = parseAddressBlock(trimmed, hideCompany);
    if (parsed) {
      applyParsedAddress(parsed, closePastePanel);
      return true;
    }

    // Fallback when user clicks Fill Fields with a partial/street-only line
    if (closePastePanel) {
      const { phone, remainder } = extractPhoneFromAddressText(trimmed);
      applyParsedAddress(
        {
          street: remainder || trimmed,
          city: safeAddress.city || '',
          state: safeAddress.state || '',
          zip: safeAddress.zip || '',
          contactName: safeAddress.contactName || '',
          contactPhone: phone || safeAddress.contactPhone || '',
        },
        true,
      );
      return true;
    }
    return false;
  };

  /** Direct paste into Street or Company field — immediately parse and fill Street, City, State, ZIP, and Phone. */
  const handleAddressPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData?.getData('text/plain') || e.clipboardData?.getData('text') || '';
    if (!text) return;
    const parsed = parseAddressBlock(text, hideCompany);
    if (!parsed) return; // single-line street-only paste — let browser handle it normally
    e.preventDefault();
    applyParsedAddress(parsed, true);
  };

  const handleAddressDrop = (e: React.DragEvent<HTMLInputElement>) => {
    const text = e.dataTransfer?.getData('text/plain') || e.dataTransfer?.getData('text') || '';
    if (!text) return;
    const parsed = parseAddressBlock(text, hideCompany);
    if (!parsed) return;
    e.preventDefault();
    applyParsedAddress(parsed, true);
  };

  const handleSmartInput = (field: 'companyName' | 'street', value: string) => {
    const prevValue = field === 'street' ? (safeAddress.street || '') : (safeAddress.companyName || '');
    const isBulkInsert = value.length - prevValue.length >= 10;

    if (isBulkInsert || (value.includes(',') && /\b\d{5}(?:-\d{4})?\b/.test(value))) {
      const parsed = parseAddressBlock(value, hideCompany);
      if (parsed && parsed.street && (parsed.city || parsed.zip)) {
        applyParsedAddress(parsed, true);
        return;
      }
    }
    onChange(field, value);
  };

  const handleStreetBlur = () => {
    // Only auto-split on blur if City and Zip have not already been filled, keeping fields freely editable
    if (safeAddress.city || safeAddress.zip) return;
    const current = safeAddress.street || '';
    if (!current) return;
    const parsed = parseAddressBlock(current, hideCompany);
    if (parsed && parsed.street && (parsed.city || parsed.zip)) {
      applyParsedAddress(parsed, true);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" />
          <Label className="text-sm font-semibold text-slate-700">
            {label}
            {required && <span className="text-red-500 ml-0.5" aria-hidden="true">*</span>}
          </Label>
        </div>
        <div className="flex items-center gap-2">
          {pasteNotice && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
              <Check className="h-3 w-3" /> Filled
            </span>
          )}
          {!hidePasteButton && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowPasteBox((prev) => !prev)}
              className="h-7 px-2 text-xs text-slate-600 hover:text-slate-900"
              title="Paste a full address block to auto-fill Street, City, State, ZIP, and Phone"
            >
              <ClipboardPaste className="h-3.5 w-3.5 mr-1" />
              Paste Address
            </Button>
          )}
        </div>
      </div>

      {!hidePasteButton && showPasteBox && (
        <div className="p-2.5 rounded-lg border border-blue-200 bg-blue-50/50 space-y-2">
          <Textarea
            id={prefix + '-paste-box'}
            value={pasteDraft}
            onChange={(e) => setPasteDraft(e.target.value)}
            onPaste={(e) => {
              const text = e.clipboardData?.getData('text/plain') || e.clipboardData?.getData('text') || '';
              if (!text) return;
              const parsed = parseAddressBlock(text, hideCompany);
              if (parsed) {
                // Populate fields immediately and also keep draft until Fill Fields / close
                applyParsedAddress(parsed, false);
              }
            }}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                handleFillFromDraft(pasteDraft, true);
              }
            }}
            placeholder={'Paste full address here, e.g.\n1858 E. Pike Street Clarksburg, WV 26301, (304) 624-6304'}
            rows={3}
            className="bg-white text-xs"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                setShowPasteBox(false);
                setPasteDraft('');
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-7 text-xs"
              onClick={() => handleFillFromDraft(pasteDraft, true)}
            >
              Fill Fields
            </Button>
          </div>
        </div>
      )}

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
              onDrop={handleAddressDrop}
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
            onDrop={handleAddressDrop}
            onBlur={handleStreetBlur}
            placeholder="Street Address (or paste full address string here...)"
            required={required}
            aria-invalid={Boolean(required && highlightMissing && !safeAddress.street?.trim())}
            className={required && highlightMissing && !safeAddress.street?.trim() ? 'bg-red-50/40 border-red-400 focus-visible:ring-red-400' : 'bg-white'}
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
              aria-invalid={Boolean(required && highlightMissing && !safeAddress.city?.trim())}
              className={required && highlightMissing && !safeAddress.city?.trim() ? 'bg-red-50/40 border-red-400 focus-visible:ring-red-400' : 'bg-white'}
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
              aria-invalid={Boolean(required && highlightMissing && !safeAddress.state?.trim())}
              className={required && highlightMissing && !safeAddress.state?.trim() ? 'bg-red-50/40 border-red-400 focus-visible:ring-red-400' : 'bg-white'}
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
              aria-invalid={Boolean(required && highlightMissing && !safeAddress.zip?.trim())}
              className={required && highlightMissing && !safeAddress.zip?.trim() ? 'bg-red-50/40 border-red-400 focus-visible:ring-red-400' : 'bg-white'}
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
