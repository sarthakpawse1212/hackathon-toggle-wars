import { createFlagsmith } from './flagsmith.js';
import { loadConfig } from './config.js';
import { buildServer } from './server.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const flagsmith = createFlagsmith(config);
  const app = buildServer({ flagsmith });

  try {
    await app.listen({ host: '127.0.0.1', port: config.PORT });
  } catch {
    await app.close();
    throw new Error('Server could not start. Check configuration and local Flagsmith availability.');
  }

  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    await app.close();
  };
  process.once('SIGINT', () => { void shutdown(); });
  process.once('SIGTERM', () => { void shutdown(); });
}

void main().catch((error: unknown) => {
  if (error instanceof Error && error.message.startsWith('Invalid environment configuration')) {
    process.stderr.write(`${error.message}\n`);
  } else {
    process.stderr.write('Server startup failed. Check configuration and local Flagsmith availability.\n');
  }
  process.exitCode = 1;
});
