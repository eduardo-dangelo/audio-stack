import { router, useLocalSearchParams } from 'expo-router';

import { PaywallScreen } from '@/src/components/PaywallModal';
import type { UpgradeReason } from '@/src/billing/types';

const UPGRADE_REASONS: readonly UpgradeReason[] = [
  'recordings',
  'layers',
  'customEffects',
  'import',
  'export',
  'exportFormat',
  'folders',
];

function firstParam(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  return Array.isArray(value) ? value[0] : undefined;
}

function parseReason(value: string | undefined): UpgradeReason | null {
  if (!value) {
    return null;
  }
  return UPGRADE_REASONS.includes(value as UpgradeReason)
    ? (value as UpgradeReason)
    : null;
}

function closePaywall(): void {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace('/');
}

export default function PaywallRoute() {
  const params = useLocalSearchParams<{ reason?: string | string[] }>();
  const reason = parseReason(firstParam(params.reason));

  return <PaywallScreen reason={reason} onClose={closePaywall} />;
}
