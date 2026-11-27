export const ARMS = ['control', 'pause', 'discount'] as const;
export type Arm = (typeof ARMS)[number];

export const CANCELLATION_LABEL: Record<Arm, string> = {
  control: 'Cancel subscription',
  pause: 'Cancel anyway',
  discount: 'Cancel anyway',
};

export type CancelAction = 'keep' | 'accept_pause' | 'accept_discount' | 'cancel';

export function isArm(value: unknown): value is Arm {
  return typeof value === 'string' && (ARMS as readonly string[]).includes(value);
}

export function isActionAllowed(arm: Arm, action: CancelAction): boolean {
  if (action === 'cancel' || action === 'keep') return true;
  return (arm === 'pause' && action === 'accept_pause') ||
    (arm === 'discount' && action === 'accept_discount');
}

export function offerCopy(arm: Arm): string | undefined {
  if (arm === 'pause') return 'Pause your subscription for one month?';
  if (arm === 'discount') return 'Get 30% off for three months?';
  return undefined;
}
