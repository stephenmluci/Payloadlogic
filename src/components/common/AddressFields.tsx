
import React, { useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { MapPin, ClipboardPaste, Check } from 'lucide-react';
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

function extractPhoneFromText(line: string): { phone?: string; remainder: string; isFaxOnly: boolean } {
  const faxOnlyRegex = /^\s*(?:fax|f)\s*[:#\-]?\s*(?:\+?1[\s.\-]?)?(?:\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4})\s*$/i;
  if (faxOnlyRegex.test(line)) {
    return { remainder: '', isFaxOnly: true };
  }

  // Match labeled or standalone US phone number (10 digits, optional +1)
  const labeledPhoneRegex = /(?:^|\s)(?:office|phone|ph|tel|telephone|cell|mobile|direct|main|contact)\s*[:#\-]?\s*(\+?1[\s.\-]?)?(\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4})(?:\s*(?:ext\.?|x)\s*\d+)?/i;
  const labeledMatch = line.match(labeledPhoneRegex);
  if (labeledMatch) {
    const digits = sanitizePhoneDigits(labeledMatch[2]);
    if (digits.length === 10) {
      const remainder = line.replace(labeledMatch[0], ' ').replace(/\s{2,}/g, ' ').trim();
      return { phone: formatPhoneNumber(digits), remainder, isFaxOnly: false };
    }
  }

  // Standalone phone line (e.g. "740.264.6599" or "(740) 264-6599")
  const standalonePhoneRegex = /^\s*(?:\+?1[\s.\-]?)?(\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4})\s*$/;
  const standaloneMatch = line.match(standalonePhoneRegex);
  if (standaloneMatch) {
    const digits = sanitizePhoneDigits(standaloneMatch[1]);
    if (digits.length === 10) {
      return { phone: formatPhoneNumber(digits), remainder: '', isFaxOnly: false };
    }
  }

  return { remainder: line, isFaxOnly: false };
}

/**
 * Parses a pasted or typed full/partial US address block into companyName, street, city,
 * state, zip, contactName, and contactPhone.
 * Supports multi-line client/delivery blocks (with phone/contact labels) as well as
 * single-line comma-separated addresses.
 */
export function parseAddressBlock(raw: string, hideCompany?: boolean): Partial<Address> | null {
  const isCountryToken = (s: string) => /^(usa?|united states(?: of america)?)$/i.test(s.trim());
  const isStreetUnitLine = (s: string) => /^(?:ste|suite|unit|apt|bldg|building|floor|fl|rm|room|#)\b/i.test(s.trim());

  let lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return null;

  // Extract phone numbers, fax lines, and explicit contact lines from any position
  let extractedPhone = '';
  let extractedContactName = '';
  const addressLines: string[] = [];

  for (const rawLine of lines) {
    if (isCountryToken(rawLine)) continue;

    const { phone, remainder, isFaxOnly } = extractPhoneFromText(rawLine);
    if (isFaxOnly) continue;
    if (phone && !extractedPhone) {
      extractedPhone = phone;
    }

    const cleaned = phone ? remainder : rawLine;
    if (!cleaned) continue;

    const contactLabelMatch = cleaned.match(/^(?:attn|attention|contact(?:\s+name)?|poc)\s*[:#\-]\s*(.+)$/i);
    if (contactLabelMatch) {
      const nameCandidate = contactLabelMatch[1].trim();
      if (nameCandidate && !extractedContactName) {
        extractedContactName = nameCandidate;
      }
      continue;
    }

    addressLines.push(cleaned);
  }

  while (addressLines.length > 1 && isCountryToken(addressLines[addressLines.length - 1])) {
    addressLines.pop();
  }

  // Multi-line address block: scan bottom-up for the City, State ZIP line
  if (addressLines.length >= 2) {
    let cszIndex = -1;
    let cszParsed: { city?: string; state?: string; zip?: string } | null = null;

    for (let i = addressLines.length - 1; i >= 0; i--) {
      const candidate = parseCityStateZip(addressLines[i]);
      if (candidate && (candidate.city || candidate.zip)) {
        cszIndex = i;
        cszParsed = candidate;
        break;
      }
    }

    if (cszIndex > 0 && cszParsed) {
      const beforeCsz = addressLines.slice(0, cszIndex);
      const result: Partial<Address> = {
        street: '',
        city: cszParsed.city || '',
        state: cszParsed.state || '',
        zip: cszParsed.zip || '',
        ...(extractedPhone ? { contactPhone: extractedPhone } : {}),
        ...(extractedContactName ? { contactName: extractedContactName } : {}),
      };

      if (beforeCsz.length >= 2) {
        const firstIsStreet = /^\d+\s+/.test(beforeCsz[0]) && isStreetUnitLine(beforeCsz[1]);
        if (firstIsStreet) {
          result.street = beforeCsz.join(', ');
        } else {
          result.companyName = beforeCsz[0];
          result.street = beforeCsz.slice(1).join(', ');
          if (hideCompany && !result.contactName) {
            result.contactName = beforeCsz[0];
          }
        }
      } else {
        result.street = beforeCsz[0];
      }
      return result;
    }
  }

  // Single-line comma-separated address (also handles newline-stripped pastes)
  if (addressLines.length === 1 && addressLines[0].includes(',')) {
    let parts = addressLines[0]
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
        let streetText = streetParts.join(', ');
        let cityText = parsedTail.city || '';
        let companyText = '';

        // If city wasn't separated by a comma OR tailLen consumed street+city into cityText
        if (!streetText && cityText) {
          const suffixSplit = cityText.match(
            /^(.+?\b(?:Road|Rd|Street|St|Avenue|Ave|Drive|Dr|Boulevard|Blvd|Lane|Ln|Way|Court|Ct|Place|Pl|Circle|Cir|Pike|Highway|Hwy|Parkway|Pkwy|Trail|Trl|Terrace|Ter)\.?)\s+([A-Za-z][A-Za-z\s.'-]{1,40})$/i
          );
          if (suffixSplit) {
            streetText = suffixSplit[1].trim();
            cityText = suffixSplit[2].trim();
          }
        } else if (!cityText && streetText) {
          const suffixSplit = streetText.match(
            /^(.+?\b(?:Road|Rd|Street|St|Avenue|Ave|Drive|Dr|Boulevard|Blvd|Lane|Ln|Way|Court|Ct|Place|Pl|Circle|Cir|Pike|Highway|Hwy|Parkway|Pkwy|Trail|Trl|Terrace|Ter)\.?)\s+([A-Za-z][A-Za-z\s.'-]{1,40})$/i
          );
          if (suffixSplit) {
            streetText = suffixSplit[1].trim();
            cityText = suffixSplit[2].trim();
          }
        }

        // If company name precedes the street number (e.g. "A.R.M. (USA) Inc. 1506 Fernwood Road")
        const companyStreetMatch = streetText.match(/^(.+?)\s+(\d{1,6}\s+\S.+)$/);
        if (companyStreetMatch && !/^\d/.test(companyStreetMatch[1])) {
          companyText = companyStreetMatch[1].trim();
          streetText = companyStreetMatch[2].trim();
        }

        return {
          ...(companyText ? { companyName: companyText } : {}),
          ...(companyText && hideCompany && !extractedContactName ? { contactName: companyText } : {}),
          street: streetText,
          city: cityText,
          state: parsedTail.state || '',
          zip: parsedTail.zip || '',
          ...(extractedPhone ? { contactPhone: extractedPhone } : {}),
          ...(extractedContactName ? { contactName: extractedContactName } : {}),
        };
      }
    }
  }

  return null;
}

export function AddressFields({ label, prefix: customPrefix, address, onChange, required, hideCompany, hideContact, onCompanyParsed }: AddressFieldsProps) {
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
    setShowPasteBox(false);
    setPasteDraft('');
    setTimeout(() => setPasteNotice(false), 2500);
  };

  const handleSmartPasteButton = async () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
      try {
        const clipText = await navigator.clipboard.readText();
        const parsed = clipText ? parseAddressBlock(clipText, hideCompany) : null;
        if (parsed) {
          applyParsedAddress(parsed);
          return;
        }
      } catch {
        // Clipboard permission denied or unsupported — fall back to inline paste box
      }
    }
    setShowPasteBox((prev) => !prev);
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
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleSmartPasteButton}
            className="h-7 px-2 text-xs text-slate-600 hover:text-slate-900"
            title="Paste a full address block to auto-fill fields"
          >
            <ClipboardPaste className="h-3.5 w-3.5 mr-1" />
            Paste Address
          </Button>
        </div>
      </div>

      {showPasteBox && (
        <div className="p-2.5 rounded-lg border border-blue-200 bg-blue-50/50 space-y-2">
          <Textarea
            value={pasteDraft}
            onChange={(e) => {
              const val = e.target.value;
              setPasteDraft(val);
              const parsed = parseAddressBlock(val, hideCompany);
              if (parsed) {
                applyParsedAddress(parsed);
              }
            }}
            placeholder={"Paste address block here...\ne.g.\nA.R.M. (USA) Inc.\n1506 Fernwood Road\nWintersville, OH 43953\nOffice: 740.264.6599"}
            rows={4}
            className="bg-white text-xs"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => { setShowPasteBox(false); setPasteDraft(''); }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                const parsed = parseAddressBlock(pasteDraft, hideCompany);
                if (parsed) applyParsedAddress(parsed);
              }}
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
