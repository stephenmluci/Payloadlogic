'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { X, Sparkles, ExternalLink } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { HelpChatbot } from '@/components/help/HelpChatbot';
import { useApp } from '@/context/AppContext';

export function FloatingHelpWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const { user } = useApp();

  // Only show on authenticated app pages; hide on public landing/sign-in/pricing, onboarding, and the dedicated help page
  if (
    !user ||
    pathname === '/help' ||
    pathname === '/login' ||
    pathname === '/pricing' ||
    pathname?.startsWith('/onboard')
  ) {
    return null;
  }

  return (
    <>
      {/* Floating trigger button: Lower-left corner on both mobile and desktop, safely above bottom nav & sticky save bars */}
      <div className="fixed left-3 md:left-4 bottom-[124px] md:bottom-[76px] z-40 select-none">
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className="group flex items-center justify-center w-12 h-12 sm:w-auto sm:h-auto sm:px-4 sm:py-3 rounded-full bg-[#ffbe24] hover:bg-[#e6a817] text-[#0c141f] font-bold text-sm shadow-xl shadow-black/40 hover:shadow-[#ffbe24]/40 hover:-translate-y-0.5 active:scale-90 transition-all border border-amber-300/40"
          title="Open PayloadLogic Help & Guides"
          aria-label="Open PayloadLogic Help & Guides"
        >
          {isOpen ? (
            <>
              <X className="h-5 w-5 shrink-0" />
              <span className="hidden sm:inline ml-2">Close Help</span>
            </>
          ) : (
            <>
              <Sparkles className="h-5 w-5 fill-current animate-pulse shrink-0" />
              <span className="hidden sm:inline ml-2">Ask Help AI</span>
            </>
          )}
        </button>
      </div>

      {/* Responsive modal overlay for chatbot */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
          <div className="relative w-full sm:max-w-xl md:max-w-2xl h-[92vh] sm:h-[85vh] max-h-[850px] rounded-t-2xl sm:rounded-2xl shadow-2xl border border-white/15 bg-[#0c141f] flex flex-col animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
            {/* Header bar */}
            <div className="flex items-center justify-between px-4 py-3 bg-[#111d2e] border-b border-white/10 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[#ffbe24] flex items-center justify-center text-[#0c141f]">
                  <Sparkles className="h-4 w-4 fill-current" />
                </div>
                <div>
                  <span className="font-bold text-sm text-white">PayloadLogic AI Assistant</span>
                  <p className="text-[10px] text-slate-400">Hotshot dispatch &amp; operations support</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href="/help"
                  onClick={() => setIsOpen(false)}
                  className="text-xs text-[#ffbe24] hover:underline flex items-center gap-1 font-semibold px-2 py-1 rounded-lg hover:bg-white/5"
                >
                  <span>Full Help Center</span>
                  <ExternalLink className="h-3 w-3" />
                </Link>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                  aria-label="Close help modal"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Chatbot body */}
            <div className="flex-1 min-h-0 overflow-hidden">
              <HelpChatbot hideHeader={true} className="border-0 rounded-none shadow-none h-full" />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
