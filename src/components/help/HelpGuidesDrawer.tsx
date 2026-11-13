'use client';

import React, { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  HelpCircle,
  Sparkles,
  Truck,
  Users,
  DollarSign,
  Package,
  Route,
  Receipt,
  CheckCircle2,
  ArrowRight,
  ExternalLink,
  ChevronRight,
  BookOpen,
  Info,
  Mail,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { cn } from '@/lib/utils';
import { SUPPORT_EMAIL } from '@/lib/support';

interface HelpGuidesDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  initialTopic?: string;
}

type GuideTopic = {
  id: string;
  title: string;
  badge?: string;
  icon: React.ComponentType<{ className?: string }>;
  tagline: string;
  steps: {
    num: number;
    title: string;
    description: string;
    tip?: string;
  }[];
  quickAction?: {
    label: string;
    action: () => void;
  };
};

export function HelpGuidesDrawer({ isOpen, onClose, initialTopic = 'setup' }: HelpGuidesDrawerProps) {
  const { setActiveTab, setFleetSubTab, openFleetFinancialSetup } = useApp();
  const [selectedTopic, setSelectedTopic] = useState<string>(initialTopic);

  const GUIDES: GuideTopic[] = [
    {
      id: 'setup',
      title: 'Initial Setup',
      badge: 'Start Here',
      icon: Sparkles,
      tagline: 'Get your account rolling in under 5 minutes.',
      quickAction: {
        label: 'Open Fleet Setup',
        action: () => {
          onClose();
          openFleetFinancialSetup();
        },
      },
      steps: [
        {
          num: 1,
          title: 'Register Your Power Unit (Truck)',
          description: 'Go to Drivers & Fleet and add your truck. Enter your monthly note/lease, insurance, and fuel MPG.',
          tip: 'PayloadLogic uses these fixed costs to calculate your exact break-even Cost-Per-Mile (CPM).',
        },
        {
          num: 2,
          title: 'Add Your Driver Profile',
          description: 'In Drivers & Fleet → Drivers tab, enter your driver name and choose their pay model (percentage of gross, hourly, or per-mile).',
          tip: 'You can generate a mobile driver invite link so drivers can upload signed BOLs and PODs from the road.',
        },
        {
          num: 3,
          title: 'Set Your Daily Profit Target',
          description: 'Set your target net profit per operating day in Fleet Financial Setup or System Settings (default: $300/day).',
          tip: 'When you build loads, the Rate Calculator guarantees every rate quote covers all costs and hits this target.',
        },
        {
          num: 4,
          title: 'Save Frequent Shippers & Brokers',
          description: 'In Client Management, save your regular shippers or brokers to start new loads with one click.',
        },
        {
          num: 5,
          title: 'Book & Dispatch Your First Load',
          description: 'Head to Load Management to price your cargo, generate instant digital BOLs, and dispatch your driver.',
        },
      ],
    },
    {
      id: 'load',
      title: 'Creating a Load',
      icon: Package,
      tagline: 'Price, calculate margins, and dispatch a single load.',
      quickAction: {
        label: 'Create a Load',
        action: () => {
          onClose();
          setActiveTab('loads');
        },
      },
      steps: [
        {
          num: 1,
          title: 'Start Load Creation',
          description: 'Click "Create Load" on the Dashboard or in the Load Management section.',
        },
        {
          num: 2,
          title: 'Enter Route & Shipper Details',
          description: 'Pick an existing client (or type in a new company name) and enter pickup and delivery addresses.',
        },
        {
          num: 3,
          title: 'Input Cargo Specs & Agreed Rate',
          description: 'Enter your freight weight (lbs), length (ft), commodity description, and total agreed broker rate ($).',
        },
        {
          num: 4,
          title: 'Review the Rate Calculator',
          description: 'Check the real-time profit gauge. See your estimated fuel cost, driver pay, operating overhead, and net business profit before you commit.',
          tip: 'The safety buffer prevents unexpected deadhead or detention costs from wiping out your margin.',
        },
        {
          num: 5,
          title: 'Select Fleet Assignment & Save',
          description: 'Choose "Create as Independent Load" for a dedicated single-cargo run, assign your truck and driver, and click Save Load.',
          tip: 'PayloadLogic automatically generates your rate confirmation, invoice, and bill of lading (BOL).',
        },
      ],
    },
    {
      id: 'multistop',
      title: 'Multi-Stop Trips',
      badge: 'Maximize Profit',
      icon: Route,
      tagline: 'Co-load cargo and consolidate multiple shipments on one trailer.',
      quickAction: {
        label: 'View Active Trips',
        action: () => {
          onClose();
          setActiveTab('loads');
        },
      },
      steps: [
        {
          num: 1,
          title: 'Start a New Trip on Your First Load',
          description: 'When building your first load in Load Management, scroll down to Fleet Assignment and select "Start New Multi-Stop Trip".',
        },
        {
          num: 2,
          title: 'Assign Your Equipment Once',
          description: 'Pick the Truck, Trailer, and Driver that will run the entire consolidated route. Save the load.',
          tip: 'This establishes your trip route container named after your equipment.',
        },
        {
          num: 3,
          title: 'Add Subsequent Loads to the Trip',
          description: 'When creating another load heading in the same direction, choose "Add to Existing Trip" and select that active trip.',
        },
        {
          num: 4,
          title: 'Monitor Deck Space & Weight Limits',
          description: 'Watch the real-time Deck Utilization and Weight Gauges. PayloadLogic ensures your cargo fits within legal axle and trailer footage limits.',
        },
        {
          num: 5,
          title: 'Generate Consolidated Manifests',
          description: 'Track all pickup and drop stops on one interactive map with unified route mileage and maximized revenue per mile.',
        },
      ],
    },
    {
      id: 'fleet',
      title: 'Trucks, Trailers & Drivers',
      icon: Truck,
      tagline: 'Manage assets, payload dimensions, and driver accounts.',
      quickAction: {
        label: 'Open Fleet Roster',
        action: () => {
          onClose();
          setActiveTab('drivers');
        },
      },
      steps: [
        {
          num: 1,
          title: 'Adding a Power Unit (Truck)',
          description: 'In Drivers & Fleet, select "Truck (Power Unit)". Enter your Unit #, monthly loan/lease, insurance, and fuel efficiency (MPG).',
          tip: 'Starter includes 1 truck; Fleet Pro includes 3 base trucks (+$25/mo per extra rig).',
        },
        {
          num: 2,
          title: 'Adding a Towed Unit (Trailer)',
          description: 'Select "Trailer (Towed Unit)". Enter deck length (e.g. 40 ft), deck height, tare empty weight, and GVWR.',
          tip: 'Trailers are unlimited on all plans. PayloadLogic uses trailer tare and GVWR to prevent overweight citations.',
        },
        {
          num: 3,
          title: 'Setting Up Driver Profiles',
          description: 'Switch to the "Drivers" tab and click "Add New Driver". Enter driver contact info, license class (CDL or Non-CDL), and pay rate.',
        },
        {
          num: 4,
          title: 'Driver Pay Models',
          description: 'Choose between Percentage of Gross (e.g. 25%), Per-Mile (e.g. $0.60/mi), or Hourly rate.',
        },
        {
          num: 5,
          title: 'Driver Mobile Invite Link',
          description: 'Enter the driver\'s email and click "Save & Send Driver Invite" to give them secure mobile access to upload signed PODs and update transit status.',
        },
      ],
    },
    {
      id: 'expenses',
      title: 'Logging Expenses',
      icon: Receipt,
      tagline: 'Keep business overhead and fuel receipts accurate.',
      quickAction: {
        label: 'Log an Expense',
        action: () => {
          onClose();
          setActiveTab('expenses');
        },
      },
      steps: [
        {
          num: 1,
          title: 'Open Expense Form',
          description: 'Click "Add Expense" from Expense Tracking or the quick-action button on the Dashboard.',
        },
        {
          num: 2,
          title: 'Select Date & Category',
          description: 'Pick the expense category (Fuel, DEF, Maintenance, Tolls, Hotel, Scales, Equipment, Permits, or Other).',
        },
        {
          num: 3,
          title: 'Enter Amount & Notes',
          description: 'Input the total expense amount. Add notes like station name or gallons purchased for easy tax records.',
        },
        {
          num: 4,
          title: 'Link to a Load (Optional)',
          description: 'If the cost was incurred during a specific run, link it to that load. This calculates exact net profit per load.',
          tip: 'General overhead (insurance, shop supplies) can be left unlinked.',
        },
        {
          num: 5,
          title: 'Save to Update Net Profit',
          description: 'Saved expenses immediately update your monthly net profit and expense breakdown charts on the Dashboard.',
        },
      ],
    },
  ];

  const currentGuide = GUIDES.find(g => g.id === selectedTopic) || GUIDES[0];

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-xl p-0 flex flex-col bg-white overflow-hidden">
        {/* Header */}
        <SheetHeader className="p-5 sm:p-6 pb-4 bg-gradient-to-r from-slate-900 via-slate-800 to-blue-950 text-white shrink-0">
          <div className="flex items-center gap-2 mb-1">
            <div className="h-8 w-8 rounded-lg bg-blue-500/20 text-blue-400 border border-blue-400/30 flex items-center justify-center shrink-0">
              <HelpCircle className="h-4 w-4" />
            </div>
            <Badge className="bg-blue-500/20 text-blue-300 border border-blue-400/30 text-[10px] font-bold">
              PayloadLogic Help &amp; Guides
            </Badge>
          </div>
          <SheetTitle className="text-xl font-bold font-headline text-white tracking-tight">
            Dispatcher Quick-Start &amp; Help
          </SheetTitle>
          <SheetDescription className="text-xs text-slate-300">
            Action-oriented guides written for owner-operators and hotshot dispatchers.
          </SheetDescription>
        </SheetHeader>

        {/* Topic Selector Tabs */}
        <div className="flex items-center gap-1.5 p-2 bg-slate-100 border-b border-slate-200 overflow-x-auto shrink-0 no-scrollbar">
          {GUIDES.map((guide) => {
            const Icon = guide.icon;
            const isSelected = guide.id === selectedTopic;
            return (
              <button
                key={guide.id}
                type="button"
                onClick={() => setSelectedTopic(guide.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all shrink-0",
                  isSelected
                    ? "bg-white text-blue-700 shadow-xs border border-slate-200"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
                )}
              >
                <Icon className={cn("h-3.5 w-3.5", isSelected ? "text-blue-600" : "text-slate-500")} />
                <span>{guide.title}</span>
                {guide.badge && (
                  <span className={cn(
                    "text-[9px] px-1.5 py-0.2 rounded font-bold uppercase",
                    isSelected ? "bg-blue-100 text-blue-800" : "bg-slate-200 text-slate-700"
                  )}>
                    {guide.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Guide Content Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          {/* Active Guide Header Banner */}
          <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-100/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 text-sm font-headline">{currentGuide.title}</span>
                {currentGuide.badge && (
                  <Badge variant="outline" className="text-[10px] font-semibold bg-white text-blue-700 border-blue-200">
                    {currentGuide.badge}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-slate-600 mt-0.5">{currentGuide.tagline}</p>
            </div>

            {currentGuide.quickAction && (
              <Button
                size="sm"
                onClick={currentGuide.quickAction.action}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs h-8 px-3 gap-1 shrink-0 shadow-xs"
              >
                <span>{currentGuide.quickAction.label}</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>

          {/* Numbered Steps */}
          <div className="space-y-3.5">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Action Steps
            </h4>

            <div className="space-y-3">
              {currentGuide.steps.map((step) => (
                <div
                  key={step.num}
                  className="p-3.5 rounded-xl border border-slate-200/90 bg-white hover:border-slate-300 transition-colors shadow-2xs flex gap-3.5"
                >
                  <div className="h-7 w-7 rounded-lg bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                    {step.num}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <h5 className="text-xs font-bold text-slate-900 leading-snug">{step.title}</h5>
                    <p className="text-xs text-slate-600 leading-relaxed">{step.description}</p>
                    {step.tip && (
                      <div className="mt-1.5 p-2 rounded-lg bg-amber-50/80 border border-amber-200/70 text-[11px] text-amber-900 flex items-start gap-1.5">
                        <Info className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                        <span><strong>Pro-Tip:</strong> {step.tip}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Support Contact Line */}
          <div className="p-3.5 rounded-xl border border-blue-200 bg-blue-50/80 text-blue-900 text-xs flex items-center justify-between gap-3 shadow-2xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <Mail className="h-4 w-4 text-blue-700 shrink-0" />
              <div className="min-w-0">
                <span className="font-bold block text-xs text-blue-950">Need 1-on-1 dispatcher support?</span>
                <span className="text-[11px] text-blue-800/80 truncate block">
                  Questions about rates, trailer specs, or fleet setups.
                </span>
              </div>
            </div>
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="inline-flex items-center px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shrink-0 transition-colors shadow-2xs"
            >
              Contact Support
            </a>
          </div>

          {/* Bottom Dispatch Help Note */}
          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-600 text-xs space-y-1">
            <div className="font-semibold text-slate-800 flex items-center gap-1.5">
              <BookOpen className="h-4 w-4 text-blue-600" />
              Dispatch Assistance &amp; Terms
            </div>
            <p className="text-[11px] leading-relaxed text-slate-500">
              PayloadLogic automatically stores all bills of lading (BOL), expenses, and driver records securely in your cloud workspace. You can revisit these guides at any time.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            <span>Support:</span>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-blue-600 hover:underline font-medium">
              {SUPPORT_EMAIL}
            </a>
          </div>
          <Button variant="outline" size="sm" onClick={onClose} className="text-xs h-8">
            Close Help
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
