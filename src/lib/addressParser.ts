import type { Address } from '../types';

function normalizeRawAddressInput(raw: string): string {
  return raw
    // Normalize non-breaking spaces and zero-width characters to regular spaces
    .replace(/[\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000\uFEFF]/g, ' ')
    // Normalize non-breaking hyphens, en-dashes, em-dashes, minus signs to ASCII '-'
    .replace(/[\u2010-\u2015\u2212]/g, '-');
}

function sanitizePhoneDigits(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
}

function formatPhoneNumber(digits: string): string {
  const clean = sanitizePhoneDigits(digits);
  if (clean.length === 10) {
    return `(${clean.slice(0, 3)}) ${clean.slice(3, 6)}-${clean.slice(6)}`;
  }
  return digits;
}

const STREET_SUFFIX_SPLIT_REGEX =
  /^(.+\b(?:Road|Rd|Street|St|Avenue|Ave|Drive|Dr|Boulevard|Blvd|Lane|Ln|Way|Court|Ct|Place|Pl|Circle|Cir|Pike|Highway|Hwy|Parkway|Pkwy|Trail|Trl|Terrace|Ter|Loop|Alley|Aly|Plaza|Plz|Run|Crossing|Xing)\.?(?:\s+(?:N|S|E|W|NE|NW|SE|SW)\.?)?(?:\s+(?:Ste|Suite|Unit|Apt|Bldg|Fl|Floor|#)\.?\s*[A-Za-z0-9\-]+)?)\s+([A-Za-z][A-Za-z\s.'-]{1,40})$/i;

function splitCompanyFromStreet(streetText: string): { companyText: string; streetText: string } {
  const companyStreetMatch = streetText.match(/^(.+?)\s+(\d{1,6}\s+\S.+)$/);
  if (
    companyStreetMatch &&
    !/^\d/.test(companyStreetMatch[1]) &&
    !/\b(?:hwy|highway|route|rt|rte|sr|cr|us|state\s+rd|county\s+rd|interstate|i)\s*$/i.test(companyStreetMatch[1].trim())
  ) {
    return {
      companyText: companyStreetMatch[1].trim(),
      streetText: companyStreetMatch[2].trim(),
    };
  }
  return { companyText: '', streetText };
}

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

export function extractPhoneFromAddressText(line: string): { phone?: string; remainder: string; isFaxOnly: boolean } {
  const normalizedLine = normalizeRawAddressInput(line);
  const faxOnlyRegex = /^\s*(?:fax|f)\s*[:#\-]?\s*(?:\+?1[\s.\-]?)?(?:\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4})\s*$/i;
  if (faxOnlyRegex.test(normalizedLine)) {
    return { remainder: '', isFaxOnly: true };
  }

  // Match labeled US phone number (10 digits, optional +1)
  const labeledPhoneRegex = /(?:^|[,;|/\s])(?:office|phone|ph|tel|telephone|cell|mobile|direct|main|contact)\s*[:#\-]?\s*(\+?1[\s.\-]?)?(\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4})(?:\s*(?:ext\.?|x)\s*\d+)?/i;
  const labeledMatch = normalizedLine.match(labeledPhoneRegex);
  if (labeledMatch) {
    const digits = sanitizePhoneDigits(labeledMatch[2]);
    if (digits.length === 10) {
      const remainder = normalizedLine
        .replace(labeledMatch[0], ' ')
        .replace(/[,\s;|/]+$/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
      return { phone: formatPhoneNumber(digits), remainder, isFaxOnly: false };
    }
  }

  // Standalone phone line (e.g. "740.264.6599" or "(740) 264-6599")
  const standalonePhoneRegex = /^\s*(?:\+?1[\s.\-]?)?(\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4})\s*$/;
  const standaloneMatch = normalizedLine.match(standalonePhoneRegex);
  if (standaloneMatch) {
    const digits = sanitizePhoneDigits(standaloneMatch[1]);
    if (digits.length === 10) {
      return { phone: formatPhoneNumber(digits), remainder: '', isFaxOnly: false };
    }
  }

  // Unlabeled formatted phone inside/at the end of a single-line address
  // e.g. "1858 E. Pike Street Clarksburg, WV 26301, (304) 624-6304"
  const inlineFormattedPhoneRegex =
    /(?:[,;|/]|(?:\s+-\s+)|\s|^)(?:\+?1[\s.\-]?)?(\(\d{3}\)\s*\d{3}[\s.\-]?\d{4}|\d{3}[\-.\s]\d{3}[\-.]\d{4})(?:\s*(?:ext\.?|x)\s*\d+)?(?=\s*(?:[,;|/.]|$))/i;
  const inlineMatch = normalizedLine.match(inlineFormattedPhoneRegex);
  if (inlineMatch) {
    const digits = sanitizePhoneDigits(inlineMatch[1]);
    if (digits.length === 10) {
      const remainder = normalizedLine
        .replace(inlineMatch[0], '')
        .replace(/[,\s;|/.]+$/g, '')
        .replace(/^[,\s;|/]+/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
      return { phone: formatPhoneNumber(digits), remainder, isFaxOnly: false };
    }
  }

  return { remainder: normalizedLine, isFaxOnly: false };
}

/**
 * Parses a pasted or typed full/partial US address block into companyName, street, city,
 * state, zip, contactName, and contactPhone.
 */
export function parseAddressBlock(raw: string, hideCompany?: boolean): Partial<Address> | null {
  if (!raw) return null;
  const normalized = normalizeRawAddressInput(raw);
  const isCountryToken = (s: string) => /^(usa?|united states(?: of america)?)$/i.test(s.trim());
  const isStreetUnitLine = (s: string) => /^(?:ste|suite|unit|apt|bldg|building|floor|fl|rm|room|#)\b/i.test(s.trim());

  const lines = normalized
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return null;

  let extractedPhone = '';
  let extractedContactName = '';
  const addressLines: string[] = [];

  for (const rawLine of lines) {
    if (isCountryToken(rawLine)) continue;

    const { phone, remainder, isFaxOnly } = extractPhoneFromAddressText(rawLine);
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

  // Single-line comma-separated address (e.g. "1858 E. Pike Street Clarksburg, WV 26301, (304) 624-6304")
  if (addressLines.length === 1 && addressLines[0].includes(',')) {
    let parts = addressLines[0]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (parts.length > 1 && isCountryToken(parts[parts.length - 1])) {
      parts = parts.slice(0, -1);
    }

    if (parts.length >= 2) {
      for (let tailLen = Math.min(3, parts.length); tailLen >= 1; tailLen--) {
        if (tailLen > 1 && /^\d+\s+/.test(parts[parts.length - tailLen])) continue;
        const tail = parts.slice(parts.length - tailLen).join(', ');
        const parsedTail = parseCityStateZip(tail);
        if (parsedTail && (parsedTail.city || parsedTail.zip)) {
          const streetParts = parts.slice(0, parts.length - tailLen);
          let streetText = streetParts.join(', ');
          let cityText = parsedTail.city || '';

          if (!streetText && cityText) {
            const suffixSplit = cityText.match(STREET_SUFFIX_SPLIT_REGEX);
            if (suffixSplit) {
              streetText = suffixSplit[1].trim();
              cityText = suffixSplit[2].trim();
            }
          } else if (!cityText && streetText) {
            const suffixSplit = streetText.match(STREET_SUFFIX_SPLIT_REGEX);
            if (suffixSplit) {
              streetText = suffixSplit[1].trim();
              cityText = suffixSplit[2].trim();
            }
          }

          const split = splitCompanyFromStreet(streetText);
          const companyText = split.companyText;
          streetText = split.streetText;

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
  }

  // Single-line comma-less address (e.g. "1858 E. Pike Street Clarksburg WV 26301 (304) 624-6304")
  if (addressLines.length === 1) {
    const single = addressLines[0].replace(/\s*,?\s*(?:usa?|united states(?: of america)?)$/i, '').trim();
    const stZipTail = single.match(/^(.+?)\s+([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
    if (stZipTail) {
      const prefix = stZipTail[1].replace(/,+\s*$/, '').trim();
      const state = stZipTail[2].toUpperCase();
      const zip = stZipTail[3];
      const suffixSplit = prefix.match(STREET_SUFFIX_SPLIT_REGEX);
      if (suffixSplit) {
        const split = splitCompanyFromStreet(suffixSplit[1].trim());
        return {
          ...(split.companyText ? { companyName: split.companyText } : {}),
          ...(split.companyText && hideCompany && !extractedContactName ? { contactName: split.companyText } : {}),
          street: split.streetText,
          city: suffixSplit[2].trim(),
          state,
          zip,
          ...(extractedPhone ? { contactPhone: extractedPhone } : {}),
          ...(extractedContactName ? { contactName: extractedContactName } : {}),
        };
      }
    }
  }

  return null;
}
