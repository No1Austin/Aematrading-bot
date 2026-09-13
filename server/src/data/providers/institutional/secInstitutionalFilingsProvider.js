// server/src/data/providers/institutional/secInstitutionalFilingsProvider.jsx

/**
 * SEC Institutional Filings Provider
 *
 * Reads real SEC EDGAR evidence. It does not score, infer ticker
 * symbols, fabricate missing values, or authorize trades.
 *
 * 13F NOTE:
 * The CIK supplied to 13F methods is the filing manager's CIK.
 */

const DEFAULT_CONFIG = Object.freeze({
  submissionsBaseUrl: "https://data.sec.gov/submissions",
  archivesBaseUrl: "https://www.sec.gov/Archives/edgar/data",
  userAgent: process.env.SEC_USER_AGENT ?? "AEMA-Trading-Bot",
  contactEmail: process.env.SEC_CONTACT_EMAIL ?? "",
  timeoutMs: 15000,
  maxRetries: 2,
  retryBaseDelayMs: 500,
  minimumDelayMs: 150,
});

const SUPPORTED_FORMS = new Set([
  "13F-HR", "13F-HR/A",
  "SC 13D", "SC 13D/A",
  "SC 13G", "SC 13G/A",
]);

let lastRequestAt = 0;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function normalizeCik(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits ? digits.padStart(10, "0") : null;
}

function unpaddedCik(value) {
  const cik = normalizeCik(value);
  return cik ? cik.replace(/^0+(?=\d)/, "") : null;
}

function normalizeForm(value) {
  return String(value ?? "").trim().toUpperCase();
}

function accessionWithoutDashes(value) {
  return String(value ?? "").replace(/-/g, "");
}

function normalizeText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/\s+/g, " ").trim();
  return text || null;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function dateValue(value) {
  if (!value) return null;
  const raw = String(value);
  const d = new Date(raw.length === 10 ? `${raw}T23:59:59.999Z` : raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isAvailableAsOf(filing, asOf) {
  const publicDate = dateValue(
    filing?.acceptanceDateTime ?? filing?.filingDate,
  );
  const asOfDate = dateValue(asOf);
  return Boolean(publicDate && asOfDate && publicDate <= asOfDate);
}

function buildUserAgent(config) {
  const agent = String(config.userAgent ?? "AEMA-Trading-Bot").trim();
  const email = String(config.contactEmail ?? "").trim();

  if (!email) {
    throw new Error("SEC_CONTACT_EMAIL is required.");
  }

  return `${agent} ${email}`;
}

async function rateLimit(config) {
  const delay = Math.max(0, Number(config.minimumDelayMs) || 0);
  const wait = delay - (Date.now() - lastRequestAt);

  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
}

async function fetchResponse(url, config, accept) {
  let lastError = null;

  for (let attempt = 0; attempt <= config.maxRetries; attempt += 1) {
    let timer = null;

    try {
      await rateLimit(config);

      const controller = new AbortController();
      timer = setTimeout(() => controller.abort(), config.timeoutMs);

      const response = await fetch(url, {
        headers: {
          "User-Agent": buildUserAgent(config),
          Accept: accept,
          "Accept-Encoding": "gzip, deflate",
        },
        signal: controller.signal,
      });

      if (response.status === 429 || response.status >= 500) {
        throw new Error(`SEC temporary response ${response.status}.`);
      }

      if (!response.ok) {
        throw new Error(`SEC request failed with HTTP ${response.status}.`);
      }

      return response;
    } catch (error) {
      lastError = error;

      if (attempt >= config.maxRetries) break;
      await sleep(config.retryBaseDelayMs * (2 ** attempt));
    } finally {
      if (timer !== null) clearTimeout(timer);
    }
  }

  throw lastError ?? new Error("SEC request failed.");
}

async function fetchJson(url, config) {
  const response = await fetchResponse(
    url,
    config,
    "application/json",
  );
  return response.json();
}

async function fetchText(url, config) {
  const response = await fetchResponse(
    url,
    config,
    "application/xml,text/xml,text/plain,*/*",
  );
  return response.text();
}

function recentFilingsToRows(recent) {
  const accessions = Array.isArray(recent?.accessionNumber)
    ? recent.accessionNumber
    : [];

  return accessions.map((accessionNumber, i) => ({
    accessionNumber,
    filingDate: recent?.filingDate?.[i] ?? null,
    reportDate: recent?.reportDate?.[i] ?? null,
    acceptanceDateTime: recent?.acceptanceDateTime?.[i] ?? null,
    form: recent?.form?.[i] ?? null,
    primaryDocument: recent?.primaryDocument?.[i] ?? null,
  }));
}

export function normalizeSecInstitutionalFiling({
  cik,
  filerName = null,
  filing,
  archivesBaseUrl = DEFAULT_CONFIG.archivesBaseUrl,
} = {}) {
  const form = normalizeForm(filing?.form);
  const cikPath = unpaddedCik(cik);
  const accPath = accessionWithoutDashes(filing?.accessionNumber);

  const root = cikPath && accPath
    ? `${archivesBaseUrl}/${cikPath}/${accPath}`
    : null;

  return {
    source: "SEC_EDGAR",

    sourceType: form.startsWith("13F")
      ? "13F"
      : form.startsWith("SC 13D")
        ? "BENEFICIAL_OWNERSHIP_13D"
        : form.startsWith("SC 13G")
          ? "BENEFICIAL_OWNERSHIP_13G"
          : "OTHER",

    cik: normalizeCik(cik),
    filerName: normalizeText(filerName),
    form,
    accessionNumber: filing?.accessionNumber ?? null,
    filingDate: filing?.filingDate ?? null,
    acceptanceDateTime: filing?.acceptanceDateTime ?? null,
    reportDate: filing?.reportDate ?? null,
    primaryDocument: filing?.primaryDocument ?? null,
    availableFrom:
      filing?.acceptanceDateTime ??
      filing?.filingDate ??
      null,

    filingIndexUrl: root ? `${root}/index.json` : null,

    primaryDocumentUrl:
      root && filing?.primaryDocument
        ? `${root}/${filing.primaryDocument}`
        : null,

    archiveRootUrl: root,
  };
}

/**
 * Locate a likely 13F information-table document from SEC index.json.
 * A weak/ambiguous candidate is rejected instead of guessed.
 */
export function select13FInformationTableDocument({
  indexJson,
  filing,
} = {}) {
  const items = Array.isArray(indexJson?.directory?.item)
    ? indexJson.directory.item
    : [];

  const primary = String(filing?.primaryDocument ?? "").toLowerCase();

  const candidates = items
    .map(item => {
      const name = String(item?.name ?? "").trim();
      const lower = name.toLowerCase();

      if (!name || lower === "index.json") {
        return { item, score: -Infinity };
      }

      if (!lower.endsWith(".xml") && !lower.endsWith(".txt")) {
        return { item, score: -Infinity };
      }

      let score = 0;

      if (lower.endsWith(".xml")) score += 20;

      if (
        /infotable|informationtable|information_table|13f.*table|table.*13f/.test(
          lower,
        )
      ) {
        score += 100;
      }

      if (/13f/.test(lower)) score += 20;
      if (/primary|form13f|cover/.test(lower)) score -= 30;
      if (primary && lower === primary) score -= 50;

      return { item, score };
    })
    .filter(entry => Number.isFinite(entry.score))
    .sort((a, b) => b.score - a.score);

  if (!candidates.length || candidates[0].score <= 0) return null;
  return candidates[0].item;
}

function decodeXmlEntities(value) {
  if (value === null || value === undefined) return null;

  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(
      /&#x([0-9a-f]+);/gi,
      (_, n) => String.fromCodePoint(parseInt(n, 16)),
    );
}

function stripXmlMarkup(value) {
  if (value === null || value === undefined) return null;

  return normalizeText(
    decodeXmlEntities(
      String(value)
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
        .replace(/<[^>]+>/g, " "),
    ),
  );
}

function xmlScalar(block, localName) {
  const escaped = String(localName).replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );

  const regex = new RegExp(
    `<(?:[A-Za-z_][\\w.-]*:)?${escaped}\\b[^>]*>` +
    `([\\s\\S]*?)` +
    `<\\/(?:[A-Za-z_][\\w.-]*:)?${escaped}\\s*>`,
    "i",
  );

  const match = String(block ?? "").match(regex);
  return match ? stripXmlMarkup(match[1]) : null;
}

function extractInfoTableBlocks(xml) {
  const regex =
    /<(?:[A-Za-z_][\w.-]*:)?infoTable\b[^>]*>[\s\S]*?<\/(?:[A-Za-z_][\w.-]*:)?infoTable\s*>/gi;

  return String(xml ?? "").match(regex) ?? [];
}

export function normalize13FHolding({
  block,
  filing,
} = {}) {
  return {
    source: "SEC_EDGAR",
    sourceType: "13F_HOLDING",

    managerCik: filing?.cik ?? null,
    managerName: filing?.filerName ?? null,

    form: filing?.form ?? null,
    accessionNumber: filing?.accessionNumber ?? null,
    reportDate: filing?.reportDate ?? null,
    filingDate: filing?.filingDate ?? null,
    acceptanceDateTime: filing?.acceptanceDateTime ?? null,
    availableFrom: filing?.availableFrom ?? null,

    issuerName: xmlScalar(block, "nameOfIssuer"),
    classTitle: xmlScalar(block, "titleOfClass"),

    cusip: normalizeText(xmlScalar(block, "cusip"))
      ?.replace(/\s+/g, "")
      .toUpperCase() ?? null,

    /*
     * Preserve the numeric value as SEC reported it.
     * Do not silently convert or relabel its units here.
     */
    valueReported: numberOrNull(xmlScalar(block, "value")),

    shares: numberOrNull(xmlScalar(block, "sshPrnamt")),
    shareType: xmlScalar(block, "sshPrnamtType"),
    putCall: xmlScalar(block, "putCall"),
    investmentDiscretion: xmlScalar(block, "investmentDiscretion"),
    otherManager: xmlScalar(block, "otherManager"),

    votingAuthority: {
      sole: numberOrNull(xmlScalar(block, "Sole")),
      shared: numberOrNull(xmlScalar(block, "Shared")),
      none: numberOrNull(xmlScalar(block, "None")),
    },

    /*
     * SEC 13F information tables do not provide a reliable ticker
     * field. A separate verified mapping layer may populate this.
     */
    ticker: null,
  };
}

export function parse13FInformationTable({
  xml,
  filing,
} = {}) {
  const holdings = extractInfoTableBlocks(xml)
    .map(block => normalize13FHolding({ block, filing }))
    .filter(holding =>
      Boolean(
        holding.issuerName ||
        holding.cusip ||
        holding.shares !== null ||
        holding.valueReported !== null,
      ),
    );

  return {
    approved: holdings.length > 0,
    provider: "SEC_EDGAR",
    engine: "SEC_13F_INFORMATION_TABLE",
    status: holdings.length ? "COMPLETE" : "NO_HOLDINGS",
    filing: filing ?? null,
    count: holdings.length,
    holdings,
    warnings: holdings.length
      ? []
      : ["No usable 13F information-table holdings were found."],
    errors: [],
  };
}

export function createSecInstitutionalFilingsProvider(
  configOverrides = {},
) {
  const config = {
    ...DEFAULT_CONFIG,
    ...configOverrides,
  };

  async function getSubmissions({ cik } = {}) {
    const normalized = normalizeCik(cik);

    if (!normalized) {
      throw new Error("A valid SEC CIK is required.");
    }

    return fetchJson(
      `${config.submissionsBaseUrl}/CIK${normalized}.json`,
      config,
    );
  }

  async function getInstitutionalFilings({
    cik,
    forms = null,
    asOf = new Date().toISOString(),
  } = {}) {
    const normalized = normalizeCik(cik);

    if (!normalized) {
      throw new Error("A valid SEC CIK is required.");
    }

    if (!dateValue(asOf)) {
      throw new Error("A valid asOf timestamp is required.");
    }

    const submissions = await getSubmissions({ cik: normalized });

    const allowed =
      Array.isArray(forms) && forms.length
        ? new Set(forms.map(normalizeForm))
        : SUPPORTED_FORMS;

    const filings = recentFilingsToRows(submissions?.filings?.recent)
      .filter(row => allowed.has(normalizeForm(row.form)))
      .filter(row => isAvailableAsOf(row, asOf))
      .map(row =>
        normalizeSecInstitutionalFiling({
          cik: normalized,
          filerName: submissions?.name ?? null,
          filing: row,
          archivesBaseUrl: config.archivesBaseUrl,
        }),
      );

    return {
      approved: true,
      provider: "SEC_EDGAR",
      engine: "SEC_INSTITUTIONAL_FILINGS_PROVIDER",
      status: filings.length ? "COMPLETE" : "NO_FILINGS",
      cik: normalized,
      filerName: submissions?.name ?? null,
      asOf,
      filings,
      count: filings.length,
      errors: [],
      warnings: [],
    };
  }

  const get13FFilings = ({
    cik,
    asOf = new Date().toISOString(),
  } = {}) =>
    getInstitutionalFilings({
      cik,
      forms: ["13F-HR", "13F-HR/A"],
      asOf,
    });

  const getBeneficialOwnershipFilings = ({
    cik,
    asOf = new Date().toISOString(),
  } = {}) =>
    getInstitutionalFilings({
      cik,
      forms: ["SC 13D", "SC 13D/A", "SC 13G", "SC 13G/A"],
      asOf,
    });

  async function getFilingIndex({ filing } = {}) {
    if (!filing?.filingIndexUrl) {
      throw new Error(
        "A normalized SEC filing with filingIndexUrl is required.",
      );
    }

    const indexJson = await fetchJson(filing.filingIndexUrl, config);

    return {
      approved: true,
      provider: "SEC_EDGAR",
      engine: "SEC_FILING_INDEX_PROVIDER",
      status: "COMPLETE",
      filing,
      indexJson,
      warnings: [],
      errors: [],
    };
  }

  async function get13FInformationTable({ filing } = {}) {
    if (!filing || filing.sourceType !== "13F") {
      return {
        approved: false,
        provider: "SEC_EDGAR",
        engine: "SEC_13F_INFORMATION_TABLE",
        status: "INVALID_REQUEST",
        filing: filing ?? null,
        document: null,
        count: 0,
        holdings: [],
        warnings: [],
        errors: ["A normalized SEC 13F filing is required."],
      };
    }

    try {
      const index = await getFilingIndex({ filing });

      const document = select13FInformationTableDocument({
        indexJson: index.indexJson,
        filing,
      });

      if (!document) {
        return {
          approved: false,
          provider: "SEC_EDGAR",
          engine: "SEC_13F_INFORMATION_TABLE",
          status: "INFORMATION_TABLE_NOT_FOUND",
          filing,
          document: null,
          count: 0,
          holdings: [],
          warnings: [
            "SEC filing index was available, but no confidently identifiable 13F information-table document was found.",
          ],
          errors: [],
        };
      }

      if (!filing.archiveRootUrl) {
        return {
          approved: false,
          provider: "SEC_EDGAR",
          engine: "SEC_13F_INFORMATION_TABLE",
          status: "INVALID_FILING",
          filing,
          document,
          count: 0,
          holdings: [],
          warnings: [],
          errors: ["The filing archive root URL is unavailable."],
        };
      }

      const documentUrl =
        `${filing.archiveRootUrl}/${document.name}`;

      const xml = await fetchText(documentUrl, config);

      const parsed = parse13FInformationTable({
        xml,
        filing,
      });

      return {
        ...parsed,
        document: {
          name: document?.name ?? null,
          size: numberOrNull(document?.size),
          lastModified: document?.last_modified ?? null,
          url: documentUrl,
        },
      };
    } catch (error) {
      return {
        approved: false,
        provider: "SEC_EDGAR",
        engine: "SEC_13F_INFORMATION_TABLE",
        status: "ERROR",
        filing,
        document: null,
        count: 0,
        holdings: [],
        warnings: [
          "SEC 13F holdings could not be retrieved. No institutional position change should be inferred from this failure.",
        ],
        errors: [
          error instanceof Error ? error.message : String(error),
        ],
      };
    }
  }

  async function get13FHoldings({
    cik,
    asOf = new Date().toISOString(),
    filingLimit = null,
  } = {}) {
    const filingsResult = await get13FFilings({ cik, asOf });

    const sorted = [...filingsResult.filings].sort((a, b) => {
      const at = dateValue(a.availableFrom)?.getTime() ?? 0;
      const bt = dateValue(b.availableFrom)?.getTime() ?? 0;
      return bt - at;
    });

    const limit =
      Number.isInteger(filingLimit) && filingLimit > 0
        ? filingLimit
        : sorted.length;

    const filings = sorted.slice(0, limit);
    const filingResults = [];

    /*
     * Sequential on purpose: all requests pass through the same
     * SEC throttle and are not burst in parallel.
     */
    for (const filing of filings) {
      filingResults.push(
        await get13FInformationTable({ filing }),
      );
    }

    const holdings = filingResults.flatMap(result =>
      Array.isArray(result?.holdings) ? result.holdings : [],
    );

    const successfulFilings = filingResults.filter(
      result => result?.approved === true,
    ).length;

    const failedFilings =
      filingResults.length - successfulFilings;

    return {
      approved: holdings.length > 0,
      provider: "SEC_EDGAR",
      engine: "SEC_13F_HOLDINGS_PROVIDER",

      status: holdings.length
        ? failedFilings
          ? "PARTIAL"
          : "COMPLETE"
        : filings.length
          ? "NO_HOLDINGS"
          : "NO_FILINGS",

      cik: filingsResult.cik,
      filerName: filingsResult.filerName,
      asOf,

      filingCount: filings.length,
      successfulFilings,
      failedFilings,
      holdingCount: holdings.length,

      filings,
      filingResults,
      holdings,

      warnings: filingResults.flatMap(result =>
        Array.isArray(result?.warnings) ? result.warnings : [],
      ),

      errors: filingResults.flatMap(result =>
        Array.isArray(result?.errors) ? result.errors : [],
      ),
    };
  }

  return {
    // Existing public API preserved.
    getSubmissions,
    getInstitutionalFilings,
    get13FFilings,
    getBeneficialOwnershipFilings,

    // New raw-evidence capabilities.
    getFilingIndex,
    get13FInformationTable,
    get13FHoldings,
  };
}

export default createSecInstitutionalFilingsProvider;
