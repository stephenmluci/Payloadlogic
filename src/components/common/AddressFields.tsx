
import React, { useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MapPin } from 'lucide-react';
import type { Address } from '@/types';
import { sanitizePhoneDigits, handlePhonePaste, formatPhoneNumber } from '@/lib/utils';

type AddressFieldsProps = {
  label: string;
  prefix?: string;
  address: Address;
  onChange: (field: keyof Address, value: string) => void;
  required?: boolean;
  hideCompany?: boolean;
  hideContact?: boolean;
  onCompanyParsed?: (company: string) => void;
  enableAutocomplete?: boolean;
};

/**
 * Parse a multi-line address block pasted from the clipboard.
 *
 * Supports two common formats:
 *   3-line: "Company Name\nStreet\nCity, ST Zip"
 *   2-line: "Street\nCity, ST Zip"
 *
 * Returns null when the text doesn't look like a block address,
 * so normal single-line paste is unaffected.
 */
function parseAddressBlock(raw: string): Partial<Address> | null {
  let lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // If single line with commas, transform it to behave like lines
  if (lines.length === 1 && raw.includes(',')) {
    const commas = raw.split(',').map((s) => s.trim()).filter(Boolean);
    if (commas.length >= 3) {
      // e.g. ["2831 W Jefferson St", "Joliet", "IL 60435"]
      // Combine the last two as "City, State Zip" to match the existing regex
      const city = commas[commas.length - 2];
      const stateZip = commas[commas.length - 1];
      const firstParts = commas.slice(0, commas.length - 2);
      lines = [...firstParts, `${city}, ${stateZip}`];
    }
  }

  if (lines.length < 2) return null;

  // Last line must match "City, ST Zip" or "City ST Zip"
  const lastLine = lines[lines.length - 1];
  const m = lastLine.match(/^(.+?),?\s+([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
  if (!m) return null;

  const [, rawCity, state, zip] = m;
  const result: Partial<Address> = { city: rawCity.trim(), state: state.toUpperCase(), zip };

  if (lines.length >= 3) {
    // First line = company, second = street
    result.companyName = lines[0];
    result.street = lines[1];
  } else {
    // Only street + city/state/zip
    result.street = lines[0];
  }

  return result;
}

export function AddressFields({ label, prefix: customPrefix, address, onChange, required, hideCompany, hideContact, onCompanyParsed, enableAutocomplete }: AddressFieldsProps) {
  const safeAddress = address || { street: '', city: '', state: '', zip: '' };
  const prefix = customPrefix || label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const streetInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!enableAutocomplete || !streetInputRef.current) return;
    if (typeof window === 'undefined' || !(window as any).google?.maps?.places) return;

    try {
      const autocomplete = new (window as any).google.maps.places.Autocomplete(streetInputRef.current, {
        types: ['address'],
        componentRestrictions: { country: 'us' },
      });

      autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        if (!place || !place.address_components) return;

        let streetNumber = '';
        let route = '';
        let city = '';
        let state = '';
        let zip = '';

        place.address_components.forEach((comp: any) => {
          const types = comp.types;
          if (types.includes('street_number')) streetNumber = comp.long_name;
          if (types.includes('route')) route = comp.short_name || comp.long_name;
          if (types.includes('locality')) city = comp.long_name;
          if (types.includes('sublocality_level_1') && !city) city = comp.long_name;
          if (types.includes('administrative_area_level_1')) state = comp.short_name;
          if (types.includes('postal_code')) zip = comp.long_name;
        });

        let streetAddress = `${streetNumber} ${route}`.trim();
        // If street_number and route were not in address_components, parse from formatted_address rather than taking place.name (which is often a dealership/company name)
        if (!streetAddress && place.formatted_address) {
          const firstPart = place.formatted_address.split(',')[0]?.trim();
          // Only use if it looks like a street (has a digit) or doesn't match place.name
          if (firstPart && (!place.name || firstPart.toLowerCase() !== place.name.toLowerCase())) {
            streetAddress = firstPart;
          }
        }
        if (!streetAddress && place.name && !place.address_components?.some((c: any) => c.types.includes('establishment'))) {
          streetAddress = place.name;
        }

        if (streetAddress) onChange('street', streetAddress);
        if (city) onChange('city', city);
        if (state) onChange('state', state);
        if (zip) onChange('zip', zip);

        // Programmatic updates on HTML inputs don't fire React synthetic onChange.
        // Explicitly dispatch native input events so React & listeners pick up the full string immediately.
        setTimeout(() => {
          if (streetInputRef.current) {
            const form = streetInputRef.current.form || streetInputRef.current.closest('div.space-y-3');
            if (form) {
              const cityEl = form.querySelector<HTMLInputElement>(`input[name="${prefix}-city"]`);
              const stateEl = form.querySelector<HTMLInputElement>(`input[name="${prefix}-state"]`);
              const zipEl = form.querySelector<HTMLInputElement>(`input[name="${prefix}-zip"]`);

              [streetInputRef.current, cityEl, stateEl, zipEl].forEach(input => {
                if (input) {
                  input.dispatchEvent(new Event('input', { bubbles: true }));
                  input.dispatchEvent(new Event('change', { bubbles: true }));
                }
              });
            }
          }
        }, 50);
      });
    } catch (err) {
      console.warn('Google Places Autocomplete initialization error:', err);
    }
  }, [enableAutocomplete, onChange, prefix]);

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

  /** Fire when the user pastes into Company Name or Street — try to parse a full address block. */
  const handleAddressPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text');
    const parsed = parseAddressBlock(text);
    if (!parsed) return; // single-line paste — let browser handle it normally
    e.preventDefault();
    (Object.entries(parsed) as [keyof Address, string][]).forEach(([field, value]) => {
      if (field === 'companyName' && hideCompany && onCompanyParsed) {
        onCompanyParsed(value);
      } else {
        onChange(field, value);
      }
    });
  };

  const handleSmartInput = (field: 'companyName' | 'street', value: string) => {
    // If user types/autofills a comma-separated address into company or street
    if (value.includes(',') && parseAddressBlock(value)) {
      const parsed = parseAddressBlock(value);
      if (parsed) {
        (Object.entries(parsed) as [keyof Address, string][]).forEach(([f, v]) => {
          if (f === 'companyName' && hideCompany && onCompanyParsed) {
            onCompanyParsed(v);
          } else {
            onChange(f as keyof Address, v);
          }
        });
        return; // Don't set the raw comma string into the single field
      }
    }
    onChange(field, value);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <MapPin className="h-4 w-4 text-primary" />
        <Label className="text-sm font-semibold text-slate-700">{label}</Label>
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
