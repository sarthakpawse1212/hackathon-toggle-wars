/** Keep the caller deadline longer than the Flagsmith SDK's bounded retry window. */
export const FLAGSMITH_REQUEST_TIMEOUT_SECONDS = 10;
export const FLAGSMITH_RETRIES = 3;
export const FLAGSMITH_RETRY_DELAY_MS = 1_000;
export const FLAGSMITH_MAX_REQUEST_DURATION_MS =
  (FLAGSMITH_RETRIES + 1) * FLAGSMITH_REQUEST_TIMEOUT_SECONDS * 1_000 +
  FLAGSMITH_RETRIES * FLAGSMITH_RETRY_DELAY_MS;

// Allows a small scheduling/serialization margin beyond the SDK's 43-second upper bound.
export const SIMULATOR_DEFAULT_TIMEOUT_MS = 50_000;
export const SIMULATOR_MIN_TIMEOUT_MS = FLAGSMITH_MAX_REQUEST_DURATION_MS + 2_000;
