export interface HelpTopic {
  id: string;
  category: string;
  title: string;
  summary: string;
  details: string[];
  steps?: string[];
  tips?: string[];
}

export const HELP_KNOWLEDGE_BASE: HelpTopic[] = [
  {
    id: 'creating-dispatching-loads',
    category: 'Loads & Dispatch',
    title: 'Creating and Dispatching Loads',
    summary: 'How to enter load details, calculate rates, and assign equipment and drivers.',
    details: [
      'Enter origin, destination, deadhead miles, cargo dimensions, weight, freight rate, and rate-per-mile.',
      'The platform automatically computes total trip mileage, estimated fuel consumption, and net profit.',
      'Assign an active power unit (truck), trailer, and driver from your company roster.',
      'Dispatch confirmation notifies the assigned driver and locks in the trip manifest.',
    ],
    steps: [
      'Navigate to the Loads tab or click "+ Create Load".',
      'Fill in the Pickup and Delivery addresses with scheduled appointment windows.',
      'Input the cargo weight, length, and cargo type (e.g., machinery, pipe, building materials).',
      'Specify the negotiated rate (gross pay) to see instant rate-per-mile metrics.',
      'Select an available truck, trailer, and driver, then click "Confirm & Dispatch".',
    ],
    tips: [
      'Enter accurate deadhead miles from the driver\'s current location for precise net profit numbers.',
      'You can mark a load as partial freight to enable deck space stacking.',
    ],
  },
  {
    id: 'deck-space-gcwr',
    category: 'Deck Planning & Compliance',
    title: 'Deck Space Consolidation & GCWR Rules',
    summary: 'Consolidating multiple partial loads on up to 40ft flatbeds while adhering to weight and GCWR legal limits.',
    details: [
      'Designed specifically for hotshot flatbed and gooseneck trailers (up to 40ft).',
      'The visual deck planning tool allows dispatchers to arrange multiple partial shipments along the trailer deck.',
      'The automated GCWR (Gross Combined Weight Rating) checker computes combined truck weight, trailer tare, and cargo weights.',
      'Alerts you immediately if a load combination exceeds trailer deck length or axle/gross legal weight thresholds before you roll.',
    ],
    steps: [
      'Open the Command Center or Deck Planning view.',
      'Select your active trailer to view available deck space in feet.',
      'Add partial loads: each cargo piece appears with its length, weight, and position on the deck.',
      'Verify that the green GCWR Compliance Badge is active before confirming the combined dispatch.',
    ],
    tips: [
      'Keep heavy items centered over the trailer axle group to balance tongue weight.',
      'Stack compatible crated freight to save linear trailer feet.',
    ],
  },
  {
    id: 'daily-profit-goal',
    category: 'Financials & Goals',
    title: 'Daily Profit Goal (Target Daily Business Profit)',
    summary: 'Setting and using your daily profit target to calculate minimum booking rates and project earnings.',
    details: [
      'PayloadLogic has a "Target Daily Business Profit" field that lets you set a daily net profit goal (e.g., $300/day).',
      'This goal is set during the initial Fleet Financial Setup (a required onboarding step) and can be updated any time in Settings.',
      'Once set, the platform uses your daily profit goal to calculate the minimum rate you need to book per load to hit your target.',
      'The Profit Engine and Suggested Rate features factor your daily goal into every load estimate.',
      'Your daily profit goal appears on the dashboard as a progress tracker showing how close you are to your target each day.',
      'To make $300/day in net profit, set your Target Daily Business Profit to 300 in the setup modal or Settings. Then use the Suggested Rate engine to book loads at or above the minimum rate it recommends.',
    ],
    steps: [
      'During first login, the Fleet Financial Setup modal will appear — enter your daily profit goal (e.g., 300 for $300/day).',
      'To update it later: click "Settings" in the main navigation, then look for the "Target Daily Business Profit" field.',
      'You can also update it from the Fleet Financial Setup panel by clicking the "Settings" button inside the setup checklist.',
      'Enter your desired daily net profit amount in dollars and click "Save Goal" or "Update Goal".',
      'The dashboard and load profit engine will immediately reflect the new target.',
    ],
    tips: [
      'Set your daily profit goal based on your real operating costs (fuel, insurance, truck payment, driver pay) — not just gross revenue.',
      'If you need $300/day net profit and your CPM is $1.20, you need to run at least 250 loaded miles per day at minimum.',
      'Use the Profit Engine on each load to see if the booked rate meets your daily goal.',
    ],
  },
  {
    id: 'profit-cpm-tracking',
    category: 'Financials & CPM',
    title: 'Real-Time Profit Tracking & Cost-Per-Mile (CPM)',
    summary: 'Calculating true net profit per load after fuel, DEF, driver pay, maintenance, and overhead.',
    details: [
      'Tracks net profit, not just gross rate. Factored expenses include live fuel costs, DEF, tolls, driver pay, and operating overhead.',
      'Calculates Cost-Per-Mile (CPM) for both loaded and empty (deadhead) miles.',
      'Supports percentage-based driver compensation (e.g., 25% of gross) or flat per-mile driver pay.',
      'Provides an instant profit breakdown with margin percentage before and after load completion.',
    ],
    steps: [
      'Open any load card or click "Profit Engine".',
      'Review the automated estimate based on route mileage and fuel averages.',
      'Drivers can log real-time receipt expenses (fuel, tolls, scales) from the road.',
      'Once delivered, the final P&L report shows your exact net take-home dollar amount.',
    ],
    tips: [
      'Track your baseline fleet CPM in Settings to ensure every quoted load meets your minimum profit hurdle.',
    ],
  },
  {
    id: 'driver-roster-compliance',
    category: 'Fleet & Drivers',
    title: 'Driver Roster & Compliance Alerts',
    summary: 'Managing driver profiles, CDL / Medical card expirations, and equipment assignments.',
    details: [
      'Maintain an active roster of company drivers and owner-operator contractors.',
      'Track driver CDL license numbers, state of issue, and Medical Examiner Certificate expiration dates.',
      'Proactive warnings trigger 30 days and 14 days before a medical card or CDL expires.',
      'Assign dedicated power units and trailers to drivers for one-tap dispatching.',
    ],
    steps: [
      'Go to the Fleet & Drivers tab.',
      'Click "Add Driver" and enter their full name, email, phone number, and license details.',
      'Input the expiration date for their CDL and Medical Card.',
      'Pair the driver with their primary truck and trailer unit.',
    ],
    tips: [
      'Driver accounts access the specialized Driver Cab Dashboard with turn-by-turn routing and ePOD sign-off.',
    ],
  },
  {
    id: 'load-status-tracking',
    category: 'Operations & Tracking',
    title: 'Real-Time Load Status Tracking & Staging',
    summary: 'Tracking operational phases from dispatch to delivery and syncing driver staging locations.',
    details: [
      'Standard hotshot phases: Dispatched, En Route to Pickup, Loaded, En Route to Delivery, Delivered / Completed.',
      'Drivers update status with one tap on their mobile cab view.',
      'When a load is marked "Delivered / Completed", the system automatically updates the driver\'s current staging location to the delivery city and state.',
      'Google Maps telemetry shows live driver positioning alongside active load waypoints.',
    ],
    steps: [
      'Monitor dispatches in the Live Operations Command Center.',
      'Drivers tap their active phase button on the mobile dashboard as milestones are reached.',
      'Upon final delivery, the driver collects ePOD signatures/photos and marks the load completed.',
    ],
    tips: [
      'The driver\'s updated staging location immediately reflects on the Fleet Map to assist dispatchers with finding backhauls.',
    ],
  },
  {
    id: 'invoicing-documents',
    category: 'Billing & Documents',
    title: 'Invoicing & Document Management',
    summary: 'Generating professional PDF invoices, electronic Bill of Lading (BOL), and proof-of-delivery (ePOD).',
    details: [
      'Generate professional PDF invoices with one click as soon as a load is marked delivered.',
      'Captures digital receiver signatures, printed names, and delivery cargo photos directly on the driver\'s phone.',
      'Automated rate confirmation and BOL archiving attached directly to the load record.',
      'Email invoices directly to shippers and factoring companies with signed ePODs attached.',
    ],
    steps: [
      'From the Loads tab, select a completed load.',
      'Click "Generate Invoice" to produce a standardized, itemized PDF bill.',
      'Click "View ePOD / BOL" to inspect receiver signatures and delivery timestamp proofs.',
      'Download or share the PDF packet with your factoring partner or broker.',
    ],
    tips: [
      'Always have the consignee inspect cargo and sign the ePOD before releasing equipment.',
    ],
  },
  {
    id: 'account-fleet-settings',
    category: 'Settings & Administration',
    title: 'Account, Fleet & Billing Settings',
    summary: 'Configuring company info, USDOT/MC numbers, power units, trailers, and subscription plans.',
    details: [
      'Manage company details, carrier name, phone number, and physical staging yard address.',
      'Record official USDOT and MC numbers for FMCSA compliance checks.',
      'Add and configure power units (Class 3-8 trucks) with VIN, license plate, and GVWR specs.',
      'Manage subscription plans (Starter vs Fleet Pro) and additional truck add-ons with monthly, biannual, or annual billing.',
      'The Target Daily Business Profit (daily profit goal) is also editable in Settings — look for the profit goal field and update it any time.',
    ],
    steps: [
      'Click "Settings" in the main navigation menu.',
      'Under "Company Profile", update your operating carrier name and contact email.',
      'Under "Power Units & Trailers", register equipment specifications for accurate GCWR calculations.',
      'Under "Billing & Subscription", select or switch subscription tiers and manage billing cycles.',
      'To update your daily profit goal, find the "Target Daily Business Profit" field in Settings and enter your desired daily net profit amount.',
    ],
    tips: [
      'Starter plan includes 1 power unit and 1 driver login; Fleet Pro unlocks unlimited power units and team dispatching.',
    ],
  },
  {
    id: 'address-autofill',
    category: 'Loads & Dispatch',
    title: 'Address Auto-Fill (Origin & Destination)',
    summary: 'Paste a full single-line or multi-line address block to fill Street, City, State, ZIP, and Phone automatically.',
    details: [
      'Works on both Origin (Pickup) and Destination (Delivery) sections on the Create Load form.',
      'Supports single-line addresses (e.g. "1858 E. Pike Street Clarksburg, WV 26301, (304) 624-6304") and multi-line address blocks.',
      'All auto-filled fields stay completely editable after filling.',
    ],
    steps: [
      'Paste a full address directly into the Street Address field, or click "Paste Address", paste the block, and click "Fill Fields".',
      'Review the auto-filled Street, City, State, ZIP, and Contact Phone fields and edit if needed.',
    ],
  },
  {
    id: 'same-vehicle-trips-driver-view',
    category: 'Operations & Tracking',
    title: 'Same-Vehicle Multi-Stop Trips & Driver View',
    summary: 'Grouping multiple loads on the same truck in deck order (First Off / Last Off) with combined navigation and POD capture.',
    details: [
      'Multiple loads assigned to the same truck or driver are grouped into one sequenced trip in both Dispatcher and Driver Views.',
      'Deck order (First Off / Last Off) sequences pickups and deliveries while each load keeps its own independent status.',
      'Drivers see one combined navigation route across all stops and are only prompted to upload a signed BOL/POD at destination/delivery (with Take Photo as the primary option).',
    ],
    steps: [
      'Assign multiple loads to the same truck/driver or multi-stop trip and set First Off / Last Off order.',
      'In Driver View, tap status updates per stop, use the combined route navigation, and tap "Take Photo" (or upload a file) to submit the signed POD at delivery.',
    ],
  },
  {
    id: 'completed-archive-paperwork',
    category: 'Loads & Documents',
    title: 'Completed Loads Archive, Export & Pending Paperwork',
    summary: 'Finding older completed loads, exporting CSV/PDF tax records, and clearing "Awaiting POD" alerts.',
    details: [
      'The main Loads page shows only the most recent 12 completed loads from the last 7 days so the screen stays uncluttered.',
      'All older completed loads are preserved in the Archive tab ("View All Completed") with filters for Month, Date Range, Client, and Load ID, plus CSV and PDF export.',
      'If any delivered load is awaiting a signed POD (or missing a Broker BOL), Overview displays it under Needs Attention instead of "You’re all caught up" until the document is uploaded.',
    ],
    steps: [
      'Click "View All Completed" or the "Archive" tab on the Loads page to filter historical loads and export CSV or PDF records.',
      'To clear an "Awaiting POD" alert on Overview, click "Upload POD" on the alert (or load card) and attach the signed POD.',
    ],
  },
  {
    id: 'ai-assistant-beta-access',
    category: 'Support & Access',
    title: 'AI Help Assistant & Private Beta Access',
    summary: 'Getting instant help with the AI Assistant and understanding private beta login restrictions.',
    details: [
      'Drivers and dispatchers can use the AI Help Assistant on the Help & Guides page (/help) or open Help & Quick Guides from the navigation menu anytime.',
      'During private beta testing, public signup and login are restricted to authorized accounts. Unapproved emails see a "Private beta – access restricted" notice.',
    ],
    steps: [
      'Visit /help to ask the AI Help Assistant questions or browse platform guides.',
      'Sign in with an approved beta email address to access the dashboard.',
    ],
  },
];

export const STARTER_HELP_QUESTIONS = [
  'How do I create a new load?',
  'How do I set a daily profit goal?',
  'How is profit calculated on a load?',
  'How does deck space consolidation work?',
  'How do I add a driver to my roster?',
  'How do I track real-time load status?',
  'What does the GCWR compliance check do?',
  'How do I generate an invoice?',
];

export function getKnowledgeBaseContextString(): string {
  return HELP_KNOWLEDGE_BASE.map(topic => `
=== TOPIC: ${topic.title} (${topic.category}) ===
Summary: ${topic.summary}
Key Details:
${topic.details.map(d => `- ${d}`).join('\n')}
${topic.steps ? `In-App Steps:\n${topic.steps.map((s, idx) => `${idx + 1}. ${s}`).join('\n')}` : ''}
${topic.tips ? `Best Practice Tips:\n${topic.tips.map(t => `- ${t}`).join('\n')}` : ''}
`).join('\n\n');
}

/**
 * Intelligent knowledge base fallback when AI services are unreachable or timing out.
 * Returns a high quality structured answer based on the knowledge base instead of generic error text.
 */
export function findKnowledgeBaseFallback(query: string): string | null {
  const q = query.toLowerCase().trim();

  // 1. Support & Contact
  if (
    q.includes('support') ||
    q.includes('contact') ||
    q.includes('email') ||
    q.includes('reach out') ||
    q.includes('help desk') ||
    q.includes('phone')
  ) {
    return `You can reach the PayloadLogic support team by emailing **support@payloadlogic.app**.

**Support Hours & Response Times:**
- Active Hours: Monday – Friday, 8:00 AM – 7:00 PM EST
- Target Response: Within 1 business day for all active trial and subscribed fleets.

Feel free to include your carrier name or USDOT number in the email for faster service.`;
  }

  // 2. Daily Profit Goal / Revenue Target
  if (
    q.includes('profit goal') ||
    q.includes('daily profit') ||
    q.includes('revenue goal') ||
    q.includes('target profit') ||
    q.includes('target daily') ||
    q.includes('daily target')
  ) {
    const topic = HELP_KNOWLEDGE_BASE.find(t => t.id === 'daily-profit-goal');
    if (topic) {
      return `**${topic.title}**

${topic.summary}

**How to set or update it:**
${topic.steps?.map((s, i) => `${i + 1}. ${s}`).join('\n')}

**Key Details:**
${topic.details.map(d => `• ${d}`).join('\n')}

💡 *Tip: ${topic.tips?.[0] || 'Keep your daily profit goal aligned with your true operating expenses.'}*`;
    }
  }

  // 3. Creating / Dispatching Loads
  if (
    q.includes('create') && (q.includes('load') || q.includes('freight') || q.includes('shipment')) ||
    q.includes('new load') ||
    q.includes('dispatch') ||
    q.includes('add a load')
  ) {
    const topic = HELP_KNOWLEDGE_BASE.find(t => t.id === 'creating-dispatching-loads');
    if (topic) {
      return `**${topic.title}**

${topic.summary}

**Step-by-step instructions:**
${topic.steps?.map((s, i) => `${i + 1}. ${s}`).join('\n')}

**Key Details:**
${topic.details.map(d => `• ${d}`).join('\n')}

💡 *Tip: ${topic.tips?.[0] || 'Enter accurate deadhead miles for precise net profit.'}*`;
    }
  }

  // 4. Deck Space Consolidation & GCWR
  if (
    q.includes('deck') ||
    q.includes('gcwr') ||
    q.includes('weight limit') ||
    q.includes('consolidation') ||
    q.includes('flatbed') ||
    q.includes('gross combined')
  ) {
    const topic = HELP_KNOWLEDGE_BASE.find(t => t.id === 'deck-space-gcwr');
    if (topic) {
      return `**${topic.title}**

${topic.summary}

**How to use it:**
${topic.steps?.map((s, i) => `${i + 1}. ${s}`).join('\n')}

**Key Details:**
${topic.details.map(d => `• ${d}`).join('\n')}

💡 *Tip: ${topic.tips?.[0] || 'Keep heavy cargo centered over trailer axle groups.'}*`;
    }
  }

  // 5. Profit & CPM Tracking
  if (
    q.includes('cpm') ||
    q.includes('cost per mile') ||
    q.includes('profit track') ||
    q.includes('net profit') ||
    q.includes('calculate profit') ||
    q.includes('fuel cost')
  ) {
    const topic = HELP_KNOWLEDGE_BASE.find(t => t.id === 'profit-cpm-tracking');
    if (topic) {
      return `**${topic.title}**

${topic.summary}

**How it works:**
${topic.steps?.map((s, i) => `${i + 1}. ${s}`).join('\n')}

**Key Details:**
${topic.details.map(d => `• ${d}`).join('\n')}`;
    }
  }

  // 6. Drivers & Compliance
  if (
    q.includes('driver') ||
    q.includes('cdl') ||
    q.includes('medical card') ||
    q.includes('roster')
  ) {
    const topic = HELP_KNOWLEDGE_BASE.find(t => t.id === 'driver-roster-compliance');
    if (topic) {
      return `**${topic.title}**

${topic.summary}

**Steps to manage drivers:**
${topic.steps?.map((s, i) => `${i + 1}. ${s}`).join('\n')}

**Key Details:**
${topic.details.map(d => `• ${d}`).join('\n')}`;
    }
  }

  // 7. Invoices, BOL & ePOD
  if (
    q.includes('invoice') ||
    q.includes('bol') ||
    q.includes('epod') ||
    q.includes('bill of lading') ||
    q.includes('proof of delivery')
  ) {
    const topic = HELP_KNOWLEDGE_BASE.find(t => t.id === 'invoicing-documents');
    if (topic) {
      return `**${topic.title}**

${topic.summary}

**Steps:**
${topic.steps?.map((s, i) => `${i + 1}. ${s}`).join('\n')}

**Key Details:**
${topic.details.map(d => `• ${d}`).join('\n')}`;
    }
  }

  // 8. General Settings & Account
  if (
    q.includes('setting') ||
    q.includes('subscription') ||
    q.includes('plan') ||
    q.includes('usdot') ||
    q.includes('mc number')
  ) {
    const topic = HELP_KNOWLEDGE_BASE.find(t => t.id === 'account-fleet-settings');
    if (topic) {
      return `**${topic.title}**

${topic.summary}

**Instructions:**
${topic.steps?.map((s, i) => `${i + 1}. ${s}`).join('\n')}`;
    }
  }

  return null;
}

