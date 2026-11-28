import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { analyzeCsv, analyzeRows } from '../scripts/analyze-results.js';

const tempDirs: string[] = [];
async function tempDir(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'cancel-analysis-test-'));
  tempDirs.push(path);
  return path;
}
afterEach(async () => Promise.all(tempDirs.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

const csv = [
  'uid,persona,arm,enrolled,retained,complaint,simulated',
  'u_control_1,price,control,true,true,false,true',
  'u_control_2,not_using,control,true,false,false,true',
  'u_pause_1,price,pause,true,false,true,true',
  'u_pause_2,accidental,pause,false,true,false,true',
  'u_discount_1,price,discount,true,true,false,true',
  'u_discount_2,competitor,discount,true,false,false,true',
].join('\n') + '\n';

describe('results analysis', () => {
  it('summarizes enrolled outcomes, computes guardrail differences, and never invents win probability', () => {
    const report = analyzeRows([
      { uid: 'u_control_1', persona: 'price', arm: 'control', enrolled: true, retained: true, complaint: false, simulated: true },
      { uid: 'u_control_2', persona: 'not_using', arm: 'control', enrolled: true, retained: false, complaint: false, simulated: true },
      { uid: 'u_pause_1', persona: 'price', arm: 'pause', enrolled: true, retained: false, complaint: true, simulated: true },
      { uid: 'u_discount_1', persona: 'price', arm: 'discount', enrolled: true, retained: true, complaint: false, simulated: true },
    ], 'demo');
    expect(report.arms.control.retained).toEqual({ numerator: 1, denominator: 2, rate: 0.5 });
    expect(report.arms.pause.complaintDifferencePercentagePoints).toBe(100);
    expect(report.arms.pause.passesComplaintGuardrail).toBe(false);
    expect(report.descriptiveBestEligibleTreatment).toBe('discount');
    expect(report.flagsmithWinProbability).toBeNull();
    expect(report.flagsmithStatisticalResult).toBe('unavailable_from_csv');
    expect(report.decision).toContain('No statistically confirmed winner');
  });

  it('requires a complete reservation and safely analyzes a finished CSV to human and machine output', async () => {
    const directory = await tempDir();
    const csvPath = join(directory, 'run_one.csv');
    const jsonPath = join(directory, 'run_one.analysis.json');
    await writeFile(csvPath, csv);
    await writeFile(join(directory, '.run_one.reservation.json'), JSON.stringify({ runId: 'run_one', status: 'complete' }));
    const result = await analyzeCsv(csvPath);
    expect(result.report.totalRows).toBe(6);
    expect(result.report.enrolledIdentities).toBe(5);
    expect(result.report.arms.pause.enrolled).toBe(1);
    expect(result.report.arms.pause.retained.denominator).toBe(1);
    expect(result.report.arms.control.assigned).toBe(2);
    expect(result.jsonPath).toBe(jsonPath);
    expect(JSON.parse(await readFile(jsonPath, 'utf8')).flagsmithWinProbability).toBeNull();
    await expect(analyzeCsv(csvPath)).rejects.toThrow(/already exists|EEXIST/);
  });

  it('rejects incomplete runs, duplicate identities, malformed fields, and missing arm denominators safely', async () => {
    const directory = await tempDir();
    const csvPath = join(directory, 'pending.csv');
    await writeFile(csvPath, csv);
    await writeFile(join(directory, '.pending.reservation.json'), JSON.stringify({ runId: 'pending', status: 'running' }));
    await expect(analyzeCsv(csvPath)).rejects.toThrow(/not marked complete/);

    const duplicate = csv.replace('u_control_2,not_using', 'u_control_1,not_using');
    await expect(analyzeRowsFromCsv(duplicate)).rejects.toThrow(/Duplicate identity/);
    await expect(analyzeRowsFromCsv(csv.replace(',true,true,false,true', ',true,TRUE,false,true'))).rejects.toThrow(/Invalid retained/);
    const onlyControl = analyzeRows([
      { uid: 'u_control', persona: 'price', arm: 'control', enrolled: true, retained: false, complaint: false, simulated: true },
    ], 'small');
    expect(onlyControl.arms.pause.retained.rate).toBeNull();
    expect(onlyControl.arms.discount.complaints.rate).toBeNull();
    expect(onlyControl.descriptiveBestEligibleTreatment).toBeNull();
    expect(onlyControl.flagsmithWinProbability).toBeNull();
  });
});

async function analyzeRowsFromCsv(content: string): Promise<unknown> {
  const directory = await tempDir();
  const path = join(directory, 'bad.csv');
  await writeFile(path, content);
  await writeFile(join(directory, '.bad.reservation.json'), JSON.stringify({ runId: 'bad', status: 'complete' }));
  return analyzeCsv(path);
}
