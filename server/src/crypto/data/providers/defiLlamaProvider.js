/**
 * AEMA Crypto — DefiLlama Provider
 * Phase 6.40 — freshness metadata
 */

const BASE = "https://api.llama.fi";

let lastProtocolsFetchMetadata = null;

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(
      `DefiLlama ${response.status}: ${await response.text()}`,
    );
  }

  return response.json();
}

export async function listDefiLlamaProtocols() {
  const rows = await fetchJson(`${BASE}/protocols`);
  const fetchedAt = new Date().toISOString();

  lastProtocolsFetchMetadata = Object.freeze({
    source: "DEFILLAMA_PROTOCOLS",
    fetchedAt,
    sourceTimestamp: null,
    timestampAuthority: "AEMA_PROVIDER_FETCH_TIME",
    executionAuthority: false,
    liveExecution: false,
  });

  return Array.isArray(rows) ? rows : [];
}

export function getDefiLlamaProtocolsFetchMetadata() {
  return lastProtocolsFetchMetadata
    ? { ...lastProtocolsFetchMetadata }
    : null;
}

export default {
  listDefiLlamaProtocols,
  getDefiLlamaProtocolsFetchMetadata,
};
