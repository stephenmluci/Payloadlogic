'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type LiveLocationFix = {
  lat: number;
  lng: number;
  speed: number | null;
  heading: number | null;
  accuracy: number | null;
};

export type LiveLocationState = 'off' | 'starting' | 'sharing' | 'denied' | 'unsupported' | 'error';

/** Minimum gap between writes while moving slowly / parked. */
export const MIN_SEND_INTERVAL_MS = 20_000;
/** Heartbeat so dispatch can tell a parked truck is still online. */
export const HEARTBEAT_INTERVAL_MS = 120_000;
/** Send sooner than the minimum interval after moving this far. */
export const SIGNIFICANT_MOVE_MILES = 0.5;
/** Never write more often than this, even on significant movement. */
export const HARD_MIN_INTERVAL_MS = 5_000;
/** Movement below this (miles) is ignored between heartbeats (GPS jitter). */
export const JITTER_MILES = 0.03;

function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Pure throttle decision (exported for testing).
 * Battery-conscious: writes at most every ~20s, sooner only after a significant move,
 * and ignores GPS jitter except for a 2-minute heartbeat.
 */
export function shouldSendFix(
  prev: { lat: number; lng: number; at: number } | null,
  next: { lat: number; lng: number },
  nowMs: number,
): boolean {
  if (!prev) return true;
  const elapsed = nowMs - prev.at;
  if (elapsed < HARD_MIN_INTERVAL_MS) return false;
  const moved = haversineMiles(prev.lat, prev.lng, next.lat, next.lng);
  if (moved >= SIGNIFICANT_MOVE_MILES) return true;
  if (elapsed >= HEARTBEAT_INTERVAL_MS) return true;
  return elapsed >= MIN_SEND_INTERVAL_MS && moved >= JITTER_MILES;
}

/**
 * Starts/stops browser geolocation watching. Permission is requested only when
 * `start()` is called from a user tap (required by mobile browsers / PWAs).
 */
export function useLiveLocationSharing(onFix: (fix: LiveLocationFix) => void, onStop?: () => void) {
  const [state, setState] = useState<LiveLocationState>('off');
  const [lastSentAt, setLastSentAt] = useState<number | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const lastSentRef = useRef<{ lat: number; lng: number; at: number } | null>(null);
  const onFixRef = useRef(onFix);
  const onStopRef = useRef(onStop);
  onFixRef.current = onFix;
  onStopRef.current = onStop;

  const clearWatch = useCallback(() => {
    if (watchIdRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }
    watchIdRef.current = null;
    lastSentRef.current = null;
  }, []);

  const stop = useCallback(() => {
    const wasActive = watchIdRef.current !== null;
    clearWatch();
    setState('off');
    if (wasActive) onStopRef.current?.();
  }, [clearWatch]);

  const start = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState('unsupported');
      return;
    }
    if (watchIdRef.current !== null) return;
    setState('starting');

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setState('sharing');
        const { latitude, longitude, speed, heading, accuracy } = pos.coords;
        const now = Date.now();
        if (!shouldSendFix(lastSentRef.current, { lat: latitude, lng: longitude }, now)) return;
        lastSentRef.current = { lat: latitude, lng: longitude, at: now };
        setLastSentAt(now);
        onFixRef.current({
          lat: latitude,
          lng: longitude,
          speed: typeof speed === 'number' && !isNaN(speed) ? speed : null,
          heading: typeof heading === 'number' && !isNaN(heading) ? heading : null,
          accuracy: typeof accuracy === 'number' ? accuracy : null,
        });
      },
      (err) => {
        clearWatch();
        if (err.code === err.PERMISSION_DENIED) {
          setState('denied');
          onStopRef.current?.();
        } else {
          // Position unavailable / timeout: surface a soft error but keep the toggle usable.
          setState('error');
        }
      },
      {
        // Low-accuracy mode (cell/Wi-Fi) is skipped on purpose: trucks need GPS, but we let the
        // OS reuse a recent fix (maximumAge) so the radio isn't forced on for every callback.
        enableHighAccuracy: true,
        maximumAge: 15_000,
        timeout: 30_000,
      },
    );
  }, [clearWatch]);

  // Always stop when the component unmounts (e.g. driver signs out).
  useEffect(() => () => clearWatch(), [clearWatch]);

  return { state, start, stop, lastSentAt, isSharing: state === 'sharing' || state === 'starting' };
}
