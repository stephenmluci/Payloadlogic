import React from 'react';
import Link from 'next/link';
import { SUPPORT_EMAIL } from '@/lib/support';

export function AppFooter() {
  return (
    <footer className="bg-white border-t border-slate-200 py-6 mt-auto">
      <div className="container mx-auto px-4 md:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-500 font-medium">
        <div>
          <p>
            &copy; {new Date().getFullYear()} PayloadLogic &middot; Hotshot Trucking Management System
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            By using this site, you automatically agree to our Terms of Service and Privacy Policy.
          </p>
        </div>
        <div className="flex items-center gap-6 text-xs sm:text-sm">
          <Link href="/terms-of-service" className="hover:text-slate-800 transition-colors underline-offset-4 hover:underline">
            Terms of Service
          </Link>
          <Link href="/privacy-policy" className="hover:text-slate-800 transition-colors underline-offset-4 hover:underline">
            Privacy Policy
          </Link>
          <a href={`mailto:${SUPPORT_EMAIL}`} className="hover:text-blue-600 transition-colors underline-offset-4 hover:underline">
            Support
          </a>
        </div>
      </div>
    </footer>
  );
}

