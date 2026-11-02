import { PLUS_PRODUCT_ID, PRO_MONTHLY_PRODUCT_ID } from './productIds';
import type { StoreEntitlements } from './types';

type PurchaseLike = {
  productId?: string;
  id?: string;
};

/**
 * Map StoreKit / expo-iap purchase records to owned entitlements.
 * Plus = non-consumable ownership. Pro = active monthly subscription purchase present.
 */
export function entitlementsFromPurchases(
  purchases: readonly PurchaseLike[]
): StoreEntitlements {
  let hasPlus = false;
  let hasPro = false;
  for (const purchase of purchases) {
    const productId = purchase.productId ?? purchase.id;
    if (productId === PLUS_PRODUCT_ID) {
      hasPlus = true;
    }
    if (productId === PRO_MONTHLY_PRODUCT_ID) {
      hasPro = true;
    }
  }
  return { hasPlus, hasPro };
}
