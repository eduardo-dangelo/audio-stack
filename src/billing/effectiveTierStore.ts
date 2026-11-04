import {
  getDevTierOverrideSync,
  type DevTierOverride,
} from '@/src/settings/appSettings';

import { resolveEffectiveTier } from './capabilities';
import type { StoreEntitlements, TierId } from './types';

let storeEntitlements: StoreEntitlements = { hasPlus: false, hasPro: false };
let devTierOverride: DevTierOverride = __DEV__ ? getDevTierOverrideSync() : null;
let transientPro = false;
let listeners = new Set<() => void>();

export function setCachedDevTierOverride(next: DevTierOverride): void {
  devTierOverride = next;
}

export function getCachedDevTierOverride(): DevTierOverride {
  return devTierOverride;
}

export function isTransientPro(): boolean {
  return transientPro;
}

export function setTransientPro(active: boolean): void {
  if (transientPro === active) {
    return;
  }
  transientPro = active;
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
    transientPro,
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
