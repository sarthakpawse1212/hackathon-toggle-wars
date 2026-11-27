import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createDefaultRunId,
  createHttpApi,
  parseArgs,
  runCli,
  runSimulation,
  simulateUsers,
  toCsv,
  type SimulationApi,
  type SimulationOptions,
} from '../scripts/simulate.js';

const temporaryDirectories: string[] = [];
async function makeTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'cancel-simulator-test-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function options(runId: string): SimulationOptions {
  return { users: 1, seed: 42, runId, baseUrl: 'http://localhost:3000', timeoutMs: 100 };
}

describe('simulator', () => {
  it('uses unique synthetic identities, obtains arms from the API, and submits resulting actions', async () => {
    const ids: string[] = [];
    const api: SimulationApi = {
      async getAssignment(uid) { ids.push(uid); return { uid, arm: 'control', enrolled: true }; },
      submitAction: vi.fn(async () => undefined),
      submitComplaint: vi.fn(async () => undefined),
    };
    const options = { users: 30, seed: 42, runId: 'test_run', baseUrl: 'http://localhost:3000', timeoutMs: 100 };
    const rows = await simulateUsers(options, api);
    expect(api.submitAction).toHaveBeenCalledTimes(30);
    const repeat = await simulateUsers(options, {
      ...api,
      getAssignment: async (uid) => ({ uid, arm: 'control', enrolled: true }),
    });
    expect(new Set(ids).size).toBe(30);
    expect(ids).toEqual(expect.arrayContaining(Array.from({ length: 30 }, (_, index) => `u_test_run_${index + 1}`)));
    expect(rows).toEqual(repeat);
    expect(api.submitAction).toHaveBeenCalledTimes(60);
    expect(rows.every((row) => row.arm === 'control' && row.enrolled)).toBe(true);
  });

  it('keeps non-enrolled fallback rows marked and serializes outcomes as simulated', async () => {
    const api: SimulationApi = {
      async getAssignment(uid) { return { uid, arm: 'control', enrolled: false }; },
      submitAction: vi.fn(async () => undefined),
      submitComplaint: vi.fn(async () => undefined),
    };
    const rows = await simulateUsers({ users: 2, seed: 7, runId: 'fallback', baseUrl: 'http://localhost:3000', timeoutMs: 100 }, api);
    expect(rows.every((row) => !row.enrolled)).toBe(true);
    expect(toCsv(rows)).toContain('uid,persona,arm,enrolled,retained,complaint,simulated');
    expect(toCsv(rows).trimEnd().split('\n').slice(1).every((line) => line.endsWith(',true'))).toBe(true);
  });

  it('submits complaints only for modeled cancellations that draw a complaint', async () => {
    const api: SimulationApi = {
      async getAssignment(uid) { return { uid, arm: 'control', enrolled: true }; },
      submitAction: vi.fn(async () => undefined),
      submitComplaint: vi.fn(async () => undefined),
    };
    const rows = await simulateUsers({ users: 500, seed: 42, runId: 'complaints', baseUrl: 'http://localhost:3000', timeoutMs: 100 }, api);
    expect(api.submitComplaint).toHaveBeenCalledTimes(rows.filter((row) => row.complaint).length);
    expect(rows.every((row) => !row.complaint || !row.retained)).toBe(true);
  });

  it.each(['reservation marker', 'CSV destination'])('rejects a used run ID with an existing %s before any API request', async (existingResource) => {
    const directory = await makeTemporaryDirectory();
    if (existingResource === 'reservation marker') {
      await writeFile(join(directory, '.used.reservation.json'), '{"status":"complete"}');
    } else {
      await writeFile(join(directory, 'used.csv'), 'old outcomes');
    }
    const api: SimulationApi = {
      getAssignment: vi.fn(async (uid) => ({ uid, arm: 'control', enrolled: true })),
      submitAction: vi.fn(async () => undefined),
      submitComplaint: vi.fn(async () => undefined),
    };
    await expect(runSimulation(options('used'), api, directory)).rejects.toThrow(/Run ID used is unavailable|Run ID used has already been reserved/);
    expect(api.getAssignment).not.toHaveBeenCalled();
  });

  it('allows only one of two concurrent attempts to reserve a run ID', async () => {
    const directory = await makeTemporaryDirectory();
    const api: SimulationApi = {
      getAssignment: vi.fn(async (uid) => ({ uid, arm: 'control', enrolled: true })),
      submitAction: vi.fn(async () => undefined),
      submitComplaint: vi.fn(async () => undefined),
    };
    const attempts = await Promise.allSettled([
      runSimulation(options('race'), api, directory),
      runSimulation(options('race'), api, directory),
    ]);
    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === 'rejected')).toHaveLength(1);
    expect(api.getAssignment).toHaveBeenCalledTimes(1);
  });

  it('leaves a failed run reserved and rejects retry after an interrupted request', async () => {
    const directory = await makeTemporaryDirectory();
    const failedApi: SimulationApi = {
      getAssignment: vi.fn(async () => { throw new Error('simulated interruption'); }),
      submitAction: vi.fn(async () => undefined),
      submitComplaint: vi.fn(async () => undefined),
    };
    await expect(runSimulation(options('interrupted'), failedApi, directory)).rejects.toThrow(/simulated interruption/);
    const marker = JSON.parse(await readFile(join(directory, '.interrupted.reservation.json'), 'utf8')) as { status: string };
    expect(marker.status).toBe('failed');
    expect(await readdir(directory)).not.toContain('interrupted.csv');

    const retryApi: SimulationApi = {
      getAssignment: vi.fn(async (uid) => ({ uid, arm: 'control', enrolled: true })),
      submitAction: vi.fn(async () => undefined),
      submitComplaint: vi.fn(async () => undefined),
    };
    await expect(runSimulation(options('interrupted'), retryApi, directory)).rejects.toThrow(/already been reserved/);
    expect(retryApi.getAssignment).not.toHaveBeenCalled();
  });

  it('generates unique default run IDs', () => {
    const first = createDefaultRunId();
    const second = createDefaultRunId();
    expect(first).not.toBe(second);
    expect(parseArgs([]).runId).not.toBe(parseArgs([]).runId);
  });

  it.each([
    ['missing enrolled', (uid: string) => ({ uid, arm: 'control' })],
    ['string enrolled', (uid: string) => ({ uid, arm: 'control', enrolled: 'true' })],
    ['invalid arm', (uid: string) => ({ uid, arm: 'pause-ish', enrolled: true })],
    ['mismatched UID', (uid: string) => ({ uid: `${uid}_other`, arm: 'control', enrolled: true })],
    ['null response', (_uid: string) => null],
  ])('rejects %s before sending an action', async (_label, makeResponse) => {
    const api: SimulationApi = {
      getAssignment: vi.fn(async (uid) => makeResponse(uid)),
      submitAction: vi.fn(async () => undefined),
      submitComplaint: vi.fn(async () => undefined),
    };
    await expect(simulateUsers(options('invalid'), api)).rejects.toThrow(/Invalid assignment response/);
    expect(api.submitAction).not.toHaveBeenCalled();
  });

  it('aborts a stalled request, reports its identity, exits nonzero, and does not retry', async () => {
    const directory = await makeTemporaryDirectory();
    const fetcher: typeof fetch = async (_input, init) => await new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (!signal) throw new Error('Expected timeout signal.');
      signal.addEventListener('abort', () => reject(new DOMException('Timed out', 'TimeoutError')), { once: true });
    });
    const report = vi.fn();
    const fetchApi = vi.fn((_options: SimulationOptions) => createHttpApi('http://localhost:3000', 10, fetcher));
    const exitCode = await runCli(['--users', '1', '--seed', '42', '--run-id', 'timeout', '--timeout-ms', '10'], {
      outputDirectory: directory,
      apiFactory: fetchApi,
      error: report,
      log: vi.fn(),
    });
    expect(exitCode).toBe(1);
    expect(report).toHaveBeenCalledWith(expect.stringContaining('u_timeout_1'));
    expect(report).toHaveBeenCalledWith(expect.stringContaining('timed out'));
    expect(fetchApi).toHaveBeenCalledTimes(1);
    const marker = JSON.parse(await readFile(join(directory, '.timeout.reservation.json'), 'utf8')) as { status: string };
    expect(marker.status).toBe('failed');
  });

  it('rejects unknown and duplicate CLI options', () => {
    expect(() => parseArgs(['--usersx', '2'])).toThrow(/Unknown simulator option/);
    expect(() => parseArgs(['--users', '2', '--users', '3'])).toThrow(/Duplicate simulator option/);
  });
});
