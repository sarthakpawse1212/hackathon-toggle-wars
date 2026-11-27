import { describe, expect, it } from 'vitest';
import { COMPLAINT_PROBABILITIES, PERSONA_SHARES, PERSONAS, RETENTION_PROBABILITIES } from '../config/personas.js';
import { choosePersona, createSeededRandom, simulateOutcome } from '../src/model.js';

describe('simulation model', () => {
  it('is deterministic for a fixed seed', () => {
    const left = createSeededRandom(42);
    const right = createSeededRandom(42);
    expect(Array.from({ length: 20 }, left)).toEqual(Array.from({ length: 20 }, right));
  });

  it('uses the configured persona mix over a large seeded sample', () => {
    const random = createSeededRandom(105);
    const counts = Object.fromEntries(PERSONAS.map((persona) => [persona, 0])) as Record<(typeof PERSONAS)[number], number>;
    const sampleSize = 100_000;
    for (let index = 0; index < sampleSize; index += 1) counts[choosePersona(random)] += 1;
    for (const persona of PERSONAS) {
      expect(counts[persona] / sampleSize).toBeCloseTo(PERSONA_SHARES[persona], 2);
    }
  });

  it('keeps retained outcomes complaint-free and maps them to the served arm action', () => {
    expect(simulateOutcome('price', 'pause', () => 0)).toEqual({ retained: true, complaint: false, action: 'accept_pause' });
    expect(simulateOutcome('price', 'discount', () => 0)).toEqual({ retained: true, complaint: false, action: 'accept_discount' });
    expect(simulateOutcome('price', 'control', () => 0)).toEqual({ retained: true, complaint: false, action: 'keep' });
  });

  it('draws complaints only after a simulated cancellation', () => {
    const draws: number[] = [0.99, 0.01];
    expect(simulateOutcome('price', 'control', () => draws.shift() ?? 1)).toEqual({ retained: false, complaint: true, action: 'cancel' });
    expect(COMPLAINT_PROBABILITIES.price.control).toBe(0.02);
    expect(RETENTION_PROBABILITIES.price.control).toBe(0.03);
  });

  it('converges to the configured retained and complaint probabilities across all personas and arms', () => {
    const sampleSize = 50_000;
    for (const persona of PERSONAS) {
      for (const arm of ['control', 'pause', 'discount'] as const) {
        const random = createSeededRandom(persona.length * 100 + arm.length);
        let retained = 0;
        let complaints = 0;
        for (let index = 0; index < sampleSize; index += 1) {
          const outcome = simulateOutcome(persona, arm, random);
          if (outcome.retained) retained += 1;
          if (outcome.complaint) complaints += 1;
        }
        expect(retained / sampleSize).toBeCloseTo(RETENTION_PROBABILITIES[persona][arm], 2);
        const expectedComplaintRate = (1 - RETENTION_PROBABILITIES[persona][arm]) * COMPLAINT_PROBABILITIES[persona][arm];
        expect(complaints / sampleSize).toBeCloseTo(expectedComplaintRate, 2);
      }
    }
  });
});
