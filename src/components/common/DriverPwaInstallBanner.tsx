'use client';

import React, { useEffect, useState } from 'react';
import { Download, Share, PlusSquare, MoreVertical, Smartphone, X, CheckCircle2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface DriverPwaInstallBannerProps {
  variant?: 'banner' | 'header-button';
}

export function DriverPwaInstallBanner({ variant = 'banner' }: DriverPwaInstallBannerProps) {
  const [isStandalone, setIsStandalone] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isDismissed, setIsDismissed] = useState(false);
  const [showInstructionsModal, setShowInstructionsModal] = useState(false);
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const checkStandalone = () => {
      const standaloneMatch =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true;
      setIsStandalone(Boolean(standaloneMatch));
    };

    checkStandalone();

    const ua = window.navigator.userAgent || '';
    const iosDetected = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    setIsIos(iosDetected);

    try {
      if (sessionStorage.getItem('payloadlogic_driver_pwa_banner_dismissed') === '1') {
        setIsDismissed(true);
      }
    } catch {
      // Ignore storage access errors
    }

    if (window.__deferredPwaPrompt) {
      setDeferredPrompt(window.__deferredPwaPrompt);
    }

    const onPromptAvailable = () => {
      setDeferredPrompt(window.__deferredPwaPrompt || null);
    };
    const onAppInstalled = () => {
      setDeferredPrompt(null);
      setIsStandalone(true);
      setShowInstructionsModal(false);
    };

    window.addEventListener('pwa-install-available', onPromptAvailable);
    window.addEventListener('pwa-installed', onAppInstalled);

    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', checkStandalone);
    }

    return () => {
      window.removeEventListener('pwa-install-available', onPromptAvailable);
      window.removeEventListener('pwa-installed', onAppInstalled);
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', checkStandalone);
      }
    };
  }, []);

  if (isStandalone) {
    return null;
  }

  const handleInstallClick = async () => {
    const promptEvent = deferredPrompt || (typeof window !== 'undefined' ? window.__deferredPwaPrompt : null);
    if (promptEvent && typeof promptEvent.prompt === 'function') {
      try {
        await promptEvent.prompt();
        const choice = await promptEvent.userChoice;
        if (choice?.outcome === 'accepted') {
          window.__deferredPwaPrompt = null;
          setDeferredPrompt(null);
        }
        return;
      } catch {
        // Fall through to manual instructions modal
      }
    }
    setShowInstructionsModal(true);
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    try {
      sessionStorage.setItem('payloadlogic_driver_pwa_banner_dismissed', '1');
    } catch {
      // Ignore storage errors
    }
  };

  return (
    <>
      {variant === 'header-button' ? (
        <button
          type="button"
          onClick={handleInstallClick}
          className="text-[11px] font-bold text-amber-300 hover:text-amber-200 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/40 px-2.5 py-1 rounded-lg transition-colors inline-flex items-center gap-1 cursor-pointer shrink-0"
          title="Add Driver View to Home Screen"
        >
          <Download className="w-3 h-3 shrink-0" />
          <span className="hidden xs:inline">Install App</span>
        </button>
      ) : !isDismissed ? (
        <div className="rounded-2xl bg-gradient-to-r from-[#0c141f] via-slate-900 to-[#0c141f] text-white p-3.5 shadow-sm border border-amber-400/30 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src="/icons/icon-192x192.png"
              alt="PayloadLogic"
              className="w-10 h-10 rounded-xl border border-white/15 shrink-0 bg-[#0c141f]"
            />
            <div className="min-w-0">
              <div className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5 flex-wrap">
                <span>Save Driver View to Home Screen</span>
              </div>
              <p className="text-[11px] text-slate-300 leading-snug mt-0.5">
                Install PayloadLogic on your phone for 1-tap full-screen access to your loads &amp; profile.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleInstallClick}
              className="px-3 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs inline-flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5 shrink-0" />
              <span>Add to Phone</span>
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              aria-label="Dismiss install banner"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : null}

      <Dialog open={showInstructionsModal} onOpenChange={setShowInstructionsModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <img
                src="/icons/icon-192x192.png"
                alt="PayloadLogic App Icon"
                className="w-12 h-12 rounded-2xl border border-slate-200 shadow-xs shrink-0 bg-[#0c141f]"
              />
              <div>
                <DialogTitle className="text-base font-bold text-slate-900">
                  Add PayloadLogic to Home Screen
                </DialogTitle>
                <p className="text-xs text-slate-500 mt-0.5">
                  Opens directly in your restricted Driver View like a native app.
                </p>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs text-slate-700">
            {/* iOS Instructions */}
            <div className={`p-3.5 rounded-xl border ${isIos ? 'bg-blue-50/70 border-blue-200' : 'bg-slate-50 border-slate-200'}`}>
              <div className="font-bold text-slate-900 flex items-center gap-1.5 mb-2">
                <Smartphone className="w-4 h-4 text-blue-600 shrink-0" />
                <span>iPhone / iPad (Safari)</span>
                {isIos && (
                  <span className="ml-auto text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                    Your Device
                  </span>
                )}
              </div>
              <ol className="space-y-1.5 list-decimal list-inside text-slate-600">
                <li>
                  Tap the <strong>Share</strong> button{' '}
                  <Share className="w-3.5 h-3.5 inline text-blue-600 -mt-0.5" /> in your browser toolbar.
                </li>
                <li>
                  Scroll down and tap <strong>&ldquo;Add to Home Screen&rdquo;</strong>{' '}
                  <PlusSquare className="w-3.5 h-3.5 inline text-slate-700 -mt-0.5" />.
                </li>
                <li>
                  Tap <strong>Add</strong> in the top-right corner to save the PayloadLogic icon.
                </li>
              </ol>
            </div>

            {/* Android Instructions */}
            <div className={`p-3.5 rounded-xl border ${!isIos ? 'bg-emerald-50/70 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
              <div className="font-bold text-slate-900 flex items-center gap-1.5 mb-2">
                <Smartphone className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Android (Chrome)</span>
                {!isIos && (
                  <span className="ml-auto text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                    Recommended
                  </span>
                )}
              </div>
              <ol className="space-y-1.5 list-decimal list-inside text-slate-600">
                <li>
                  Tap the browser menu icon{' '}
                  <MoreVertical className="w-3.5 h-3.5 inline text-slate-700 -mt-0.5" /> in the top-right corner.
                </li>
                <li>
                  Tap <strong>&ldquo;Add to Home screen&rdquo;</strong> or <strong>&ldquo;Install app&rdquo;</strong>.
                </li>
                <li>
                  Confirm to place the <strong>PayloadLogic</strong> icon on your home screen.
                </li>
              </ol>
            </div>

            <div className="rounded-xl bg-slate-900 text-slate-200 p-3 flex items-start gap-2 text-[11px]">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>
                Launching <strong>PayloadLogic</strong> from your home screen opens in full-screen standalone mode and takes you straight to your assigned loads and driver profile.
              </span>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={() => setShowInstructionsModal(false)} className="w-full">
              Got It
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
