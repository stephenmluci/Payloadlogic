/**
 * PayloadLogic Plan Limits & Entitlements Engine
 * ──────────────────────────────────────────────────────────────────────────────
 * Single source of truth for subscription plan limits and feature access.
 *
 * Tier definitions:
 * - Starter Plan ($49/mo):
 *     - 1 Power Unit (Truck)
 *     - Unlimited Trailers
 *     - 1 Driver login / HOS
 *     - Core TMS, BOLs, Rates, Invoices, Expenses, Clients
 *     - Gated: Driver Command Center, Client Portal, Multi-Truck Settlements
 *
 * - Fleet Pro Plan ($99/mo base):
 *     - 3 Power Units (Trucks) included base (+$25/mo per extra rig with confirmation)
 *     - Unlimited Trailers
 *     - Unlimited Driver logins & HOS tracking
 *     - Full Access: Driver Command Center, Client Portal, Multi-Truck Settlements
 */

export type SubscriptionTier = 'starter' | 'fleetPro';

export interface PlanFeatures {
  commandCenter: boolean;
  clientPortal: boolean;
  multiTruckSettlements: boolean;
}

export interface PlanEntitlements {
  tier: SubscriptionTier;
  name: string;
  badge?: string;
  tagline: string;
  priceMonthly: number;
  baseTrucks: number;
  maxTrucks: number;
  isTruckLimitFlexible: boolean;
  extraTruckPriceMonthly: number;
  maxDrivers: number;
  maxTrailers: number;
  features: PlanFeatures;
}

export const PLAN_CONFIG: Record<SubscriptionTier, {
  name: string;
  badge?: string;
  tagline: string;
  priceMonthly: number;
  baseTrucks: number;
  extraTruckPriceMonthly: number;
  maxDrivers: number;
  maxTrailers: number;
  features: PlanFeatures;
}> = {
  starter: {
    name: 'Starter Plan',
    tagline: 'Ideal for solo owner-operators running a single power unit.',
    priceMonthly: 49,
    baseTrucks: 1,
    extraTruckPriceMonthly: 0,
    maxDrivers: 1,
    maxTrailers: Infinity,
    features: {
      commandCenter: false,
      clientPortal: false,
      multiTruckSettlements: false,
    },
  },
  fleetPro: {
    name: 'Fleet Pro Plan',
    badge: 'Recommended for Fleets',
    tagline: 'Built for multi-truck fleets, dispatchers, and growing teams.',
    priceMonthly: 99,
    baseTrucks: 3,
    extraTruckPriceMonthly: 25,
    maxDrivers: Infinity,
    maxTrailers: Infinity,
    features: {
      commandCenter: true,
      clientPortal: true,
      multiTruckSettlements: true,
    },
  },
};

/**
 * Resolves full plan entitlements given the current tier and any approved extra trucks.
 */
export function getPlanEntitlements(
  tierInput?: string | null,
  extraTrucksApproved: number = 0,
  isOwnerOrAdmin: boolean = false
): PlanEntitlements {
  if (isOwnerOrAdmin) {
    return {
      tier: 'fleetPro',
      name: 'Fleet Pro Plan (Owner Full Access)',
      badge: 'Owner Lifetime Access',
      tagline: 'Unrestricted owner & developer access with all features enabled at no cost.',
      priceMonthly: 0,
      baseTrucks: Infinity,
      maxTrucks: Infinity,
      isTruckLimitFlexible: true,
      extraTruckPriceMonthly: 0,
      maxDrivers: Infinity,
      maxTrailers: Infinity,
      features: {
        commandCenter: true,
        clientPortal: true,
        multiTruckSettlements: true,
      },
    };
  }

  const tier: SubscriptionTier = tierInput === 'fleetPro' ? 'fleetPro' : 'starter';
  const config = PLAN_CONFIG[tier];
  const maxTrucks = tier === 'fleetPro'
    ? Math.max(config.baseTrucks, config.baseTrucks + Math.max(0, extraTrucksApproved))
    : config.baseTrucks;

  return {
    tier,
    name: config.name,
    badge: config.badge,
    tagline: config.tagline,
    priceMonthly: config.priceMonthly,
    baseTrucks: config.baseTrucks,
    maxTrucks,
    isTruckLimitFlexible: tier === 'fleetPro',
    extraTruckPriceMonthly: config.extraTruckPriceMonthly,
    maxDrivers: config.maxDrivers,
    maxTrailers: config.maxTrailers,
    features: config.features,
  };
}

/**
 * Validates whether another truck can be added under the current plan.
 */
export function canAddTruck(
  currentTruckCount: number,
  tierInput?: string | null,
  extraTrucksApproved: number = 0,
  isTrialEvaluation: boolean = false,
  isOwnerOrAdmin: boolean = false
): {
  allowed: boolean;
  isAtLimit: boolean;
  requiresOverageConfirmation: boolean;
  overageCost: number;
  reason?: string;
} {
  if (isOwnerOrAdmin) {
    return {
      allowed: true,
      isAtLimit: false,
      requiresOverageConfirmation: false,
      overageCost: 0,
    };
  }

  const tier: SubscriptionTier = tierInput === 'fleetPro' ? 'fleetPro' : 'starter';
  const entitlements = getPlanEntitlements(tier, extraTrucksApproved);

  // Free trial evaluates at Fleet Pro level but nothing is billed, so there is no paid overage:
  // the trial simply caps at the 3 included trucks.
  if (isTrialEvaluation) {
    const atTrialCap = currentTruckCount >= entitlements.baseTrucks;
    return {
      allowed: !atTrialCap,
      isAtLimit: atTrialCap,
      requiresOverageConfirmation: false,
      overageCost: 0,
      reason: atTrialCap
        ? `Your free trial includes up to ${entitlements.baseTrucks} trucks. Choose a plan to add more.`
        : undefined,
    };
  }

  if (tier === 'starter') {
    const isAtLimit = currentTruckCount >= entitlements.maxTrucks;
    if (isAtLimit) {
      return {
        allowed: false,
        isAtLimit: true,
        requiresOverageConfirmation: false,
        overageCost: 0,
        reason: 'Starter plan is limited to 1 power unit (truck). Upgrade to Fleet Pro to manage up to 3 trucks and unlock fleet features.',
      };
    }
    return {
      allowed: true,
      isAtLimit: false,
      requiresOverageConfirmation: false,
      overageCost: 0,
    };
  }

  // Fleet Pro
  if (currentTruckCount < entitlements.baseTrucks) {
    return {
      allowed: true,
      isAtLimit: false,
      requiresOverageConfirmation: false,
      overageCost: 0,
    };
  }

  // At or above base 3 trucks on Fleet Pro: allowed with overage confirmation
  return {
    allowed: true,
    isAtLimit: true,
    requiresOverageConfirmation: true,
    overageCost: entitlements.extraTruckPriceMonthly,
    reason: `You have reached your 3 included trucks on Fleet Pro. Adding this truck will add $${entitlements.extraTruckPriceMonthly}/mo to your subscription.`,
  };
}

/**
 * Validates whether another driver profile or login can be added under the current plan.
 */
export function canAddDriver(
  currentDriverCount: number,
  tierInput?: string | null,
  isOwnerOrAdmin: boolean = false
): {
  allowed: boolean;
  isAtLimit: boolean;
  reason?: string;
} {
  if (isOwnerOrAdmin) {
    return {
      allowed: true,
      isAtLimit: false,
    };
  }

  const tier: SubscriptionTier = tierInput === 'fleetPro' ? 'fleetPro' : 'starter';
  const entitlements = getPlanEntitlements(tier);

  if (tier === 'starter') {
    const isAtLimit = currentDriverCount >= entitlements.maxDrivers;
    if (isAtLimit) {
      return {
        allowed: false,
        isAtLimit: true,
        reason: 'Starter plan includes 1 driver account. Upgrade to Fleet Pro for unlimited driver logins and HOS tracking.',
      };
    }
    return {
      allowed: true,
      isAtLimit: false,
    };
  }

  // Fleet Pro has unlimited drivers
  return {
    allowed: true,
    isAtLimit: false,
  };
}

/**
 * Checks feature gating access for Pro-only capabilities.
 */
export function canAccessFeature(
  tierInput: string | null | undefined,
  feature: keyof PlanFeatures,
  isOwnerOrAdmin: boolean = false
): boolean {
  if (isOwnerOrAdmin) return true;
  const tier: SubscriptionTier = tierInput === 'fleetPro' ? 'fleetPro' : 'starter';
  const entitlements = getPlanEntitlements(tier);
  return !!entitlements.features[feature];
}
