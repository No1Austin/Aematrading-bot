// server/src/routes/researchRoutes.js
import express from "express";
import researchCompany from "../research/companyResearchCoordinator.js";

const router = express.Router();
const SERVICE = "COMPANY_RESEARCH_API";
const now = () => new Date().toISOString();

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error ?? "Unknown error");
}

function normalizeSymbol(value) {
  const symbol = String(value ?? "").trim().toUpperCase();
  if (!symbol || !/^[A-Z0-9][A-Z0-9.\-]{0,19}$/.test(symbol)) return null;
  return symbol;
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const v = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(v)) return true;
  if (["false", "0", "no", "off"].includes(v)) return false;
  return fallback;
}

function parsePositiveInteger(value, fallback = 20, max = 100) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? Math.min(n, max) : fallback;
}

function buildOptions(source = {}) {
  if (!source || typeof source !== "object" || Array.isArray(source)) source = {};
  const options = {};
  if ("includeFundamentals" in source)
    options.includeFundamentals = parseBoolean(source.includeFundamentals, true);
  if ("includeNews" in source)
    options.includeNews = parseBoolean(source.includeNews, true);
  if ("includeSocial" in source)
    options.includeSocial = parseBoolean(source.includeSocial, true);
  if ("newsLimit" in source)
    options.newsLimit = parsePositiveInteger(source.newsLimit);
  return options;
}

function failurePayload({ status, symbol = null, message, warning = null }) {
  return {
    success: false,
    approved: false,
    service: SERVICE,
    status,
    symbol,
    summary: null,
    company: null,
    fundamentals: null,
    news: [],
    social: null,
    website: null,
    legal: null,
    webIntelligence: null,
    evidence: [],
    providers: {},
    warnings: warning ? [warning] : [],
    errors: [message],
    timestamp: now(),
  };
}

async function executeResearch(req, res, symbolValue, optionsValue = {}) {
  const symbol = normalizeSymbol(symbolValue);

  if (!symbol) {
    return res.status(400).json(
      failurePayload({
        status: "INVALID_REQUEST",
        message: "A valid stock symbol is required.",
      }),
    );
  }

  try {
    const result = await researchCompany({
      symbol,
      options: buildOptions(optionsValue),
    });

    if (!result || typeof result !== "object") {
      return res.status(502).json(
        failurePayload({
          status: "ERROR",
          symbol,
          message: "EMPTY_RESEARCH_RESPONSE",
          warning: "The research coordinator returned no structured dossier.",
        }),
      );
    }

    // PARTIAL and NO_DATA are research outcomes, not HTTP failures.
    const httpStatus = result.status === "INVALID_REQUEST" ? 400 : 200;

    return res.status(httpStatus).json({
      ...result,
      apiService: SERVICE,
      request: {
        method: req.method,
        symbol,
      },
    });
  } catch (error) {
    return res.status(500).json(
      failurePayload({
        status: "ERROR",
        symbol,
        message: errorMessage(error),
        warning: "Company research failed at the API boundary.",
      }),
    );
  }
}

router.get("/health", (req, res) => {
  return res.status(200).json({
    success: true,
    approved: true,
    service: SERVICE,
    status: "READY",
    endpoints: {
      post: "POST /api/research/company",
      get: "GET /api/research/company/:symbol",
    },
    timestamp: now(),
  });
});

router.post("/company", async (req, res) => {
  return executeResearch(
    req,
    res,
    req.body?.symbol ?? req.body?.ticker,
    req.body?.options ?? {},
  );
});

router.get("/company/:symbol", async (req, res) => {
  return executeResearch(
    req,
    res,
    req.params?.symbol,
    {
      includeFundamentals: req.query?.includeFundamentals,
      includeNews: req.query?.includeNews,
      includeSocial: req.query?.includeSocial,
      newsLimit: req.query?.newsLimit,
    },
  );
});

export default router;
