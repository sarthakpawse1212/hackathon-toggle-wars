import { link, open, readFile, unlink } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ARMS, type Arm } from '../src/experiment.js';
import { PERSONAS, type Persona } from '../config/personas.js';

const COLUMNS = ['uid', 'persona', 'arm', 'enrolled', 'retained', 'complaint', 'simulated'] as const;
type CsvRecord = { uid: string; persona: Persona; arm: Arm; enrolled: boolean; retained: boolean; complaint: boolean; simulated: true };
type Rate = { numerator: number; denominator: number; rate: number | null };

export interface ArmAnalysis {
  assigned: number;
  enrolled: number;
  retained: Rate;
  complaints: Rate;
  retentionLiftPercentagePoints: number | null;
  complaintDifferencePercentagePoints: number | null;
  passesComplaintGuardrail: boolean | null;
}

export interface AnalysisReport {
  disclosure: 'Synthetic identities and modeled behavior; descriptive rates are not real customer evidence.';
  runId: string;
  totalRows: number;
  enrolledIdentities: number;
  dataCompleteness: 'all_arms_have_enrolled_identities' | 'incomplete_missing_arm_or_enrollment';
  arms: Record<Arm, ArmAnalysis>;
  flagsmithWinProbability: null;
  flagsmithStatisticalResult: 'unavailable_from_csv';
  descriptiveBestEligibleTreatment: Arm | null;
  decision: string;
}

function parseCsv(content: string): CsvRecord[] {
  const lines = content.replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/);
  const headers = lines.shift()?.split(',');
  if (!headers || headers.length !== COLUMNS.length || headers.some((column, index) => column !== COLUMNS[index])) {
    throw new Error(`CSV header must be exactly: ${COLUMNS.join(',')}`);
  }
  if (lines.length === 0 || lines.some((line) => line.length === 0)) throw new Error('CSV must contain at least one complete data row.');
  const seen = new Set<string>();
  return lines.map((line, index) => {
    const fields = line.split(',');
    if (fields.length !== COLUMNS.length || fields.some((field) => field.includes('"'))) throw new Error(`Invalid CSV row ${index + 2}.`);
    const [uid, persona, arm, enrolled, retained, complaint, simulated] = fields;
    if (!uid || !/^[A-Za-z0-9_-]+$/.test(uid)) throw new Error(`Invalid identity in CSV row ${index + 2}.`);
    if (seen.has(uid)) throw new Error(`Duplicate identity in CSV: ${uid}.`);
    seen.add(uid);
    if (!PERSONAS.includes(persona as Persona)) throw new Error(`Invalid persona in CSV row ${index + 2}.`);
    if (!ARMS.includes(arm as Arm)) throw new Error(`Invalid arm in CSV row ${index + 2}.`);
    const parseBoolean = (value: string | undefined, field: string): boolean => {
      if (value === 'true') return true;
      if (value === 'false') return false;
      throw new Error(`Invalid ${field} value in CSV row ${index + 2}.`);
    };
    if (simulated !== 'true') throw new Error(`CSV row ${index + 2} must disclose simulated=true.`);
    const retainedValue = parseBoolean(retained, 'retained');
    const complaintValue = parseBoolean(complaint, 'complaint');
    if (retainedValue && complaintValue) throw new Error(`Retained identity cannot also have a cancellation complaint in CSV row ${index + 2}.`);
    return {
      uid,
      persona: persona as Persona,
      arm: arm as Arm,
      enrolled: parseBoolean(enrolled, 'enrolled'),
      retained: retainedValue,
      complaint: complaintValue,
      simulated: true,
    };
  });
}

function makeRate(numerator: number, denominator: number): Rate {
  return { numerator, denominator, rate: denominator > 0 ? numerator / denominator : null };
}

export function analyzeRows(rows: CsvRecord[], runId: string): AnalysisReport {
  const grouped = Object.fromEntries(ARMS.map((arm) => [arm, rows.filter((row) => row.arm === arm)])) as Record<Arm, CsvRecord[]>;
  const enrolledTotal = rows.filter((row) => row.enrolled).length;
  const preliminary = Object.fromEntries(ARMS.map((arm) => {
    const enrolled = grouped[arm].filter((row) => row.enrolled);
    return [arm, {
      assigned: grouped[arm].length,
      enrolled: enrolled.length,
      retained: makeRate(enrolled.filter((row) => row.retained).length, enrolled.length),
      complaints: makeRate(enrolled.filter((row) => row.complaint).length, enrolled.length),
      retentionLiftPercentagePoints: null,
      complaintDifferencePercentagePoints: null,
      passesComplaintGuardrail: null,
    } satisfies ArmAnalysis];
  })) as Record<Arm, ArmAnalysis>;
  const control = preliminary.control;
  for (const arm of ARMS) {
    const summary = preliminary[arm];
    if (summary.retained.rate !== null && control.retained.rate !== null) {
      summary.retentionLiftPercentagePoints = (summary.retained.rate - control.retained.rate) * 100;
    }
    if (summary.complaints.rate !== null && control.complaints.rate !== null) {
      summary.complaintDifferencePercentagePoints = (summary.complaints.rate - control.complaints.rate) * 100;
      summary.passesComplaintGuardrail = arm === 'control' || summary.complaintDifferencePercentagePoints <= 2;
    }
  }
  const eligible = (['pause', 'discount'] as const).filter((arm) =>
    preliminary[arm].passesComplaintGuardrail === true && preliminary[arm].retained.rate !== null,
  );
  const best = eligible.reduce<Arm | null>((current, arm) => {
    if (current === null || preliminary[arm].retained.rate! > preliminary[current].retained.rate!) return arm;
    return current;
  }, null);
  const dataCompleteness = ARMS.every((arm) => preliminary[arm].enrolled > 0)
    ? 'all_arms_have_enrolled_identities' as const
    : 'incomplete_missing_arm_or_enrollment' as const;
  const decision = dataCompleteness === 'incomplete_missing_arm_or_enrollment'
    ? 'Insufficient arm coverage: at least one arm has no enrolled identities. Collect complete data before applying the decision rule.'
    : eligible.length === 0
    ? 'No treatment passes the complaint guardrail with available enrolled data; retain control pending complete data.'
    : 'No statistically confirmed winner: CSV does not contain Flagsmith win probability. Review the running experiment in Flagsmith; the descriptive best eligible treatment is not a decision.';
  return {
    disclosure: 'Synthetic identities and modeled behavior; descriptive rates are not real customer evidence.',
    runId,
    totalRows: rows.length,
    enrolledIdentities: enrolledTotal,
    dataCompleteness,
    arms: preliminary,
    flagsmithWinProbability: null,
    flagsmithStatisticalResult: 'unavailable_from_csv',
    descriptiveBestEligibleTreatment: best,
    decision,
  };
}

function parseArgs(args: string[]): { csvPath: string; jsonPath?: string } {
  const values = new Map<string, string>();
  for (let i = 0; i < args.length; i += 1) {
    const option = args[i];
    if (option !== '--csv' && option !== '--json-out') throw new Error(`Unknown analysis option: ${option ?? ''}`);
    if (values.has(option)) throw new Error(`Duplicate analysis option: ${option}`);
    const value = args[i + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${option}`);
    values.set(option, value);
    i += 1;
  }
  const csvPath = values.get('--csv');
  if (!csvPath) throw new Error('Usage: npm run analyze -- --csv results/<completed-run>.csv [--json-out <path>]');
  return { csvPath: resolve(csvPath), ...(values.has('--json-out') ? { jsonPath: resolve(values.get('--json-out')!) } : {}) };
}

async function publishJson(path: string, content: string): Promise<void> {
  const temporaryPath = `${path}.${process.pid}.${Date.now()}.partial`;
  const handle = await open(temporaryPath, 'wx');
  try {
    await handle.writeFile(content, 'utf8');
    await handle.sync();
  } catch (error) {
    await handle.close();
    throw error;
  }
  await handle.close();
  try {
    await link(temporaryPath, path);
  } finally {
    await unlink(temporaryPath).catch(() => undefined);
  }
}

export async function analyzeCsv(csvPath: string, jsonPath?: string): Promise<{ report: AnalysisReport; jsonPath: string }> {
  const absoluteCsv = resolve(csvPath);
  const runId = basename(absoluteCsv, extname(absoluteCsv));
  if (!/^[A-Za-z0-9_-]+$/.test(runId) || extname(absoluteCsv).toLowerCase() !== '.csv') throw new Error('Input must be a simulator CSV named <run-id>.csv.');
  const markerPath = join(dirname(absoluteCsv), `.${runId}.reservation.json`);
  let marker: unknown;
  try { marker = JSON.parse(await readFile(markerPath, 'utf8')) as unknown; } catch { throw new Error(`A valid completed run reservation is required: ${markerPath}`); }
  if (typeof marker !== 'object' || marker === null || !('status' in marker) || marker.status !== 'complete' || !('runId' in marker) || marker.runId !== runId) {
    throw new Error(`Run ${runId} is not marked complete; incomplete runs cannot be analyzed.`);
  }
  const report = analyzeRows(parseCsv(await readFile(absoluteCsv, 'utf8')), runId);
  const output = jsonPath ?? join(dirname(absoluteCsv), `${runId}.analysis.json`);
  await publishJson(output, `${JSON.stringify(report, null, 2)}\n`);
  return { report, jsonPath: output };
}

export async function runAnalysisCli(args: string[]): Promise<number> {
  try {
    const { csvPath, jsonPath } = parseArgs(args);
    const result = await analyzeCsv(csvPath, jsonPath);
    console.log(JSON.stringify(result.report, null, 2));
    console.log(`Machine-readable summary: ${result.jsonPath}`);
    return 0;
  } catch (error) {
    console.error(`Analysis failed: ${error instanceof Error ? error.message : 'Unknown analysis error.'}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await runAnalysisCli(process.argv.slice(2));
}
