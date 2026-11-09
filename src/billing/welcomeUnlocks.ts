import type { SFSymbol } from 'sf-symbols-typescript';

import type { CelebrationTier } from './celebrationBridge';

export type WelcomeUnlock = {
  label: string;
  symbol: SFSymbol;
};

/** Features newly unlocked when entering Plus (vs Lite). */
export const PLUS_WELCOME_UNLOCKS: readonly WelcomeUnlock[] = [
  { label: 'Unlimited recordings', symbol: 'waveform' },
  { label: 'Unlimited layers', symbol: 'square.stack.3d.up' },
  { label: 'Custom FX', symbol: 'slider.horizontal.3' },
  { label: 'Folders', symbol: 'folder' },
  { label: 'M4A export', symbol: 'square.and.arrow.up' },
  { label: 'Merge', symbol: 'square.stack.3d.down.right' },
  { label: 'Solarized themes', symbol: 'paintbrush' },
];

/** Features newly unlocked when entering Pro (vs Plus), plus Plus is included. */
export const PRO_WELCOME_UNLOCKS: readonly WelcomeUnlock[] = [
  { label: 'Everything in Plus', symbol: 'sparkles' },
  { label: 'Duplicate', symbol: 'plus.square.on.square' },
  { label: 'Loop', symbol: 'repeat' },
  { label: 'WAV / .aud', symbol: 'doc' },
  { label: 'Named IDE themes', symbol: 'paintbrush' },
  { label: 'Pitch', symbol: 'tuningfork' },
];

export function welcomeUnlocksForTier(tier: CelebrationTier): readonly WelcomeUnlock[] {
  return tier === 'pro' ? PRO_WELCOME_UNLOCKS : PLUS_WELCOME_UNLOCKS;
}
