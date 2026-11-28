import { Flagsmith } from '@flagsmith/nodejs';
import type { AppConfig } from './config.js';
import { isArm, type Arm } from './experiment.js';
import {
  FLAGSMITH_REQUEST_TIMEOUT_SECONDS,
  FLAGSMITH_RETRIES,
  FLAGSMITH_RETRY_DELAY_MS,
} from './timeout-policy.js';

export interface EvaluatedExperimentFlag {
  enabled: boolean;
  isDefault: boolean;
  value: string | number | boolean | null | undefined;
  variant?: string;
  experiment?: { inExperiment: boolean };
}

export interface FlagsmithPort {
  getExperimentFlag(featureName: string, identifier: string): Promise<EvaluatedExperimentFlag>;
  trackEvent(event: string, opts: { identifier: string }): void;
  close(): Promise<void>;
}

export interface CancelAssignment {
  arm: Arm;
  enrolled: boolean;
}

export function createFlagsmith(config: AppConfig): Flagsmith {
  return new Flagsmith({
    environmentKey: config.FLAGSMITH_SERVER_KEY,
    enableEvents: true,
    apiUrl: config.FLAGSMITH_SDK_API_URL,
    requestTimeoutSeconds: FLAGSMITH_REQUEST_TIMEOUT_SECONDS,
    retries: FLAGSMITH_RETRIES,
    requestRetryDelayMilliseconds: FLAGSMITH_RETRY_DELAY_MS,
    eventProcessorConfig: { eventsApiUrl: config.FLAGSMITH_EVENTS_URL },
  });
}

export async function getCancelAssignment(client: FlagsmithPort, uid: string): Promise<CancelAssignment> {
  const flag = await client.getExperimentFlag('cancel_flow', uid);
  const enrolled = flag.enabled && !flag.isDefault && flag.experiment?.inExperiment === true;
  if (!enrolled) return { arm: 'control', enrolled: false };
  const value = flag.variant ?? flag.value;
  return { arm: isArm(value) ? value : 'control', enrolled: true };
}

export async function getCancelArm(client: FlagsmithPort, uid: string): Promise<Arm> {
  return (await getCancelAssignment(client, uid)).arm;
}

export function trackRetention(client: FlagsmithPort, uid: string): void {
  // The installed SDK types accept an options object. Omitting value records an occurrence event.
  client.trackEvent('subscription_retained', { identifier: uid });
}

export function trackComplaint(client: FlagsmithPort, uid: string): void {
  client.trackEvent('complaint_submitted', { identifier: uid });
}

export async function closeFlagsmith(client: FlagsmithPort): Promise<void> {
  await client.close();
}
