const recentFailures = [];
const recentSuccesses = [];

const MAX_EVENTS = 100;

function now() {
  return new Date().toISOString();
}

function trim(list) {
  if (list.length > MAX_EVENTS) {
    list.splice(
      0,
      list.length - MAX_EVENTS,
    );
  }
}

export function logProviderSuccess({
  provider,
  endpoint = null,
  status = 200,
  durationMs = null,
  items = null,
} = {}) {
  const event = {
    time: now(),
    provider,
    endpoint,
    status,
    durationMs,
    items,
  };

  recentSuccesses.push(event);
  trim(recentSuccesses);

  console.log(
    `[AEMA_PROVIDER_OK] ${provider}` +
      ` status=${status}` +
      (durationMs !== null
        ? ` duration=${durationMs}ms`
        : "") +
      (items !== null
        ? ` items=${items}`
        : "") +
      (endpoint
        ? ` endpoint=${endpoint}`
        : ""),
  );

  return event;
}

export function logProviderFailure({
  provider,
  endpoint = null,
  status = null,
  error = null,
  durationMs = null,
} = {}) {
  const message =
    error instanceof Error
      ? error.message
      : String(
          error ??
            "UNKNOWN_PROVIDER_ERROR",
        );

  const event = {
    time: now(),
    provider,
    endpoint,
    status,
    durationMs,
    error: message,
  };

  recentFailures.push(event);
  trim(recentFailures);

  console.error(
    `[AEMA_PROVIDER_ERROR] ${provider}` +
      (status !== null
        ? ` status=${status}`
        : "") +
      (durationMs !== null
        ? ` duration=${durationMs}ms`
        : "") +
      (endpoint
        ? ` endpoint=${endpoint}`
        : "") +
      ` error=${message}`,
  );

  return event;
}

export function getProviderDiagnostics() {
  return {
    generatedAt: now(),

    summary: {
      successes:
        recentSuccesses.length,
      failures:
        recentFailures.length,
    },

    recentSuccesses:
      [...recentSuccesses].reverse(),

    recentFailures:
      [...recentFailures].reverse(),
  };
}

export function clearProviderDiagnostics() {
  recentFailures.length = 0;
  recentSuccesses.length = 0;
}