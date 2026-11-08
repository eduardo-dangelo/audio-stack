export type CelebrationTier = 'plus' | 'pro';

type CelebrationHandler = (tier: CelebrationTier) => void;

let celebrationHandler: CelebrationHandler | null = null;

export function registerUpgradeCelebration(handler: CelebrationHandler | null): void {
  celebrationHandler = handler;
}

export function requestUpgradeCelebration(tier: CelebrationTier): void {
  celebrationHandler?.(tier);
}
