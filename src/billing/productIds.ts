/** Non-consumable lifetime unlock (Plus). Same ID on App Store and Play. */
export const PLUS_PRODUCT_ID = 'com.eduardodangelo.voicememosplus.plus';

/** Auto-renewable yearly subscription (Pro) — App Store Connect. */
export const PRO_YEARLY_PRODUCT_ID = 'com.eduardodangelo.voicememosplus.pro.yearly';

/**
 * Yearly Pro subscription on Google Play (≤40-char product ID limit).
 * Billing period is the `yearly` base plan, not part of this ID.
 */
export const PRO_ANDROID_PRODUCT_ID = 'com.eduardodangelo.voicememosplus.pro';

export const PRO_PRODUCT_IDS = [
  PRO_YEARLY_PRODUCT_ID,
  PRO_ANDROID_PRODUCT_ID,
] as const;

export const IAP_PRODUCT_IDS = [PLUS_PRODUCT_ID, ...PRO_PRODUCT_IDS] as const;

export function isProProductId(id: string | null | undefined): boolean {
  return (
    id === PRO_YEARLY_PRODUCT_ID || id === PRO_ANDROID_PRODUCT_ID
  );
}

/** Store SKU to fetch / purchase for Pro on the current platform. */
export function proProductIdForPlatform(os: string): string {
  return os === 'android' ? PRO_ANDROID_PRODUCT_ID : PRO_YEARLY_PRODUCT_ID;
}
