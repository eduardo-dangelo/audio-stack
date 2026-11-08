import {
  getDevTierOverrideSync,
  type DevTierOverride,
} from '@/src/settings/appSettings';

import { resolveEffectiveTier } from './capabilities';
import type { StoreEntitlements, TierId } from './types';

const RIBBON_SKEW_MS = 3 * 60 * 1000;

let storeEntitlements: StoreEntitlements = { hasPlus: false, hasPro: false };
let devTierOverride: DevTierOverride = __DEV__ ? getDevTierOverrideSync() : null;
let ribbonSkew = false;
let ribbonSkewTimer: ReturnType<typeof setTimeout> | null = null;
let listeners = new Set<() => void>();

function clearRibbonSkewTimer(): void {
  if (ribbonSkewTimer == null) {
    return;
  }
  clearTimeout(ribbonSkewTimer);
  ribbonSkewTimer = null;
}

export function setCachedDevTierOverride(next: DevTierOverride): void {
  devTierOverride = next;
}

export function getCachedDevTierOverride(): DevTierOverride {
  return devTierOverride;
}

export function hasRibbonSkew(): boolean {
  return ribbonSkew;
}

export function setRibbonSkew(active: boolean): void {
  if (active) {
    clearRibbonSkewTimer();
    if (!ribbonSkew) {
      ribbonSkew = true;
      listeners.forEach((listener) => listener());
    }
    ribbonSkewTimer = setTimeout(() => {
      ribbonSkewTimer = null;
      setRibbonSkew(false);
    }, RIBBON_SKEW_MS);
    return;
  }

  clearRibbonSkewTimer();
  if (!ribbonSkew) {
    return;
  }
  ribbonSkew = false;
  listeners.forEach((listener) => listener());
}

export function setStoreEntitlements(next: StoreEntitlements): void {
  if (
    next.hasPlus === storeEntitlements.hasPlus &&
    next.hasPro === storeEntitlements.hasPro
  ) {
    return;
  }
  storeEntitlements = next;
  listeners.forEach((listener) => listener());
}

export function getStoreEntitlementsSync(): StoreEntitlements {
  return storeEntitlements;
}

export function getEffectiveTierSync(): TierId {
  return resolveEffectiveTier({
    hasPlus: storeEntitlements.hasPlus,
    hasPro: storeEntitlements.hasPro,
    devTierOverride,
    ribbonSkew,
  });
}

/** Notify after local settings (dev override) change. */
export function notifyBillingListeners(): void {
  listeners.forEach((listener) => listener());
}

export function subscribeBilling(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
