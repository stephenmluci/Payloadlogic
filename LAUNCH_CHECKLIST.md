# PayloadLogic — Production Launch Readiness Checklist

**Application:** PayloadLogic (Hotshot Trucking Dispatch & Management SaaS)  
**Target Architecture:** Next.js (App Router) + Firebase (Auth, Firestore, App Hosting) + Stripe Billing  
**Last Audited:** November 2026

---

## Executive Summary & Status Overview

| Category | Status | Automated In-App Code | Production Setup Remaining |
| :--- | :---: | :---: | :--- |
| **Auth & Onboarding** | ✅ Ready | Complete (USDOT required, real carrier lookup, trial gate) | Deploy Firestore rules |
| **Trial & DOT Anti-Abuse** | ✅ Ready | 14-day server trial, SAFER/FMCSA live lookup, unique DOT ledger | Deploy Firestore rules |
| **Billing & Subscriptions** | 🟡 Ready for Keys | Complete (Monthly / 6-Mo / Annual, savings callouts, checkout/portal) | Create 6 Stripe prices & add webhook |
| **Plan Limit Enforcement** | ✅ Ready | Dual UI + save-path enforcement (Starter: 1 truck/driver; Pro: 3 trucks base) | Fully wired & tested |
| **Core Product Workflows** | ✅ Ready | Loads, multi-stop trips, fleet, clients, expenses, command center | Fully wired & tested |
| **Legal & Compliance** | ✅ Ready | Terms of Service, Privacy Policy, signup agreement checkboxes | Clean & live at `/terms-of-service` & `/privacy-policy` |
| **Security & Secrets** | 🟡 Manual Step | No secrets in client bundles; Admin SDK server routes protected | Provision service account & App Hosting secrets |
| **Branding & Consistency** | ✅ Ready | Clean PayloadLogic naming across shell, auth, billing, and footer | Verified |

---

## 1. Must Fix / Complete Before Launch (Critical Blockers)

These items are mandatory to accept public paying traffic safely without financial leakage or security issues.

### 1.1 Stripe Production Setup
- [ ] **[MANUAL SETUP REQUIRED] Create Products in Stripe Dashboard**
  - Product 1: `PayloadLogic Starter Plan`
  - Product 2: `PayloadLogic Fleet Pro Plan`
- [ ] **[MANUAL SETUP REQUIRED] Create 6 Recurring Stripe Price IDs**
  - `STRIPE_PRICE_STARTER_MONTHLY` ($49.00 / month)
  - `STRIPE_PRICE_STARTER_SIX_MONTH` ($264.60 / 6 months &mdash; `interval: month`, `interval_count: 6`)
  - `STRIPE_PRICE_STARTER_ANNUAL` ($470.40 / year &mdash; `interval: year`, `interval_count: 1`)
  - `STRIPE_PRICE_FLEET_PRO_MONTHLY` ($99.00 / month)
  - `STRIPE_PRICE_FLEET_PRO_SIX_MONTH` ($534.60 / 6 months &mdash; `interval: month`, `interval_count: 6`)
  - `STRIPE_PRICE_FLEET_PRO_ANNUAL` ($950.40 / year &mdash; `interval: year`, `interval_count: 1`)
- [ ] **[MANUAL SETUP REQUIRED] Configure Stripe Webhook Endpoint**
  - URL: `https://<your-production-domain>/api/billing/webhook`
  - Events to listen for:
    - `checkout.session.completed`
    - `customer.subscription.created`
    - `customer.subscription.updated`
    - `customer.subscription.deleted`
  - Copy Signing Secret into `STRIPE_WEBHOOK_SECRET`

### 1.2 Firebase & Database Security
- [ ] **[MANUAL SETUP REQUIRED] Deploy Firestore Security Rules**
  - Run: `firebase deploy --only firestore:rules`
  - Confirms rules in `firestore.rules`:
    - Users can only read/write their own account data (`users/{uid}/**`)
    - Trial documents (`trials/{uid}`) are read-only to owners, writable only by Admin SDK
    - Anti-abuse registry (`trialRegistry/{dot}`) is completely private from client access
- [ ] **[MANUAL SETUP REQUIRED] Deploy Storage Security Rules**
  - Run: `firebase deploy --only storage:rules`
  - Ensures receipts, BOLs, and POD signatures cannot be publicly enumerated

### 1.3 Production Environment Variables
- [ ] **[MANUAL SETUP REQUIRED] Set Environment Variables on Firebase App Hosting**
  - Set client env vars (`NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_FIREBASE_*`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`)
  - Set secrets via `firebase apphosting:secrets:set`:
    - `stripe-secret-key` &rarr; mapped to `STRIPE_SECRET_KEY`
    - `stripe-webhook-secret` &rarr; mapped to `STRIPE_WEBHOOK_SECRET`
    - `gemini-api-key` &rarr; mapped to `GEMINI_API_KEY`
    - `vapid-private-key` &rarr; mapped to `VAPID_PRIVATE_KEY`

### 1.4 Google Maps Platform Restrictions
- [ ] **[MANUAL SETUP REQUIRED] Restrict Google Maps API Key in Google Cloud Console**
  - Set Application Restriction: HTTP referrers to your live production domain (e.g. `https://app.payloadlogic.com/*`)
  - Set API Restrictions: Geocoding API, Places API, Directions API, Maps JavaScript API

---

## 2. Should Fix Before Launch (Operational Reliability)

- [x] **[WORKING] Live FMCSA / SAFER Carrier Verification**
  - Live server lookup active via `src/lib/fmcsa.ts` using public SAFER Company Snapshot + optional FMCSA API
  - Form shows verified carrier name & state or graceful unverified fallback
- [x] **[WORKING] 14-Day Free Trial Engine**
  - Server-calculated 14-day duration, minute-timer expiry, and anti-abuse registry
- [x] **[WORKING] Trial Expired Gate**
  - Clean restriction overlay on expiration directing users to choose Starter or Fleet Pro
- [x] **[WORKING] Legal Pages & Signup Checkbox**
  - Terms of Service (`/terms-of-service`) and Privacy Policy (`/privacy-policy`) live with clean formatting
- [x] **[WORKING] Plan Limits & Entitlements Engine**
  - Starter: strictly capped at 1 truck and 1 driver profile across UI modals and save handlers
  - Fleet Pro: includes 3 trucks base with explicit confirmation for +$25/mo overage
  - Evaluation access granted at Fleet Pro tier during active trial
- [x] **[WORKING] First-Run Guidance & In-App Help**
  - 5-step checklist on Dashboard with live progress bar and dismiss/resume state
  - Slide-over "Help & Guides" drawer with 5 action-oriented step-by-step guides
- [ ] **[MANUAL SETUP REQUIRED] Custom Domain & SSL Verification**
  - Connect custom production domain in Firebase App Hosting console
  - Verify DNS A/CNAME records and automated SSL certificate generation

---

## 3. Can Fix / Enhance After Launch (Post-Launch Optimization)

- [ ] **[OPTIONAL] Paid FMCSA QCMobile WebKey**
  - Add optional `FMCSA_WEBKEY` to bypass HTML scraping if higher throughput is needed
- [ ] **[OPTIONAL] Automated Account Deletion Self-Service**
  - Add a "Delete My Account & Fleet Data" button in System Settings (currently handled via support request)
- [ ] **[OPTIONAL] Multi-Currency Support**
  - Currently fixed in USD ($) which covers US interstate/intrastate hotshot carriers
- [ ] **[OPTIONAL] Analytics & Event Tracking**
  - Integrate PostHog, Plausible, or Google Analytics 4 for conversion funnel tracking

---

## 4. Verification Status of Critical App Systems

### 4.1 Auth & Onboarding Flow
| Component | Status | Details |
| :--- | :---: | :--- |
| Email / Password Signup & Login | **Working** | Firebase Auth with password generation and reset links |
| USDOT Mandatory Collection | **Working** | Required on carrier signup; format checked live |
| FMCSA/SAFER Live Verification | **Working** | Real carrier name, operating status, and city/state extracted server-side |
| Unverified Network Fallback | **Working** | If lookup times out, user continues as `valid_unverified` with clear notice |
| One-Trial-Per-DOT Enforcement | **Working** | Atomic transaction against `trialRegistry/{dot}` blocks repeat trials |
| First-Run Setup Checklist | **Working** | Persistent, dismissible 5-step checklist with progress tracking |

### 4.2 Billing & Subscription System
| Component | Status | Details |
| :--- | :---: | :--- |
| Tier Definitions | **Working** | Starter ($49/mo), Fleet Pro ($99/mo base) in `src/lib/pricing.ts` |
| Prepaid Intervals | **Working** | Monthly, 6-Month (10% off), Annual (20% off) |
| Savings Badges | **Working** | Scannable badges on toggle and plan cards (`Save 10%`, `Save 20% · 2+ months free`) |
| Checkout Session Creation | **Working** | Server route `/api/billing/checkout` maps to Stripe Checkout |
| Stripe Customer Portal | **Working** | `/api/billing/portal` opens Stripe self-service management |
| Live Plan Switches | **Working** | Detects active subscriptions and routes to `subscription_update_confirm` (prorated) |
| Fallback / Mock Mode | **Working** | While Stripe keys are absent, plan switching updates Firestore directly |

### 4.3 Plan Enforcement & Gating
| Component | Status | Details |
| :--- | :---: | :--- |
| Starter Truck Limit (1) | **Working** | Blocked in UI + rejected in `addVehicle` with plan upgrade toast |
| Starter Driver Limit (1) | **Working** | Blocked in UI + rejected in `addDriverProfile` |
| Fleet Pro Base Trucks (3) | **Working** | Up to 3 included; 4th truck triggers +$25/mo overage confirmation modal |
| Trial Evaluation Gating | **Working** | Free trial accounts evaluate at Fleet Pro level (capped at 3 trucks, no overage charge) |
| Pro-Only Gated Tabs | **Working** | Driver Command Center & Multi-Truck Settlements gated on Starter |

### 4.4 Core Product Workflows
| Component | Status | Details |
| :--- | :---: | :--- |
| Load Creation & Rates | **Working** | Full deadhead, loaded miles, rate/mile, and rate confirmation extraction |
| Multi-Stop Consolidation | **Working** | Real-time deck space (ft) and weight (lbs) calculations with overload alerts |
| Drivers & Fleet Management | **Working** | Equipment specs, driver pay rates, CDL/Med Card expiry tracking |
| Expense Logging | **Working** | Category selection, load-association, and receipt upload |
| Operational Needs Attention | **Working** | Real-time watchdog for HOS violations, low margin rates, and maintenance |

---

## 5. Production Environment Variables Reference

```bash
# Client Configuration (Bundled with frontend JS)
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSy...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=1:...
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=AIzaSy...
NEXT_PUBLIC_VAPID_PUBLIC_KEY=...
NEXT_PUBLIC_APP_URL=https://app.payloadlogic.com
NEXT_PUBLIC_TRIAL_ROLLOUT_AT=2026-11-06T20:00:00Z

# Server-Side Secrets (Stored in App Hosting secrets or .env.local)
GEMINI_API_KEY=AIzaSy...
VAPID_PRIVATE_KEY=...
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account",...} # (Auto-provided in App Hosting via ADC)
FMCSA_WEBKEY= # (Optional)

# Stripe Production Credentials & Price IDs
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_STARTER_MONTHLY=price_...
STRIPE_PRICE_STARTER_SIX_MONTH=price_...
STRIPE_PRICE_STARTER_ANNUAL=price_...
STRIPE_PRICE_FLEET_PRO_MONTHLY=price_...
STRIPE_PRICE_FLEET_PRO_SIX_MONTH=price_...
STRIPE_PRICE_FLEET_PRO_ANNUAL=price_...
```
