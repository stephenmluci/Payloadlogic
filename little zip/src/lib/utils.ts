import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { Address } from "@/types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatAddress(address: Address | string | undefined, format: 'full' | 'short' = 'full'): string {
  if (!address) return 'N/A';
  if (typeof address === 'string') return address;
  const { companyName, street, city, state, zip } = address;
  if (!street && !city && !state && !zip) return 'N/A';
  
  if (format === 'short') {
    if (city && state) return `${city}, ${state}`;
    return street || city || state || zip || 'N/A';
  }
  
  const parts = [street, city, state].filter(Boolean);
  let addressLine = parts.join(', ');
  if (zip) addressLine += ` ${zip}`;
  if (companyName) return `${companyName} — ${addressLine}`;
  return addressLine || 'N/A';
}

/**
 * Sanitizes phone number strings:
 * - Strips all non-numeric characters, plus symbols (+), spaces, parentheses, and dashes.
 * - Strips international/country code prefixes (such as +1) by strictly retaining only the final 10 digits.
 */
export function sanitizePhoneDigits(input: string | undefined | null): string {
  if (!input) return '';
  const digitsOnly = String(input).replace(/\D/g, '');
  return digitsOnly.length > 10 ? digitsOnly.slice(-10) : digitsOnly;
}

/**
 * Intercepts clipboard paste events on phone input fields:
 * - Prevents raw unformatted paste
 * - Extracts clipboard text
 * - Strips non-numeric characters, plus symbols, and country codes
 * - Strictly retains only the final 10 digits
 * - Dispatches the clean 10 digits to the change handler
 */
export function handlePhonePaste(
  e: React.ClipboardEvent<HTMLInputElement>,
  onChangeCallback: (sanitized: string) => void
): void {
  e.preventDefault();
  const text = e.clipboardData?.getData('text') || '';
  const sanitized = sanitizePhoneDigits(text);
  onChangeCallback(sanitized);
}

/**
 * Formats a raw phone string into standard (XXX) XXX-XXXX format.
 * If 10 digits are present: (XXX) XXX-XXXX.
 * If partial or non-10 digits, formats gracefully.
 */
export function formatPhoneNumber(rawString: string | undefined | null): string {
  if (!rawString) return '';
  const digits = sanitizePhoneDigits(rawString);
  if (!digits) return '';
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length > 6) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length > 3) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  }
  return digits;
}

