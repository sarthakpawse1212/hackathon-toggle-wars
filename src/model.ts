import {
  COMPLAINT_PROBABILITIES,
  PERSONA_SHARES,
  PERSONAS,
  RETENTION_PROBABILITIES,
  type Persona,
} from '../config/personas.js';
import type { Arm } from './experiment.js';

export type RandomSource = () => number;

function draw(probability: number, random: RandomSource): boolean {
  return random() < probability;
}

export function choosePersona(random: RandomSource): Persona {
  const value = random();
  let cumulative = 0;
  for (const persona of PERSONAS) {
    cumulative += PERSONA_SHARES[persona];
    if (value < cumulative) return persona;
  }
  return PERSONAS[PERSONAS.length - 1];
}

export interface SimulatedOutcome {
  retained: boolean;
  complaint: boolean;
  action: 'keep' | 'accept_pause' | 'accept_discount' | 'cancel';
}

export function simulateOutcome(persona: Persona, arm: Arm, random: RandomSource): SimulatedOutcome {
  const retained = draw(RETENTION_PROBABILITIES[persona][arm], random);
  if (retained) {
    const action = arm === 'pause' ? 'accept_pause' : arm === 'discount' ? 'accept_discount' : 'keep';
    return { retained: true, complaint: false, action };
  }

  const complaint = draw(COMPLAINT_PROBABILITIES[persona][arm], random);
  return { retained: false, complaint, action: 'cancel' };
}

/** Mulberry32 PRNG: deterministic for reproducible, explicitly simulated runs. */
export function createSeededRandom(seed: number): RandomSource {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function shuffle<T>(items: T[], random: RandomSource): T[] {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}
