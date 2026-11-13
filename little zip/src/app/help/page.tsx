import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight, ArrowLeft, LifeBuoy, Sparkles, Mail, ShieldCheck } from 'lucide-react';
import { PayloadLogicLogo } from '@/components/brand/PayloadLogicLogo';
import { HelpChatbot } from '@/components/help/HelpChatbot';
import { HelpKnowledgeAccordion } from '@/components/help/HelpKnowledgeAccordion';
import { SUPPORT_EMAIL } from '@/lib/support';

export const metadata: Metadata = {
  title: 'Help & Guides — PayloadLogic Hotshot TMS',
  description: 'Instant answers, hotshot trucking dispatch guides, deck planning rules, and Gemini AI assistant.',
};

export default function HelpAndGuidesPage() {
  return (
    <div className="min-h-screen bg-[#0c141f] text-white flex flex-col selection:bg-[#ffbe24]/30 selection:text-white">
      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0c141f]/85 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <Link href="/" className="hover:opacity-95 transition-opacity">
            <PayloadLogicLogo variant="compact" iconSize={34} />
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-sm font-medium text-slate-400 hover:text-white transition-colors hidden sm:block"
            >
              Home
            </Link>
            <Link
              href="/pricing"
              className="text-sm font-medium text-slate-400 hover:text-white transition-colors hidden sm:block"
            >
              Pricing
            </Link>
            <Link
              href="/login"
              className="text-sm font-medium text-slate-300 hover:text-white transition-colors"
            >
              Sign In
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#ffbe24] hover:bg-[#e6a817] text-[#0c141f] text-sm font-bold transition-all shadow-lg shadow-[#ffbe24]/20 hover:shadow-[#ffbe24]/30 hover:-translate-y-0.5"
            >
              Access Dashboard <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* ── HERO BANNER ───────────────────────────────────────────────────── */}
      <section className="relative pt-12 pb-8 px-4 sm:px-6 lg:px-8 border-b border-white/5 bg-gradient-to-b from-[#111d2e]/50 to-transparent">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#ffbe24]/10 border border-[#ffbe24]/20 text-[#ffbe24] text-xs font-semibold uppercase tracking-wider">
              <Sparkles className="h-3.5 w-3.5" />
              Official Support &amp; Knowledge Base
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-white mb-3">
            Help &amp; Guides
          </h1>
          <p className="max-w-2xl text-slate-400 text-sm sm:text-base leading-relaxed">
            Everything you need to master PayloadLogic. Browse dispatch and deck planning guides, or ask our custom Gemini AI Assistant for instant step-by-step help.
          </p>
        </div>
      </section>

      {/* ── MAIN CONTENT (2 COLUMNS) ───────────────────────────────────────── */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Left Column: Knowledge Base Guides (7 cols) */}
          <div className="lg:col-span-7 space-y-6">
            <div className="flex items-center justify-between pb-2 border-b border-white/5">
              <div className="flex items-center gap-2">
                <LifeBuoy className="h-5 w-5 text-[#ffbe24]" />
                <h2 className="text-lg font-bold text-white tracking-tight">Platform Documentation</h2>
              </div>
              <span className="text-xs text-slate-400">7 Core Guides</span>
            </div>

            <HelpKnowledgeAccordion />

            {/* Direct Support Card */}
            <div className="mt-8 p-5 rounded-2xl border border-white/10 bg-[#111d2e] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
                  <Mail className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Can&apos;t find what you need?</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Our hotshot dispatch support team is always ready to assist.</p>
                </div>
              </div>
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="px-4 py-2 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-white text-xs font-semibold transition-all shrink-0"
              >
                {SUPPORT_EMAIL}
              </a>
            </div>
          </div>

          {/* Right Column: Interactive Gemini Chatbot (5 cols) */}
          <div className="lg:col-span-5 lg:sticky lg:top-24 h-[650px] sm:h-[720px] lg:h-[calc(100vh-140px)] min-h-[580px] flex flex-col">
            <div className="flex items-center gap-2 pb-2 mb-4 border-b border-white/5 shrink-0">
              <Sparkles className="h-5 w-5 text-[#ffbe24]" />
              <h2 className="text-lg font-bold text-white tracking-tight">AI Help Assistant</h2>
            </div>

            <div className="flex-1 min-h-0">
              <HelpChatbot className="h-full" />
            </div>
          </div>

        </div>
      </main>

      {/* ── FOOTER ───────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/10 py-8 px-4 sm:px-6 lg:px-8 bg-[#090e17] mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <Link href="/" className="hover:opacity-90 transition-opacity">
            <PayloadLogicLogo variant="compact" iconSize={26} />
          </Link>
          <div className="flex items-center gap-6 text-xs text-slate-500">
            <Link href="/" className="hover:text-slate-400 transition-colors">Home</Link>
            <Link href="/pricing" className="hover:text-slate-400 transition-colors">Pricing</Link>
            <Link href="/privacy-policy" className="hover:text-slate-400 transition-colors">Privacy</Link>
            <Link href="/terms-of-service" className="hover:text-slate-400 transition-colors">Terms</Link>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="hover:text-slate-400 transition-colors">Support</a>
            <span>© {new Date().getFullYear()} PayloadLogic</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
