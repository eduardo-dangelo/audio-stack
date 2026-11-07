import { PLUS_PRODUCT_ID } from './productIds';
import type { StoreEntitlements } from './types';

type PurchaseLike = {
  productId?: string;
  id?: string;
};

/**
 * Map StoreKit / expo-iap purchase records to Plus ownership.
 * Pro is not inferred here — only from activeSubscriptions in BillingProvider.
 */
export function entitlementsFromPurchases(
  purchases: readonly PurchaseLike[]
): StoreEntitlements {
  let hasPlus = false;
  for (const purchase of purchases) {
    const productId = purchase.productId ?? purchase.id;
    if (productId === PLUS_PRODUCT_ID) {
      hasPlus = true;
    }
  }
  return { hasPlus, hasPro: false };
}
