
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

function parseCityStateZip(raw: string): { city?: string; state?: string; zip?: string } | null {
  const parts = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (parts.length === 0) return null;

  // Case 1: "City, ST, 34769" or "ST, 34769"
  const last = parts[parts.length - 1];
  if (/^\d{5}(?:-\d{4})?$/.test(last) && parts.length >= 2) {
    const prev = parts[parts.length - 2];
    if (/^[A-Za-z]{2}$/.test(prev)) {
      return {
        city: parts.length >= 3 ? parts.slice(0, -2).join(', ') : '',
        state: prev.toUpperCase(),
        zip: last,
      };
    }
    const prevMatch = prev.match(/^(.+?)\s+([A-Za-z]{2})$/);
    if (prevMatch) {
      return {
        city: prevMatch[1].trim(),
        state: prevMatch[2].toUpperCase(),
        zip: last,
      };
    }
  }

  // Case 2: "City, ST 34769" or "ST 34769"
  const stZipMatch = last.match(/^([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
  if (stZipMatch) {
    return {
      city: parts.length >= 2 ? parts.slice(0, -1).join(', ') : '',
      state: stZipMatch[1].toUpperCase(),
      zip: stZipMatch[2],
    };
  }

  // Case 3: "City ST 34769"
  const cityStZipMatch = last.match(/^(.+?)\s+([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
  if (cityStZipMatch) {
    return {
      city: cityStZipMatch[1].trim(),
      state: cityStZipMatch[2].toUpperCase(),
      zip: cityStZipMatch[3],
    };
  }

  // Case 4: Partial without zip — "City, ST"
  if (/^[A-Za-z]{2}$/.test(last) && parts.length >= 2) {
    return {
      city: parts.slice(0, -1).join(', '),
      state: last.toUpperCase(),
      zip: '',
    };
  }

  // Case 5: Partial without zip — "City ST"
  const cityStMatch = last.match(/^(.+?)\s+([A-Za-z]{2})$/);
  if (cityStMatch) {
    return {
      city: cityStMatch[1].trim(),
      state: cityStMatch[2].toUpperCase(),
      zip: '',
    };
  }

  return null;
}

/**
 * Parses a pasted or typed full/partial US address into street, city, state, and zip.
 * Supports single-line comma-separated formats (including "Street, City, ST, Zip" and
 * "Street, City, ST Zip") as well as 2-line and 3-line clipboard blocks.
 */
function parseAddressBlock(raw: string, hideCompany?: boolean): Partial<Address> | null {
  const isCountryToken = (s: string) => /^(usa?|united states(?: of america)?)$/i.test(s.trim());

  let lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length > 1 && isCountryToken(lines[lines.length - 1])) {
    lines = lines.slice(0, -1);
  }

  // Multi-line address block
  if (lines.length >= 2) {
    const lastParsed = parseCityStateZip(lines[lines.length - 1]);
    if (!lastParsed) return null;

    const result: Partial<Address> = {
      street: '',
      city: lastParsed.city || '',
      state: lastParsed.state || '',
      zip: lastParsed.zip || '',
    };

    if (lines.length >= 3 && !hideCompany) {
      result.companyName = lines[0];
      result.street = lines.slice(1, -1).join(', ');
    } else {
      result.street = lines.slice(0, -1).join(', ');
    }
    return result;
  }

  // Single-line comma-separated address
  if (lines.length === 1 && lines[0].includes(',')) {
    let parts = lines[0]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (parts.length > 1 && isCountryToken(parts[parts.length - 1])) {
      parts = parts.slice(0, -1);
    }

    if (parts.length < 2) return null;

    // Try matching the tail (last 3, 2, or 1 comma parts) as City/State/Zip
    for (let tailLen = Math.min(3, parts.length); tailLen >= 1; tailLen--) {
      const tail = parts.slice(parts.length - tailLen).join(', ');
      const parsedTail = parseCityStateZip(tail);
      if (parsedTail && (parsedTail.city || parsedTail.zip)) {
        const streetParts = parts.slice(0, parts.length - tailLen);
        return {
          street: streetParts.join(', '),
          city: parsedTail.city || '',
          state: parsedTail.state || '',
          zip: parsedTail.zip || '',
        };
      }
    }
  }

  return null;
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

  const applyParsedAddress = (parsed: Partial<Address>) => {
    onChange('street', parsed.street || '');
    onChange('city', parsed.city || '');
    onChange('state', parsed.state || '');
    onChange('zip', parsed.zip || '');
    if (parsed.companyName) {
      if (hideCompany && onCompanyParsed) {
        onCompanyParsed(parsed.companyName);
      } else if (!hideCompany) {
        onChange('companyName', parsed.companyName);
      }
    }
  };

  /** Fire when the user pastes into Company Name or Street — try to parse a full or partial address. */
  const handleAddressPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text');
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
