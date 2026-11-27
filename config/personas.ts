export const PERSONAS = ['price', 'not_using', 'competitor', 'accidental'] as const;
export type Persona = (typeof PERSONAS)[number];

export const PERSONA_SHARES: Record<Persona, number> = {
  price: 0.35,
  not_using: 0.30,
  competitor: 0.20,
  accidental: 0.15,
};

export const RETENTION_PROBABILITIES: Record<Persona, Record<'control' | 'pause' | 'discount', number>> = {
  price: { control: 0.03, pause: 0.15, discount: 0.45 },
  not_using: { control: 0.03, pause: 0.45, discount: 0.12 },
  competitor: { control: 0.01, pause: 0.05, discount: 0.12 },
  accidental: { control: 0.50, pause: 0.60, discount: 0.60 },
};

export const COMPLAINT_PROBABILITIES: Record<Persona, Record<'control' | 'pause' | 'discount', number>> = {
  price: { control: 0.02, pause: 0.04, discount: 0.05 },
  not_using: { control: 0.02, pause: 0.03, discount: 0.07 },
  competitor: { control: 0.02, pause: 0.08, discount: 0.12 },
  accidental: { control: 0.02, pause: 0.02, discount: 0.03 },
};
