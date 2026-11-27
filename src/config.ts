import 'dotenv/config';
import { z } from 'zod';

const configSchema = z.object({
  FLAGSMITH_SERVER_KEY: z.string().trim().min(1),
  FLAGSMITH_SDK_API_URL: z.string().url().default('http://localhost:8000/api/v1/'),
  FLAGSMITH_EVENTS_URL: z.string().url().default('http://localhost:8000/api/'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
});

export type AppConfig = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = configSchema.safeParse(env);
  if (!parsed.success) {
    const fieldNames = parsed.error.issues
      .map((issue) => issue.path.join('.'))
      .filter(Boolean)
      .join(', ');
    throw new Error(`Invalid environment configuration (${fieldNames}). Check .env.example.`);
  }
  return parsed.data;
}
