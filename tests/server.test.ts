import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildServer } from '../src/server.js';
import type { FlagsmithPort } from '../src/flagsmith.js';
import type { Arm } from '../src/experiment.js';

function makeFlagsmith(arm: Arm = 'control', enrolled = true) {
  const client: FlagsmithPort = {
    getExperimentFlag: vi.fn(async () => ({
      enabled: true,
      isDefault: false,
      value: arm,
      variant: arm,
      experiment: { inExperiment: enrolled },
    })),
    trackEvent: vi.fn(),
    close: vi.fn(async () => undefined),
  };
  return client;
}

const servers: Array<Awaited<ReturnType<typeof buildServer>>> = [];
function makeServer(arm: Arm = 'control', enrolled = true) {
  const flagsmith = makeFlagsmith(arm, enrolled);
  const app = buildServer({ flagsmith });
  servers.push(app);
  return { app, flagsmith };
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((app) => app.close()));
});

describe('cancel-flow routes', () => {
  it('serves health and validates the uid before evaluating the flag', async () => {
    const { app, flagsmith } = makeServer();
    expect((await app.inject('/healthz')).json()).toEqual({ status: 'ok' });
    expect((await app.inject('/account/cancel')).statusCode).toBe(400);
    expect((await app.inject('/account/cancel?uid=bad%20uid')).statusCode).toBe(400);
    expect(flagsmith.getExperimentFlag).not.toHaveBeenCalled();
  });

  it('returns JSON with the served arm and keeps one stable identity', async () => {
    const { app, flagsmith } = makeServer('pause');
    const response = await app.inject({ url: '/account/cancel?uid=u_run_1', headers: { accept: 'application/json' } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      uid: 'u_run_1', arm: 'pause', enrolled: true, offer: 'Pause your subscription for one month?',
      cancellation: { available: true, oneClick: true, label: 'Cancel anyway' },
    });
    expect(flagsmith.getExperimentFlag).toHaveBeenCalledTimes(1);
    expect(flagsmith.getExperimentFlag).toHaveBeenCalledWith('cancel_flow', 'u_run_1');
  });

  it('renders control and suppresses both conversion events for a non-enrolled pause identity', async () => {
    const { app, flagsmith } = makeServer('pause', false);
    const retainedUid = 'u_not_enrolled_retained';
    const retainedFlow = await app.inject({
      url: `/account/cancel?uid=${retainedUid}`,
      headers: { accept: 'application/json' },
    });
    expect(retainedFlow.json()).toMatchObject({ arm: 'control', offer: null });
    const retained = await app.inject({
      method: 'POST',
      url: '/account/cancel/action',
      payload: { uid: retainedUid, action: 'keep' },
    });
    expect(retained.json()).toMatchObject({ status: 'retained', retainedEventSent: false });

    const cancelledUid = 'u_not_enrolled_cancelled';
    await app.inject({
      url: `/account/cancel?uid=${cancelledUid}`,
      headers: { accept: 'application/json' },
    });
    await app.inject({ method: 'POST', url: '/account/cancel/action', payload: { uid: cancelledUid, action: 'cancel' } });
    const complaint = await app.inject({ method: 'POST', url: '/account/complaint', payload: { uid: cancelledUid } });
    expect(complaint.json()).toMatchObject({ recorded: false, reason: 'not_enrolled' });
    expect(flagsmith.trackEvent).not.toHaveBeenCalled();
  });

  it('serves and tracks pause for an enrolled identity using the same UID', async () => {
    const { app, flagsmith } = makeServer('pause', true);
    const uid = 'u_enrolled_pause';
    const flow = await app.inject({ url: `/account/cancel?uid=${uid}`, headers: { accept: 'application/json' } });
    expect(flow.json()).toMatchObject({ uid, arm: 'pause' });
    await app.inject({ method: 'POST', url: '/account/cancel/action', payload: { uid, action: 'accept_pause' } });
    expect(flagsmith.getExperimentFlag).toHaveBeenCalledWith('cancel_flow', uid);
    expect(flagsmith.trackEvent).toHaveBeenCalledWith('subscription_retained', { identifier: uid });
  });

  it('validates actions and prevents duplicate retention events', async () => {
    const { app, flagsmith } = makeServer('pause');
    await app.inject({ url: '/account/cancel?uid=u_run_2', headers: { accept: 'application/json' } });
    expect((await app.inject({ method: 'POST', url: '/account/cancel/action', payload: { uid: 'u_run_2', action: 'accept_discount' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/account/cancel/action', payload: { uid: 'u_run_2', action: 'accept_pause' } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/account/cancel/action', payload: { uid: 'u_run_2', action: 'accept_pause' } })).statusCode).toBe(409);
    expect(flagsmith.trackEvent).toHaveBeenCalledTimes(1);
    expect(flagsmith.trackEvent).toHaveBeenCalledWith('subscription_retained', { identifier: 'u_run_2' });
    expect(flagsmith.getExperimentFlag).toHaveBeenCalledTimes(1);
    expect(flagsmith.getExperimentFlag).toHaveBeenCalledWith('cancel_flow', 'u_run_2');
  });

  it('records a complaint only after cancellation and only once', async () => {
    const { app, flagsmith } = makeServer('discount', true);
    await app.inject({ url: '/account/cancel?uid=u_run_3', headers: { accept: 'application/json' } });
    expect((await app.inject({ method: 'POST', url: '/account/complaint', payload: { uid: 'u_run_3' } })).statusCode).toBe(409);
    await app.inject({ method: 'POST', url: '/account/cancel/action', payload: { uid: 'u_run_3', action: 'cancel' } });
    expect((await app.inject({ method: 'POST', url: '/account/complaint', payload: { uid: 'u_run_3' } })).json()).toMatchObject({ recorded: true, duplicate: false });
    expect((await app.inject({ method: 'POST', url: '/account/complaint', payload: { uid: 'u_run_3' } })).json()).toMatchObject({ recorded: false, duplicate: true });
    expect(flagsmith.trackEvent).toHaveBeenCalledTimes(1);
    expect(flagsmith.trackEvent).toHaveBeenCalledWith('complaint_submitted', { identifier: 'u_run_3' });
    expect(flagsmith.getExperimentFlag).toHaveBeenCalledTimes(1);
    expect(flagsmith.getExperimentFlag).toHaveBeenCalledWith('cancel_flow', 'u_run_3');
  });

  it.each<Arm>(['control', 'pause', 'discount'])('keeps a one-click, equally styled cancel control in %s', async (arm) => {
    const { app } = makeServer(arm);
    const response = await app.inject('/account/cancel?uid=u_ui_1');
    expect(response.statusCode).toBe(200);
    const html = response.body;
    expect(html).toContain('class="choice" type="button" data-action="cancel"');
    expect(html).toContain('min-height:48px');
    expect(html).toContain('aria-label="');
    expect(html.match(/data-action="cancel"/g)).toHaveLength(1);
    if (arm !== 'control') expect(html).toContain('data-action="accept_');
  });

  it('rejects malformed bodies without tracking an event', async () => {
    const { app, flagsmith } = makeServer();
    const response = await app.inject({ method: 'POST', url: '/account/cancel/action', payload: { uid: '', action: 'oops' } });
    expect(response.statusCode).toBe(400);
    expect(flagsmith.trackEvent).not.toHaveBeenCalled();
  });
});
