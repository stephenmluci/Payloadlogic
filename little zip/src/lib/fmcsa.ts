/**
 * PayloadLogic Carrier & DOT Verification Service (Server-Only)
 * ──────────────────────────────────────────────────────────────────────────────
 * Performs server-side verification of USDOT numbers using:
 *  1. Official FMCSA QCMobile API (when FMCSA_WEBKEY is configured in env).
 *  2. Live FMCSA/SAFER Company Snapshot lookup (public fallback requiring no key).
 *
 * Reliability & Safety:
 *  - Short timeouts (3.5s - 4.0s) to never hang the signup request.
 *  - In-memory TTL cache (10 minutes) to avoid repeated upstream requests.
 *  - Graceful fallback: Network/service failures return 'valid_unverified' with a
 *    friendly message so new customers are NEVER blocked solely because an
 *    external federal API is slow or unavailable.
 *  - Authoritative validation: Only confirmed "RECORD NOT FOUND" or "INACTIVE"
 *    marks the DOT as 'invalid'.
 */

export interface CarrierLookupSnapshot {
  dot: string;
  legalName?: string;
  dbaName?: string;
  operatingStatus?: string; // 'ACTIVE', 'INACTIVE', etc.
  city?: string;
  state?: string;
  mcNumber?: string;
  source: 'fmcsa_api' | 'safer_web';
}

export type DotLookupResult =
  | {
      status: 'valid_verified';
      carrier: CarrierLookupSnapshot;
      rawStatus?: string;
    }
  | {
      status: 'invalid';
      reason: 'not_found' | 'inactive' | 'format_invalid';
      error: string;
    }
  | {
      status: 'valid_unverified';
      reason: 'timeout' | 'service_error' | 'not_configured';
      notice: string;
    };

// ── In-Memory TTL Cache ───────────────────────────────────────────────────────
interface CacheEntry {
  result: DotLookupResult;
  cachedAt: number;
}

const lookupCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function getCachedResult(dot: string): DotLookupResult | null {
  const entry = lookupCache.get(dot);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    lookupCache.delete(dot);
    return null;
  }
  return entry.result;
}

function setCachedResult(dot: string, result: DotLookupResult): void {
  // Only cache positive validations or confirmed not-found/inactive (do not cache transient timeouts)
  if (result.status === 'valid_verified' || result.status === 'invalid') {
    lookupCache.set(dot, { result, cachedAt: Date.now() });
  }
}

// ── Primary Source: FMCSA QCMobile API ────────────────────────────────────────
async function queryFmcsaApi(dot: string): Promise<DotLookupResult | null> {
  const webKey = process.env.FMCSA_WEBKEY;
  if (!webKey) return null;

  try {
    const res = await fetch(
      `https://mobile.fmcsa.dot.gov/qc/services/carriers/${encodeURIComponent(dot)}?webKey=${encodeURIComponent(webKey)}`,
      {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(3500),
        cache: 'no-store',
      }
    );

    if (res.status === 404) {
      return {
        status: 'invalid',
        reason: 'not_found',
        error: "We couldn’t find that DOT number. Please check and try again.",
      };
    }

    if (!res.ok) {
      console.warn(`[fmcsa_api] HTTP ${res.status} returned for DOT ${dot}`);
      return null; // Fall through to SAFER fallback
    }

    const json: any = await res.json();
    const carrier =
      json?.content?.carrier ??
      (Array.isArray(json?.content) ? json.content[0]?.carrier : null);

    if (carrier) {
      const allowed = carrier.allowedToOperate;
      const opStatus =
        allowed === 'Y' ? 'ACTIVE' : allowed === 'N' ? 'INACTIVE' : (carrier.statusCode || 'ACTIVE');

      return {
        status: 'valid_verified',
        carrier: {
          dot,
          legalName: carrier.legalName || carrier.dbaName || undefined,
          dbaName: carrier.dbaName || undefined,
          operatingStatus: opStatus,
          city: carrier.phyCity || undefined,
          state: carrier.phyState || undefined,
          mcNumber: carrier.mcNumber || undefined,
          source: 'fmcsa_api',
        },
        rawStatus: opStatus,
      };
    }

    if (json && 'content' in json && (!json.content || (Array.isArray(json.content) && json.content.length === 0))) {
      return {
        status: 'invalid',
        reason: 'not_found',
        error: "We couldn’t find that DOT number. Please check and try again.",
      };
    }

    return null;
  } catch (err: any) {
    console.warn(`[fmcsa_api] lookup failed for DOT ${dot}:`, err?.message);
    return null;
  }
}

// ── Fallback / Public Source: SAFER Company Snapshot ──────────────────────────
async function querySaferWeb(dot: string): Promise<DotLookupResult> {
  const url = `https://safer.fmcsa.dot.gov/query.asp?searchtype=ANY&query_type=queryCarrierSnapshot&query_param=USDOT&query_string=${encodeURIComponent(dot)}`;

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(4000),
      cache: 'no-store',
    });

    if (res.status === 404) {
      return {
        status: 'invalid',
        reason: 'not_found',
        error: "We couldn’t find that DOT number. Please check and try again.",
      };
    }

    if (!res.ok) {
      return {
        status: 'valid_unverified',
        reason: 'service_error',
        notice: "We couldn’t verify this DOT right now. You can continue, and we may re-check later.",
      };
    }

    const html = await res.text();

    // Check clear negative indicators
    if (html.includes('RECORD NOT FOUND') || html.includes('No records matching USDOT')) {
      return {
        status: 'invalid',
        reason: 'not_found',
        error: "We couldn’t find that DOT number. Please check and try again.",
      };
    }

    if (html.includes('RECORD INACTIVE') || html.includes('is INACTIVE in the SAFER database')) {
      return {
        status: 'invalid',
        reason: 'inactive',
        error: "This USDOT number is marked inactive with FMCSA. Please check and try again.",
      };
    }

    // Extract carrier metadata from SAFER layout
    const getVal = (labelRegex: string) => {
      const m = html.match(new RegExp(labelRegex + '[\\s\\S]*?<td[^>]*>([\\s\\S]*?)<\\/td>', 'i'));
      if (!m) return null;
      return m[1]
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/&nbsp;/g, ' ')
        .replace(/<[^>]+>/g, '')
        .trim();
    };

    const legalName = getVal('Legal Name:');
    const dbaName = getVal('DBA Name:');
    const dotStatus = getVal('USDOT Status:');
    const opStatus = getVal('Operating Status:');
    const addrRaw = getVal('Physical Address:');
    const mcNumber = getVal('MC\\/MX\\/FF Number\\(s\\):');

    let city: string | undefined;
    let state: string | undefined;

    if (addrRaw) {
      const lines = addrRaw.split(/[\r\n]+/).map((s) => s.trim()).filter(Boolean);
      const lastLine = lines[lines.length - 1] || '';
      const m = lastLine.match(/([A-Za-z\s.-]+),\s*([A-Za-z]{2})\b/);
      if (m) {
        city = m[1].trim();
        state = m[2].toUpperCase().trim();
      }
    }

    if (!legalName && !dotStatus) {
      // SAFER returned an unexpected response format
      return {
        status: 'valid_unverified',
        reason: 'service_error',
        notice: "We couldn’t verify this DOT right now. You can continue, and we may re-check later.",
      };
    }

    return {
      status: 'valid_verified',
      carrier: {
        dot,
        legalName: legalName || undefined,
        dbaName: dbaName || undefined,
        operatingStatus: opStatus || dotStatus || 'ACTIVE',
        city,
        state,
        mcNumber: mcNumber || undefined,
        source: 'safer_web',
      },
      rawStatus: dotStatus || 'ACTIVE',
    };
  } catch (err: any) {
    console.warn(`[safer_web] query failed for DOT ${dot}:`, err?.message);
    const isTimeout = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    return {
      status: 'valid_unverified',
      reason: isTimeout ? 'timeout' : 'service_error',
      notice: "We couldn’t verify this DOT right now. You can continue, and we may re-check later.",
    };
  }
}

// ── Public Unified Verification Entry Point ──────────────────────────────────
export async function lookupDot(dot: string): Promise<DotLookupResult> {
  const cached = getCachedResult(dot);
  if (cached) return cached;

  // 1. Try FMCSA official API if WebKey is configured
  const fmcsaResult = await queryFmcsaApi(dot);
  if (fmcsaResult) {
    setCachedResult(dot, fmcsaResult);
    return fmcsaResult;
  }

  // 2. Fall back to SAFER Company Snapshot lookup (public, no key needed)
  const saferResult = await querySaferWeb(dot);
  setCachedResult(dot, saferResult);
  return saferResult;
}
