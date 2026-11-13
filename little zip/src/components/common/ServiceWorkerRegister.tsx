'use client';

import { useEffect } from 'react';

declare global {
  interface Window {
    __deferredPwaPrompt?: any;
  }
}

/**
 * Automatically registers the PayloadLogic PWA Service Worker on load
 * and captures the browser's `beforeinstallprompt` event so Driver View
 * and other screens can trigger native PWA installation at any time.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent default mini-infobar where supported and store event for in-app install triggers
      e.preventDefault();
      window.__deferredPwaPrompt = e;
      window.dispatchEvent(new CustomEvent('pwa-install-available'));
    };

    const handleAppInstalled = () => {
      window.__deferredPwaPrompt = null;
      window.dispatchEvent(new CustomEvent('pwa-installed'));
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    if ('serviceWorker' in navigator) {
      const registerSW = async () => {
        try {
          const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
          console.log('[PWA] Service Worker registered with scope:', reg.scope);
        } catch (error) {
          console.warn('[PWA] Service Worker registration failed:', error);
        }
      };

      if (document.readyState === 'complete') {
        registerSW();
      } else {
        window.addEventListener('load', registerSW);
        return () => {
          window.removeEventListener('load', registerSW);
          window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
          window.removeEventListener('appinstalled', handleAppInstalled);
        };
      }
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  return null;
}
