import type { UpgradeReason } from './types';

export class BillingLimitError extends Error {
  readonly reason: UpgradeReason;

  constructor(reason: UpgradeReason, message?: string) {
    super(message ?? reason);
    this.name = 'BillingLimitError';
    this.reason = reason;
  }
}

export function isBillingLimitError(error: unknown): error is BillingLimitError {
  return error instanceof BillingLimitError;
}
