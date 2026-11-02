import { getDevTierOverrideSync } from '@/src/settings/appSettings';

import { resolveEffectiveTier } from './capabilities';
import type { StoreEntitlements, TierId } from './types';

let storeEntitlements: StoreEntitlements = { hasPlus: false, hasPro: false };
let listeners = new Set<() => void>();

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
    devTierOverride: __DEV__ ? getDevTierOverrideSync() : null,
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
