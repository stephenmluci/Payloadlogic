'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import {
  Layers, TrendingUp, Radio, CheckCircle2, ArrowRight,
  Star, Shield, Zap, Users, BarChart3, MapPin, ChevronRight, Loader2,
} from 'lucide-react';
import { PayloadLogicLogo } from '@/components/brand/PayloadLogicLogo';
import { PrivateTestingModal } from '@/components/common/PrivateTestingModal';
import { useApp } from '@/context/AppContext';
import { BrandSplashScreen } from '@/components/brand/BrandSplashScreen';

const DriverDashboard = dynamic(
  () => import('@/components/dashboard/DriverDashboard').then((mod) => mod.DriverDashboard),
  {
    loading: () => (
      <div className="min-h-screen flex items-center justify-center bg-[#0c141f]">
        <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
      </div>
    ),
    ssr: false,
  }
);

export function MarketingLandingClient() {
  const [modalOpen, setModalOpen] = useState(false);
  const [isStandalonePwa, setIsStandalonePwa] = useState(false);
  const { user, appDisplayState, isLoading } = useApp();
  const router = useRouter();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    setIsStandalonePwa(Boolean(standalone));
  }, []);

  useEffect(() => {
    if (isLoading) return;

    // 1. Logged-in drivers always go straight to their restricted Driver View
    if (user?.role === 'driver' || appDisplayState === 'driver_dashboard') {
      router.replace('/dashboard');
      return;
    }

    // 2. If unauthenticated, check if this device has an active Driver View magic-link session
    if (appDisplayState === 'auth' && typeof window !== 'undefined') {
      try {
        const savedRole = localStorage.getItem('payloadlogic_pwa_role');
        const savedToken = localStorage.getItem('payloadlogic_driver_portal_token');
        if (savedRole === 'driver' && savedToken) {
          router.replace(`/driver-portal/${encodeURIComponent(savedToken)}`);
          return;
        }
      } catch {
        // Non-fatal
      }
    }

    // 3. If launched as an installed standalone PWA from home screen, skip marketing page
    if (isStandalonePwa) {
      router.replace('/dashboard');
    }
  }, [isLoading, user, appDisplayState, isStandalonePwa, router]);

  // Immediately render restricted Driver View if logged in as a driver
  if (!isLoading && (user?.role === 'driver' || appDisplayState === 'driver_dashboard')) {
    return <DriverDashboard />;
  }

  // Show clean splash screen when launching in standalone PWA mode while redirecting
  if (isStandalonePwa) {
    return <BrandSplashScreen message="Opening PayloadLogic..." />;
  }

  const openPrivateTestingModal = (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    setModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-[#0c141f] text-white overflow-x-hidden">

      {/* ── NAV ─────────────────────────────────────────────────────────── */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-[#0c141f]/85 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <Link href="/" className="hover:opacity-95 transition-opacity">
            <PayloadLogicLogo variant="compact" iconSize={34} />
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/pricing"
              className="text-sm font-medium text-slate-400 hover:text-white transition-colors hidden sm:block"
            >
              Pricing
            </Link>
            <Link
              href="/help"
              className="text-sm font-medium text-slate-400 hover:text-white transition-colors hidden sm:block"
            >
              Help &amp; Guides
            </Link>
            <Link
              href="/login"
              className="text-sm font-medium text-slate-300 hover:text-white transition-colors"
            >
              Sign In
            </Link>
            <button
              type="button"
              id="nav-get-started"
              onClick={openPrivateTestingModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#ffbe24] hover:bg-[#e6a817] text-[#0c141f] text-sm font-bold transition-all shadow-lg shadow-[#ffbe24]/20 hover:shadow-[#ffbe24]/30 hover:-translate-y-0.5 cursor-pointer"
            >
              Get Started <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </nav>

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section className="relative pt-28 pb-24 sm:pt-36 sm:pb-32 px-4 sm:px-6 lg:px-8 overflow-hidden">
        {/* Background glow effects */}
        <div
          className="absolute inset-0 pointer-events-none"
          aria-hidden="true"
        >
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-blue-600/10 rounded-full blur-[120px]" />
          <div className="absolute top-32 left-1/4 w-[400px] h-[400px] bg-indigo-600/8 rounded-full blur-[100px]" />
          {/* Subtle grid */}
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage:
                'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
              backgroundSize: '60px 60px',
            }}
          />
        </div>

        <div className="relative max-w-5xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-300 text-xs font-semibold uppercase tracking-widest mb-8">
            <Zap className="h-3 w-3" />
            Built for Hotshot Owner-Operators
          </div>

          {/* Headline */}
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold leading-[1.05] tracking-tight mb-6">
            <span className="text-white">Streamline Your Loads.</span>
            <br />
            <span
              className="text-transparent bg-clip-text"
              style={{
                backgroundImage: 'linear-gradient(135deg, #60a5fa 0%, #818cf8 50%, #a78bfa 100%)',
              }}
            >
              Maximize Every Trailer Foot.
            </span>
          </h1>

          {/* Sub-headline */}
          <p className="max-w-2xl mx-auto text-base sm:text-lg md:text-xl text-slate-400 leading-relaxed mb-10">
            The all-in-one dispatch and fleet management platform for hotshot truck owners. Track
            profit on every load, manage your deck space like a pro, and keep your drivers moving.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              type="button"
              id="hero-cta-primary"
              onClick={openPrivateTestingModal}
              className="group inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-[#ffbe24] hover:bg-[#e6a817] text-[#0c141f] font-bold text-base sm:text-lg shadow-2xl shadow-[#ffbe24]/25 hover:shadow-[#ffbe24]/40 transition-all hover:-translate-y-1 w-full sm:w-auto cursor-pointer"
            >
              Get Started Free
              <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform text-[#0c141f]" />
            </button>
            <Link
              href="/pricing"
              id="hero-cta-pricing"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-white font-semibold text-base sm:text-lg transition-all hover:-translate-y-0.5 w-full sm:w-auto"
            >
              See Pricing Plans
            </Link>
          </div>

          {/* Returning user sign-in prompt */}
          <div className="mt-4 text-center">
            <span className="text-sm text-slate-400">Already have an account? </span>
            <Link
              href="/login"
              className="text-sm font-semibold text-slate-200 hover:text-white underline underline-offset-4 transition-colors"
            >
              Sign In
            </Link>
          </div>

          {/* Trust row */}
          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-8 mt-10 text-slate-500 text-xs sm:text-sm">
            {[
              { icon: Shield, text: 'No Credit Card Required' },
              { icon: CheckCircle2, text: 'Free to Try' },
              { icon: Star, text: 'Built for US Operators' },
            ].map(({ icon: Icon, text }) => (
              <span key={text} className="flex items-center gap-1.5">
                <Icon className="h-3.5 w-3.5 text-blue-400" />
                {text}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── STATS BAR ────────────────────────────────────────────────────── */}
      <section className="border-y border-white/5 bg-white/[0.02] py-10 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8 text-center">
          {[
            { value: '100%', label: 'Built for Hotshot' },
            { value: '$0', label: 'to Start' },
            { value: '40ft', label: 'Deck Planning Support' },
            { value: '24/7', label: 'Dispatch Ready' },
          ].map(({ value, label }) => (
            <div key={label} className="space-y-1">
              <div className="text-2xl sm:text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400">
                {value}
              </div>
              <div className="text-xs sm:text-sm text-slate-500 font-medium uppercase tracking-wider">
                {label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURE CARDS ────────────────────────────────────────────────── */}
      <section id="features" className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          {/* Section header */}
          <div className="text-center mb-16">
            <p className="text-blue-400 text-sm font-semibold uppercase tracking-widest mb-3">Platform Features</p>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight mb-4">
              Everything your hotshot operation needs
            </h2>
            <p className="text-slate-400 text-base sm:text-lg max-w-2xl mx-auto">
              Stop juggling spreadsheets. Every feature you need — dispatch, fleet, finances — lives in one
              clean dashboard.
            </p>
          </div>

          {/* Primary 3 spotlight cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {[
              {
                icon: Layers,
                color: 'from-blue-500 to-cyan-500',
                glow: 'shadow-blue-500/20',
                badge: 'Core Feature',
                title: 'Deck Space Consolidation',
                description:
                  'Intelligently stack and plan multiple loads onto a single flatbed run. Our cargo calculator validates weight, length, and stacking legality before you commit.',
                bullets: [
                  'Multi-cargo GCWR compliance check',
                  'Visual stacking & placement modes',
                  'Partial freight detection',
                  'Up to 40ft gooseneck & flatbed support',
                ],
              },
              {
                icon: TrendingUp,
                color: 'from-emerald-500 to-teal-500',
                glow: 'shadow-emerald-500/20',
                badge: 'Profit Engine',
                title: 'Real-Time Profit Tracking',
                description:
                  'Know your net on every load before you roll. Live fuel, DEF, payroll, and overhead calculations give you the real number — not just gross revenue.',
                bullets: [
                  'Per-load profit & loss breakdown',
                  'Cost-per-mile (CPM) tracking',
                  'Payroll % or per-mile driver pay',
                  'Monthly P&L snapshot dashboard',
                ],
              },
              {
                icon: Radio,
                color: 'from-violet-500 to-purple-500',
                glow: 'shadow-violet-500/20',
                badge: 'Command Center',
                title: 'Fleet Operations Telemetry',
                description:
                  'A live dispatch view of every truck, trailer, and driver in your fleet. Track phases, update statuses, and know where every asset is at a glance.',
                bullets: [
                  'Driver phase & availability tracking',
                  'Real-time load status updates',
                  'Multi-driver roster management',
                  'CDL & med card expiry alerts',
                ],
              },
            ].map(({ icon: Icon, color, glow, badge, title, description, bullets }) => (
              <div
                key={title}
                className={`group relative rounded-2xl border border-white/8 bg-white/[0.03] hover:bg-white/[0.06] transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl ${glow} overflow-hidden p-6 flex flex-col`}
              >
                {/* Top gradient line */}
                <div className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${color} opacity-60 group-hover:opacity-100 transition-opacity`} />

                {/* Icon */}
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center mb-5 shadow-lg`}>
                  <Icon className="h-6 w-6 text-white" />
                </div>

                {/* Badge */}
                <span className="inline-block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                  {badge}
                </span>

                {/* Title */}
                <h3 className="text-lg font-bold text-white mb-3">{title}</h3>

                {/* Description */}
                <p className="text-slate-400 text-sm leading-relaxed mb-5">{description}</p>

                {/* Bullets */}
                <ul className="mt-auto space-y-2">
                  {bullets.map((b) => (
                    <li key={b} className="flex items-start gap-2 text-sm text-slate-300">
                      <CheckCircle2 className="h-4 w-4 text-blue-400 flex-shrink-0 mt-0.5" />
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Secondary feature pills */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { icon: MapPin, label: 'Load Origin Tracking' },
              { icon: Users, label: 'Driver Roster' },
              { icon: BarChart3, label: 'Expense Reports' },
              { icon: Shield, label: 'FMCSA Compliance' },
              { icon: Zap, label: 'Invoice & Agreement PDF' },
              { icon: Star, label: 'Client Portal' },
            ].map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex flex-col items-center gap-2 p-4 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/10 transition-all text-center cursor-default"
              >
                <Icon className="h-5 w-5 text-blue-400" />
                <span className="text-xs text-slate-400 font-medium leading-tight">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────────────────── */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white/[0.015] border-y border-white/5">
        <div className="max-w-4xl mx-auto text-center mb-14">
          <p className="text-blue-400 text-sm font-semibold uppercase tracking-widest mb-3">How It Works</p>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">From dispatch to delivery in 3 steps</h2>
        </div>
        <div className="max-w-5xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8">
          {[
            {
              step: '01',
              title: 'Create a Load',
              desc: 'Enter origin, destination, cargo specs, and rate. The profit engine calculates your net instantly.',
            },
            {
              step: '02',
              title: 'Assign & Dispatch',
              desc: 'Pick a truck, trailer, and driver. GCWR compliance is checked automatically before you confirm.',
            },
            {
              step: '03',
              title: 'Track & Invoice',
              desc: 'Update load phases in real-time and generate a professional PDF invoice with one click.',
            },
          ].map(({ step, title, desc }) => (
            <div key={step} className="relative flex flex-col items-center text-center sm:items-start sm:text-left p-6 rounded-2xl border border-white/5 bg-white/[0.02]">
              <div className="text-5xl font-black text-white/5 absolute top-4 right-4 leading-none select-none">{step}</div>
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold text-sm mb-4 shadow-lg shadow-blue-600/30">
                {step}
              </div>
              <h3 className="text-white font-bold text-lg mb-2">{title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── FINAL CTA ────────────────────────────────────────────────────── */}
      <section className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-indigo-600/20 rounded-3xl blur-2xl" />
            <div className="relative border border-white/10 bg-[#131f30]/60 rounded-3xl p-10 sm:p-16">
              <div className="flex justify-center mb-6">
                <PayloadLogicLogo variant="icon" iconSize={64} className="shadow-2xl shadow-[#ffbe24]/20" />
              </div>
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">
                Ready to run smarter loads?
              </h2>
              <p className="text-slate-400 text-base sm:text-lg mb-8 max-w-xl mx-auto">
                Join owner-operators who use PayloadLogic to track every mile and maximize every dollar.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link
                  href="/pricing"
                  id="footer-cta-pricing"
                  className="group inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-base shadow-2xl shadow-blue-600/30 transition-all hover:-translate-y-1"
                >
                  View Pricing
                  <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </Link>
                <button
                  type="button"
                  id="footer-cta-app"
                  onClick={openPrivateTestingModal}
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-white font-semibold text-base transition-all cursor-pointer"
                >
                  Open App Free
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/10 py-8 px-4 sm:px-6 lg:px-8 bg-[#090e17]">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <Link href="/" className="hover:opacity-90 transition-opacity">
            <PayloadLogicLogo variant="compact" iconSize={26} />
          </Link>
          <div className="flex items-center gap-6 text-xs text-slate-500">
            <Link href="/help" className="hover:text-slate-400 transition-colors">Help</Link>
            <Link href="/pricing" className="hover:text-slate-400 transition-colors">Pricing</Link>
            <Link href="/privacy-policy" className="hover:text-slate-400 transition-colors">Privacy</Link>
            <Link href="/terms-of-service" className="hover:text-slate-400 transition-colors">Terms</Link>
            <span>© {new Date().getFullYear()} PayloadLogic</span>
          </div>
        </div>
      </footer>

      {/* ── PRIVATE TESTING LOCKDOWN MODAL ──────────────────────────────── */}
      <PrivateTestingModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        title="PayloadLogic Private Access"
      />

    </div>
  );
}
