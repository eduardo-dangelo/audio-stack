import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Alert, Platform } from 'react-native';
import { router } from 'expo-router';
import {
  deepLinkToSubscriptions,
  finishTransaction,
  isUserCancelledError,
  useIAP,
  type ActiveSubscription,
  type Product,
  type ProductSubscription,
  type Purchase,
} from 'expo-iap';

import {
  setDevTierOverride as persistDevTierOverride,
  setThemePreference,
  type DevTierOverride,
} from '@/src/settings/appSettings';
import { publishThemePreference } from '@/src/theme/themeStore';
import { PRO_WELCOME_THEME } from '@/src/theme/themes';

import { tierDisplayName } from './capabilities';
import {
  getCachedDevTierOverride,
  getEffectiveTierSync,
  hasRibbonSkew,
  notifyBillingListeners,
  setCachedDevTierOverride,
  setStoreEntitlements,
  subscribeBilling,
} from './effectiveTierStore';
import { entitlementsFromPurchases } from './entitlements';
import { PLUS_PRODUCT_ID, PRO_YEARLY_PRODUCT_ID } from './productIds';
import { requestUpgradeCelebration } from './celebrationBridge';
import {
  closePaywallPreferred,
  openPaywallPreferred,
  registerPaywallOpener,
} from './upgradeBridge';
import type { TierId, UpgradeReason } from './types';

async function applyProWelcomeTheme(): Promise<void> {
  publishThemePreference(PRO_WELCOME_THEME);
  await setThemePreference(PRO_WELCOME_THEME);
}

/** Jackpot first so the burst is not blocked on theme persistence. */
async function celebrateUpgrade(tier: 'plus' | 'pro'): Promise<void> {
  requestUpgradeCelebration(tier);
  if (tier === 'pro') {
    await applyProWelcomeTheme();
  }
}

function hasActiveProSubscription(
  subscriptions: readonly ActiveSubscription[]
): boolean {
  return subscriptions.some(
    (sub) => sub.productId === PRO_YEARLY_PRODUCT_ID && sub.isActive
  );
}

type BillingContextValue = {
  connected: boolean;
  effectiveTier: TierId;
  hasPlus: boolean;
  hasPro: boolean;
  plusProduct: Product | null;
  proProduct: ProductSubscription | null;
  plusPriceLabel: string;
  proPriceLabel: string;
  purchasing: boolean;
  openPaywall: (reason?: UpgradeReason | null) => void;
  closePaywall: () => void;
  purchasePlus: () => Promise<void>;
  purchasePro: () => Promise<void>;
  restore: () => Promise<void>;
  manageSubscriptions: () => Promise<void>;
  devTierOverride: DevTierOverride;
  setDevTierOverride: (override: DevTierOverride) => Promise<void>;
  refreshEntitlements: () => Promise<void>;
};

const BillingContext = createContext<BillingContextValue | null>(null);

const FALLBACK_PLUS_PRICE = '£9.99';
const FALLBACK_PRO_PRICE = '£19.99/year';

function productPriceLabel(
  product: { displayPrice?: string } | null | undefined,
  fallback: string
): string {
  const price = product?.displayPrice?.trim();
  return price || fallback;
}

function applyPurchasesToStore(purchases: Purchase[], activePro: boolean): void {
  const fromPurchases = entitlementsFromPurchases(purchases);
  setStoreEntitlements({
    hasPlus: fromPurchases.hasPlus,
    hasPro: activePro,
  });
}

function dismissPaywallRoute(): void {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace('/');
}

export function BillingProvider({ children }: { children: ReactNode }) {
  const [purchasing, setPurchasing] = useState(false);
  const [devTierOverride, setDevTierOverrideState] = useState<DevTierOverride>(
    () => (__DEV__ ? getCachedDevTierOverride() : null)
  );
  const [tierTick, setTierTick] = useState(0);
  const closePaywallRef = useRef<() => void>(() => {});
  /** True only while a Buy/Subscribe tap is in flight — ignores StoreKit redelivery on launch. */
  const expectingPurchaseRef = useRef(false);

  const {
    connected,
    products,
    subscriptions,
    availablePurchases,
    activeSubscriptions,
    fetchProducts,
    getAvailablePurchases,
    getActiveSubscriptions,
    requestPurchase,
    restorePurchases,
  } = useIAP({
    onPurchaseSuccess: (purchase) => {
      void (async () => {
        const userInitiated = expectingPurchaseRef.current;
        expectingPurchaseRef.current = false;
        try {
          await finishTransaction({ purchase, isConsumable: false });
        } catch {
          // Still refresh; StoreKit may retry unfinished transactions later.
        }
        setPurchasing(false);
        if (userInitiated) {
          closePaywallRef.current();
        }
        await refreshEntitlementsRef.current?.();
        if (!userInitiated) {
          return;
        }
        if (purchase.productId === PRO_YEARLY_PRODUCT_ID) {
          await celebrateUpgrade('pro');
        } else if (purchase.productId === PLUS_PRODUCT_ID) {
          await celebrateUpgrade('plus');
        }
      })();
    },
    onPurchaseError: (error) => {
      expectingPurchaseRef.current = false;
      setPurchasing(false);
      if (isUserCancelledError(error)) {
        return;
      }
      Alert.alert(
        'Purchase Failed',
        error.message || 'Something went wrong. Please try again.'
      );
    },
  });

  const refreshEntitlementsRef = useRef<(() => Promise<void>) | null>(null);

  const refreshEntitlements = useCallback(async () => {
    if (Platform.OS !== 'ios' || !connected) {
      applyPurchasesToStore([], false);
      return;
    }
    try {
      await getAvailablePurchases();
      await getActiveSubscriptions([PRO_YEARLY_PRODUCT_ID]);
    } catch {
      // Keep last known entitlements on transient store errors.
    }
  }, [connected, getActiveSubscriptions, getAvailablePurchases]);

  refreshEntitlementsRef.current = refreshEntitlements;

  useEffect(() => {
    applyPurchasesToStore(
      availablePurchases,
      hasActiveProSubscription(activeSubscriptions)
    );
  }, [activeSubscriptions, availablePurchases]);

  useEffect(() => {
    return subscribeBilling(() => setTierTick((n) => n + 1));
  }, []);

  useEffect(() => {
    if (!connected || Platform.OS !== 'ios') {
      return;
    }
    void (async () => {
      try {
        await fetchProducts({ skus: [PLUS_PRODUCT_ID], type: 'in-app' });
        await fetchProducts({ skus: [PRO_YEARLY_PRODUCT_ID], type: 'subs' });
        await refreshEntitlements();
      } catch {
        // Products may be missing until ASC is configured.
      }
    })();
  }, [connected, fetchProducts, refreshEntitlements]);

  const plusProduct =
    products.find((product) => product.id === PLUS_PRODUCT_ID) ?? null;
  const proProduct =
    subscriptions.find((product) => product.id === PRO_YEARLY_PRODUCT_ID) ??
    null;

  const effectiveTier = useMemo(() => {
    void tierTick;
    return getEffectiveTierSync();
  }, [tierTick, availablePurchases, activeSubscriptions, devTierOverride]);

  const openPaywallRoute = useCallback((reason: UpgradeReason | null = null) => {
    router.push({
      pathname: '/paywall',
      params: reason ? { reason } : {},
    });
  }, []);

  useEffect(() => {
    registerPaywallOpener(openPaywallRoute);
    return () => registerPaywallOpener(null);
  }, [openPaywallRoute]);

  const openPaywall = useCallback((reason: UpgradeReason | null = null) => {
    openPaywallPreferred(reason);
  }, []);

  const closePaywall = useCallback(() => {
    closePaywallPreferred(dismissPaywallRoute);
  }, []);

  closePaywallRef.current = closePaywall;

  const purchasePlus = useCallback(async () => {
    if (Platform.OS !== 'ios') {
      Alert.alert('Unavailable', 'Purchases are only available on iOS.');
      return;
    }
    expectingPurchaseRef.current = true;
    setPurchasing(true);
    try {
      await requestPurchase({
        request: { apple: { sku: PLUS_PRODUCT_ID } },
        type: 'in-app',
      });
    } catch (error) {
      expectingPurchaseRef.current = false;
      setPurchasing(false);
      const message =
        error instanceof Error ? error.message : 'Could not start purchase.';
      Alert.alert('Purchase Failed', message);
    }
  }, [requestPurchase]);

  const purchasePro = useCallback(async () => {
    if (Platform.OS !== 'ios') {
      Alert.alert('Unavailable', 'Purchases are only available on iOS.');
      return;
    }
    expectingPurchaseRef.current = true;
    setPurchasing(true);
    try {
      await requestPurchase({
        request: { apple: { sku: PRO_YEARLY_PRODUCT_ID } },
        type: 'subs',
      });
    } catch (error) {
      expectingPurchaseRef.current = false;
      setPurchasing(false);
      const message =
        error instanceof Error ? error.message : 'Could not start purchase.';
      Alert.alert('Purchase Failed', message);
    }
  }, [requestPurchase]);

  const restore = useCallback(async () => {
    if (Platform.OS !== 'ios') {
      return;
    }
    try {
      await restorePurchases();
      await refreshEntitlements();
      const tier = getEffectiveTierSync();
      Alert.alert(
        'Purchases Restored',
        tier === 'lite'
          ? 'No previous purchases were found for this Apple ID.'
          : `Your plan is ${tierDisplayName(tier)}.`
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Could not restore purchases.';
      Alert.alert('Restore Failed', message);
    }
  }, [refreshEntitlements, restorePurchases]);

  const manageSubscriptions = useCallback(async () => {
    try {
      await deepLinkToSubscriptions({});
    } catch {
      Alert.alert(
        'Subscriptions',
        'Open Settings → Apple ID → Subscriptions to manage your plan.'
      );
    }
  }, []);

  const setDevTierOverride = useCallback(async (override: DevTierOverride) => {
    if (!__DEV__) {
      return;
    }
    const enteringPro = override === 'pro' && devTierOverride !== 'pro';
    const enteringPlus = override === 'plus' && devTierOverride !== 'plus';
    await persistDevTierOverride(override);
    setCachedDevTierOverride(override);
    setDevTierOverrideState(override);
    notifyBillingListeners();
    await refreshEntitlements();
    notifyBillingListeners();
    if (enteringPro) {
      await celebrateUpgrade('pro');
    } else if (enteringPlus) {
      await celebrateUpgrade('plus');
    }
  }, [devTierOverride, refreshEntitlements]);

  const storeFlags = useMemo(() => {
    void tierTick;
    const fromPurchases = entitlementsFromPurchases(availablePurchases);
    return {
      hasPlus: fromPurchases.hasPlus,
      hasPro: hasActiveProSubscription(activeSubscriptions) || hasRibbonSkew(),
    };
  }, [tierTick, activeSubscriptions, availablePurchases]);

  const plusPriceLabel = productPriceLabel(plusProduct, FALLBACK_PLUS_PRICE);
  const proBasePrice = productPriceLabel(proProduct, FALLBACK_PRO_PRICE);
  const proPriceLabel = /year|yr|\/y|mo|month/i.test(proBasePrice)
    ? proBasePrice
    : `${proBasePrice}/year`;

  const value = useMemo<BillingContextValue>(
    () => ({
      connected,
      effectiveTier,
      hasPlus: storeFlags.hasPlus,
      hasPro: storeFlags.hasPro,
      plusProduct,
      proProduct,
      plusPriceLabel,
      proPriceLabel,
      purchasing,
      openPaywall,
      closePaywall,
      purchasePlus,
      purchasePro,
      restore,
      manageSubscriptions,
      devTierOverride,
      setDevTierOverride,
      refreshEntitlements,
    }),
    [
      closePaywall,
      connected,
      devTierOverride,
      effectiveTier,
      manageSubscriptions,
      openPaywall,
      plusPriceLabel,
      plusProduct,
      proPriceLabel,
      proProduct,
      purchasePlus,
      purchasePro,
      purchasing,
      refreshEntitlements,
      restore,
      setDevTierOverride,
      storeFlags.hasPlus,
      storeFlags.hasPro,
    ]
  );

  return (
    <BillingContext.Provider value={value}>{children}</BillingContext.Provider>
  );
}

export function useBilling(): BillingContextValue {
  const value = useContext(BillingContext);
  if (!value) {
    throw new Error('useBilling must be used within BillingProvider');
  }
  return value;
}
