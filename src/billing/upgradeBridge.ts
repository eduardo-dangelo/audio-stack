import type { UpgradeReason } from './types';

type PaywallOpener = (reason: UpgradeReason | null) => void;

let openPaywall: PaywallOpener | null = null;
/** Prefer when MemoEditor form sheet is open — avoids Stack modal resizing the sheet. */
let sheetPaywallOpener: PaywallOpener | null = null;
let sheetPaywallCloser: (() => void) | null = null;

export function registerPaywallOpener(opener: PaywallOpener | null): void {
  openPaywall = opener;
}

export function registerSheetPaywall(handlers: {
  open: PaywallOpener;
  close: () => void;
} | null): void {
  if (!handlers) {
    sheetPaywallOpener = null;
    sheetPaywallCloser = null;
    return;
  }
  sheetPaywallOpener = handlers.open;
  sheetPaywallCloser = handlers.close;
}

/** Open paywall: in-editor sheet Modal if registered, else root opener (route). */
export function openPaywallPreferred(reason: UpgradeReason | null = null): void {
  if (sheetPaywallOpener) {
    sheetPaywallOpener(reason);
    return;
  }
  openPaywall?.(reason);
}

/** Close paywall: in-editor sheet Modal if registered, else root closer. */
export function closePaywallPreferred(fallback?: () => void): void {
  if (sheetPaywallCloser) {
    sheetPaywallCloser();
    return;
  }
  fallback?.();
}

/** Gated action hit a limit — open paywall immediately with contextual reason. */
export function requestUpgrade(reason: UpgradeReason): void {
  openPaywallPreferred(reason);
}
