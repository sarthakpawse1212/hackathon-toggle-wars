import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('environment configuration', () => {
  it('requires a server key', () => {
    expect(() => loadConfig({ FLAGSMITH_SERVER_KEY: '' })).toThrow(/FLAGSMITH_SERVER_KEY/);
  });

  it('does not echo any secret value in configuration errors', () => {
    const secret = 'test-only-do-not-echo';
    let message = '';
    try {
      loadConfig({ FLAGSMITH_SERVER_KEY: secret, FLAGSMITH_EVENTS_URL: 'not-a-url' });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain('FLAGSMITH_EVENTS_URL');
    expect(message).not.toContain(secret);
  });

  it('uses the documented local endpoints and validates the port', () => {
    expect(loadConfig({ FLAGSMITH_SERVER_KEY: 'test-only-key' })).toMatchObject({
      FLAGSMITH_SDK_API_URL: 'http://localhost:8000/api/v1/',
      FLAGSMITH_EVENTS_URL: 'http://localhost:8000/api/',
      PORT: 3000,
    });
    expect(() => loadConfig({ FLAGSMITH_SERVER_KEY: 'test-only-key', PORT: '70000' })).toThrow(/PORT/);
  });
});
