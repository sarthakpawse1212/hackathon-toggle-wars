import { randomUUID } from 'node:crypto';
import { access, link, mkdir, open, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { choosePersona, createSeededRandom, shuffle, simulateOutcome } from '../src/model.js';
import { ARMS, type Arm } from '../src/experiment.js';
import type { Persona } from '../config/personas.js';
import { SIMULATOR_DEFAULT_TIMEOUT_MS, SIMULATOR_MIN_TIMEOUT_MS } from '../src/timeout-policy.js';

export const DEFAULT_TIMEOUT_MS = SIMULATOR_DEFAULT_TIMEOUT_MS;
const MAX_TIMEOUT_MS = 300_000;

export interface SimulationOptions { users: number; seed: number; runId: string; baseUrl: string; timeoutMs: number }
export interface AssignmentResponse { uid: string; arm: Arm; enrolled: boolean }
export interface SimulationApi {
  getAssignment(uid: string): Promise<unknown>;
  submitAction(uid: string, action: string): Promise<void>;
  submitComplaint(uid: string): Promise<void>;
}
export interface OutcomeRow {
  uid: string;
  persona: Persona;
  arm: Arm;
  enrolled: boolean;
  retained: boolean;
  complaint: boolean;
}
export interface RunReservation { runId: string; outputPath: string; markerPath: string; temporaryPath: string }

const CLI_OPTIONS = new Set(['--users', '--seed', '--run-id', '--base-url', '--timeout-ms']);

export function createDefaultRunId(): string {
  return `run_${randomUUID()}`;
}

export function parseArgs(args: string[]): SimulationOptions {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (!key?.startsWith('--') || !CLI_OPTIONS.has(key)) throw new Error(`Unknown simulator option: ${key ?? ''}`);
    if (values.has(key)) throw new Error(`Duplicate simulator option: ${key}`);
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${key}`);
    values.set(key, value);
    index += 1;
  }
  const users = Number(values.get('--users') ?? 6000);
  const seed = Number(values.get('--seed') ?? 42);
  const runId = values.get('--run-id') ?? createDefaultRunId();
  const baseUrl = values.get('--base-url') ?? 'http://localhost:3000';
  const timeoutMs = Number(values.get('--timeout-ms') ?? DEFAULT_TIMEOUT_MS);
  if (!Number.isInteger(users) || users < 1 || users > 100_000) throw new Error('--users must be an integer from 1 to 100000.');
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xFFFFFFFF) throw new Error('--seed must be an unsigned 32-bit integer.');
  if (!/^[A-Za-z0-9_-]+$/.test(runId)) throw new Error('--run-id may contain only letters, numbers, underscores, and hyphens.');
  if (!Number.isInteger(timeoutMs) || timeoutMs < SIMULATOR_MIN_TIMEOUT_MS || timeoutMs > MAX_TIMEOUT_MS) {
    throw new Error(`--timeout-ms must be an integer from ${SIMULATOR_MIN_TIMEOUT_MS} to ${MAX_TIMEOUT_MS}.`);
  }
  const url = new URL(baseUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('--base-url must be an HTTP or HTTPS URL without embedded credentials.');
  }
  return { users, seed, runId, baseUrl: url.toString().replace(/\/$/, ''), timeoutMs };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateAssignmentResponse(value: unknown, requestedUid: string): AssignmentResponse {
  if (!isRecord(value)) throw new Error(`Invalid assignment response for identity ${requestedUid}: expected an object.`);
  if (typeof value.uid !== 'string' || value.uid.trim().length === 0 || value.uid !== requestedUid) {
    throw new Error(`Invalid assignment response for identity ${requestedUid}: UID is missing or does not match.`);
  }
  if (typeof value.arm !== 'string' || !ARMS.includes(value.arm as Arm)) {
    throw new Error(`Invalid assignment response for identity ${requestedUid}: arm is invalid.`);
  }
  if (typeof value.enrolled !== 'boolean') {
    throw new Error(`Invalid assignment response for identity ${requestedUid}: enrolled must be a boolean.`);
  }
  return { uid: value.uid, arm: value.arm as Arm, enrolled: value.enrolled };
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (isRecord(error) && error.code === 'ENOENT') return false;
    throw error;
  }
}

/** The exclusive persistent marker is the run-ID reservation. Never remove it, including on failure. */
export async function reserveRun(outputDirectory: string, runId: string, seed: number): Promise<RunReservation> {
  if (!/^[A-Za-z0-9_-]+$/.test(runId)) throw new Error('Invalid run ID.');
  await mkdir(outputDirectory, { recursive: true });
  const reservation: RunReservation = {
    runId,
    outputPath: resolve(outputDirectory, `${runId}.csv`),
    markerPath: resolve(outputDirectory, `.${runId}.reservation.json`),
    temporaryPath: resolve(outputDirectory, `.${runId}.csv.partial`),
  };
  if (await pathExists(reservation.outputPath)) throw new Error(`Run ID ${runId} is unavailable: its CSV already exists.`);
  if (await pathExists(reservation.temporaryPath)) throw new Error(`Run ID ${runId} is unavailable: a partial output exists.`);

  let marker;
  try {
    marker = await open(reservation.markerPath, 'wx');
  } catch (error) {
    if (isRecord(error) && error.code === 'EEXIST') throw new Error(`Run ID ${runId} has already been reserved and cannot be reused.`);
    throw error;
  }
  try {
    // If this process is interrupted, the exclusive marker remains and permanently consumes the ID.
    await marker.writeFile(JSON.stringify({ runId, seed, status: 'running', startedAt: new Date().toISOString() }, null, 2), 'utf8');
    await marker.sync();
  } finally {
    await marker.close();
  }

  // Catch an output created by an external process between the initial check and reservation.
  if (await pathExists(reservation.outputPath)) {
    await setReservationStatus(reservation, 'failed', 'CSV destination appeared during reservation.');
    throw new Error(`Run ID ${runId} is unavailable: its CSV destination already exists.`);
  }
  return reservation;
}

async function setReservationStatus(reservation: RunReservation, status: 'complete' | 'failed', detail?: string): Promise<void> {
  const marker = await open(reservation.markerPath, 'r+');
  try {
    await marker.truncate(0);
    await marker.writeFile(JSON.stringify({ runId: reservation.runId, status, ...(detail ? { detail } : {}), updatedAt: new Date().toISOString() }, null, 2), 'utf8');
    await marker.sync();
  } finally {
    await marker.close();
  }
}

async function requestJson(url: string, uid: string, method: string, timeoutMs: number, fetcher: typeof fetch, init?: RequestInit): Promise<unknown> {
  try {
    const response = await fetcher(url, { ...init, method, signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json() as unknown;
  } catch (error) {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw new Error(`Request timed out after ${timeoutMs} ms for identity ${uid} (${method}).`);
    }
    const reason = error instanceof Error ? error.message : 'unknown network or response error';
    throw new Error(`Request failed for identity ${uid} (${method}): ${reason}`);
  }
}

export function createHttpApi(baseUrl: string, timeoutMs: number, fetcher: typeof fetch = fetch): SimulationApi {
  return {
    getAssignment: (uid) => requestJson(`${baseUrl}/account/cancel?uid=${encodeURIComponent(uid)}`, uid, 'GET', timeoutMs, fetcher, {
      headers: { accept: 'application/json' },
    }),
    async submitAction(uid, action) {
      await requestJson(`${baseUrl}/account/cancel/action`, uid, 'POST', timeoutMs, fetcher, {
        headers: { 'content-type': 'application/json' }, body: JSON.stringify({ uid, action }),
      });
    },
    async submitComplaint(uid) {
      await requestJson(`${baseUrl}/account/complaint`, uid, 'POST', timeoutMs, fetcher, {
        headers: { 'content-type': 'application/json' }, body: JSON.stringify({ uid }),
      });
    },
  };
}

export async function simulateUsers(options: SimulationOptions, api: SimulationApi): Promise<OutcomeRow[]> {
  const random = createSeededRandom(options.seed);
  const prepared = Array.from({ length: options.users }, (_, index) => ({
    uid: `u_${options.runId}_${index + 1}`,
    persona: choosePersona(random),
  }));
  const rows: OutcomeRow[] = [];

  for (const user of shuffle(prepared, random)) {
    const assignment = validateAssignmentResponse(await api.getAssignment(user.uid), user.uid);
    const outcome = simulateOutcome(user.persona, assignment.arm, random);
    await api.submitAction(user.uid, outcome.action);
    if (outcome.complaint) await api.submitComplaint(user.uid);
    rows.push({ uid: user.uid, persona: user.persona, arm: assignment.arm, enrolled: assignment.enrolled, retained: outcome.retained, complaint: outcome.complaint });
  }
  return rows;
}

export function toCsv(rows: OutcomeRow[]): string {
  const header = 'uid,persona,arm,enrolled,retained,complaint,simulated';
  const body = rows.map((row) => [row.uid, row.persona, row.arm, row.enrolled, row.retained, row.complaint, true].join(','));
  return `${header}\n${body.join('\n')}\n`;
}

export async function runSimulation(
  options: SimulationOptions,
  api: SimulationApi,
  outputDirectory = resolve(process.cwd(), 'results'),
): Promise<{ rows: OutcomeRow[]; outputPath: string }> {
  const reservation = await reserveRun(outputDirectory, options.runId, options.seed);
  try {
    const rows = await simulateUsers(options, api);
    await writeFile(reservation.temporaryPath, toCsv(rows), { encoding: 'utf8', flag: 'wx' });
    // link() publishes the completed file atomically and refuses to overwrite an existing destination.
    await link(reservation.temporaryPath, reservation.outputPath);
    await unlink(reservation.temporaryPath);
    await setReservationStatus(reservation, 'complete');
    return { rows, outputPath: reservation.outputPath };
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown simulator error.';
    try { await setReservationStatus(reservation, 'failed', detail); } catch { /* Keep the exclusive marker even if status update fails. */ }
    try { await unlink(reservation.temporaryPath); } catch { /* A leftover partial remains protected by the marker. */ }
    throw error;
  }
}

export interface RunCliDependencies {
  outputDirectory?: string;
  apiFactory?: (options: SimulationOptions) => SimulationApi;
  log?: (message: string) => void;
  error?: (message: string) => void;
}

export async function runCli(args: string[], dependencies: RunCliDependencies = {}): Promise<number> {
  const log = dependencies.log ?? console.log;
  const reportError = dependencies.error ?? console.error;
  try {
    const options = parseArgs(args);
    const api = (dependencies.apiFactory ?? ((opts) => createHttpApi(opts.baseUrl, opts.timeoutMs)))(options);
    const { rows, outputPath } = await runSimulation(options, api, dependencies.outputDirectory);
    const summary = Object.fromEntries(ARMS.map((arm) => {
      const armRows = rows.filter((row) => row.arm === arm);
      const enrolledRows = armRows.filter((row) => row.enrolled);
      return [arm, {
        assigned: armRows.length,
        enrolled: enrolledRows.length,
        retainedRate: enrolledRows.length ? enrolledRows.filter((row) => row.retained).length / enrolledRows.length : null,
        complaintRate: enrolledRows.length ? enrolledRows.filter((row) => row.complaint).length / enrolledRows.length : null,
      }];
    }));
    log(`SIMULATED behavior only. ${rows.length} synthetic identities; run-id=${options.runId}; seed=${options.seed}; CSV: ${outputPath}`);
    if (rows.some((row) => !row.enrolled)) log('Some identities were not enrolled; rates exclude those fallback-control outcomes.');
    log(JSON.stringify(summary, null, 2));
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown simulator error.';
    reportError(`Simulation failed: ${message}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await runCli(process.argv.slice(2));
}
