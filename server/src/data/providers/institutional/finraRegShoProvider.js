// server/src/data/providers/institutional/finraRegShoProvider.js
const DEFAULT_CONFIG = Object.freeze({
  tokenUrl: "https://ews.fip.finra.org/fip/rest/ews/oauth2/access_token?grant_type=client_credentials",
  apiBaseUrl: "https://api.finra.org",
  group: "otcMarket",
  dataset: "regShoDaily",
  timeoutMs: 15000,
  tokenRefreshSkewMs: 60000,
  maxRetries: 2,
  retryBaseDelayMs: 500,
});

let cachedToken = null;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function normalizeSymbol(value) {
  return String(value ?? "").trim().toUpperCase();
}
function isFiniteNumber(value) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
}
function credentials(config) {
  const clientId = String(config.clientId ?? process.env.FINRA_CLIENT_ID ?? "").trim();
  const clientSecret = String(config.clientSecret ?? process.env.FINRA_CLIENT_SECRET ?? "").trim();
  if (!clientId || !clientSecret) {
    throw new Error("FINRA_CLIENT_ID and FINRA_CLIENT_SECRET are required.");
  }
  return { clientId, clientSecret };
}
function basicAuth(clientId, clientSecret) {
  return Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64");
}
async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
async function getAccessToken(config) {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt - config.tokenRefreshSkewMs > now) {
    return cachedToken.token;
  }
  const { clientId, clientSecret } = credentials(config);
  const response = await fetchWithTimeout(
    config.tokenUrl,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth(clientId, clientSecret)}`,
        Accept: "application/json",
      },
    },
    config.timeoutMs,
  );
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`FINRA token request failed with HTTP ${response.status}: ${body}`);
  }
  const payload = await response.json();
  if (!payload?.access_token) throw new Error("FINRA token response did not include access_token.");
  const expiresIn = Math.max(60, Number(payload.expires_in ?? 0));
  cachedToken = {
    token: payload.access_token,
    expiresAt: now + expiresIn * 1000,
  };
  return cachedToken.token;
}
async function queryDataset(config, payload) {
  let lastError;
  for (let attempt = 0; attempt <= config.maxRetries; attempt += 1) {
    try {
      const token = await getAccessToken(config);
      const url = `${config.apiBaseUrl}/data/group/${config.group}/name/${config.dataset}`;
      const response = await fetchWithTimeout(
        url,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
        config.timeoutMs,
      );
      if (response.status === 401) {
        cachedToken = null;
        throw new Error("FINRA access token was rejected.");
      }
      if (response.status === 429 || response.status >= 500) {
        throw new Error(`FINRA temporary response ${response.status}.`);
      }
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`FINRA query failed with HTTP ${response.status}: ${body}`);
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt >= config.maxRetries) break;
      await sleep(config.retryBaseDelayMs * 2 ** attempt);
    }
  }
  throw lastError;
}
export function normalizeFinraRegShoRow(row) {
  const totalVolume = isFiniteNumber(row?.totalParQuantity) ? Number(row.totalParQuantity) : null;
  const shortVolume = isFiniteNumber(row?.shortParQuantity) ? Number(row.shortParQuantity) : null;
  const shortExemptVolume = isFiniteNumber(row?.shortExemptParQuantity)
    ? Number(row.shortExemptParQuantity)
    : 0;
  return {
    source: "FINRA",
    sourceType: "REG_SHO_DAILY_SHORT_VOLUME",
    symbol: normalizeSymbol(row?.securitiesInformationProcessorSymbolIdentifier),
    tradeDate: row?.tradeReportDate ?? null,
    reportingFacilityCode: row?.reportingFacilityCode ?? null,
    marketCode: row?.marketCode ?? null,
    shortVolume,
    shortExemptVolume,
    totalVolume,
    shortVolumeRatio:
      totalVolume && totalVolume > 0 && shortVolume !== null ? shortVolume / totalVolume : null,
    interpretation: "SHORT_VOLUME_PROXY_NOT_SHORT_INTEREST",
  };
}
export function aggregateFinraRegShoRows(rows) {
  const normalized = Array.isArray(rows) ? rows.map(normalizeFinraRegShoRow) : [];
  const usable = normalized.filter(x => x.totalVolume > 0 && x.shortVolume !== null);
  const totalVolume = usable.reduce((sum, x) => sum + x.totalVolume, 0);
  const shortVolume = usable.reduce((sum, x) => sum + x.shortVolume, 0);
  const shortExemptVolume = usable.reduce((sum, x) => sum + (x.shortExemptVolume ?? 0), 0);
  return {
    rows: normalized,
    totalVolume,
    shortVolume,
    shortExemptVolume,
    shortVolumeRatio: totalVolume > 0 ? shortVolume / totalVolume : null,
  };
}
export function createFinraRegShoProvider(configOverrides = {}) {
  const config = { ...DEFAULT_CONFIG, ...configOverrides };
  async function testAuthentication() {
    const token = await getAccessToken(config);
    return {
      approved: Boolean(token),
      engine: "FINRA_AUTH",
      status: token ? "CONNECTED" : "ERROR",
    };
  }
  async function getDailyShortVolume({ symbol, tradeDate = null, limit = 100 } = {}) {
    const normalizedSymbol = normalizeSymbol(symbol);
    if (!normalizedSymbol) throw new Error("A valid symbol is required.");
    const compareFilters = [{
      compareType: "equal",
      fieldName: "securitiesInformationProcessorSymbolIdentifier",
      fieldValue: normalizedSymbol,
    }];
    if (tradeDate) {
      compareFilters.push({
        compareType: "equal",
        fieldName: "tradeReportDate",
        fieldValue: tradeDate,
      });
    }
    const rawRows = await queryDataset(config, {
      limit,
      fields: [
        "tradeReportDate",
        "securitiesInformationProcessorSymbolIdentifier",
        "reportingFacilityCode",
        "marketCode",
        "shortParQuantity",
        "shortExemptParQuantity",
        "totalParQuantity",
      ],
      compareFilters,
    });
    const aggregate = aggregateFinraRegShoRows(rawRows);
    return {
      approved: true,
      engine: "FINRA_REG_SHO_PROVIDER",
      status: aggregate.rows.length ? "COMPLETE" : "NO_DATA",
      symbol: normalizedSymbol,
      tradeDate,
      ...aggregate,
      errors: [],
      warnings: [
        "FINRA daily short-sale volume is not short interest and is only a positioning/pressure proxy.",
      ],
    };
  }
  return { testAuthentication, getDailyShortVolume };
}
export function clearFinraTokenCache() {
  cachedToken = null;
}
export default createFinraRegShoProvider;
