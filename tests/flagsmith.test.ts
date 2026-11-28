import { describe, expect, it, vi } from 'vitest';
import { getCancelAssignment, type EvaluatedExperimentFlag, type FlagsmithPort } from '../src/flagsmith.js';

function clientWith(flag: EvaluatedExperimentFlag): FlagsmithPort {
  return {
    getExperimentFlag: vi.fn(async () => flag),
    trackEvent: vi.fn(),
    close: vi.fn(async () => undefined),
  };
}

describe('cancel_flow assignment modes', () => {
  it('serves control when the feature is disabled, even if its value is pause', async () => {
    const assignment = await getCancelAssignment(clientWith({
      enabled: false, isDefault: false, value: 'pause', variant: 'pause',
    }), 'disabled-user');
    expect(assignment).toEqual({ arm: 'control', enrolled: false });
  });

  it('serves the assigned pause variation to an enrolled identity in an active experiment', async () => {
    const assignment = await getCancelAssignment(clientWith({
      enabled: true, isDefault: false, value: 'control', variant: 'pause', experiment: { inExperiment: true },
    }), 'enrolled-user');
    expect(assignment).toEqual({ arm: 'pause', enrolled: true });
  });

  it('keeps an active experiment non-enrollee on control even when bucketed to pause', async () => {
    const assignment = await getCancelAssignment(clientWith({
      enabled: true, isDefault: false, value: 'control', variant: 'pause', experiment: { inExperiment: false },
    }), 'outside-rollout-user');
    expect(assignment).toEqual({ arm: 'control', enrolled: false });
  });

  it('serves pause as the normal flag value when no running experiment metadata is present', async () => {
    const assignment = await getCancelAssignment(clientWith({
      enabled: true, isDefault: false, value: 'pause',
    }), 'default-pause-user');
    expect(assignment).toEqual({ arm: 'pause', enrolled: false });
  });

  it('serves control when control is the selected normal flag value', async () => {
    const assignment = await getCancelAssignment(clientWith({
      enabled: true, isDefault: false, value: 'control',
    }), 'default-control-user');
    expect(assignment).toEqual({ arm: 'control', enrolled: false });
  });

  it('uses the configured normal flag value instead of a bucket variant, avoiding accidental discount rollout', async () => {
    const assignment = await getCancelAssignment(clientWith({
      enabled: true, isDefault: false, value: 'pause', variant: 'discount',
    }), 'default-pause-user');
    expect(assignment).toEqual({ arm: 'pause', enrolled: false });
  });
});
