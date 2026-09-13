// server/src/research/companyWebsiteResearchProvider.jsx

import resolveCompanyDomain from
  "./companyDomainResolver.js";

/**
 * ============================================================
 * COMPANY WEBSITE RESEARCH PROVIDER
 * ============================================================
 *
 * PURPOSE
 * -------
 *
 * Research first-party information from a company's official
 * website and normalize important findings for the Research UI.
 *
 * IMPORTANT
 * ---------
 *
 * This provider:
 *
 * - resolves the verified company website automatically when
 *   the caller only supplies a stock symbol
 * - only crawls the verified official domain/subdomains
 * - does not guess domains from company names
 * - does not classify allegations
 * - does not make trading decisions
 * - does not execute trades
 */

export const COMPANY_WEBSITE_RESEARCH_STATUS =
  Object.freeze({
    COMPLETE: "COMPLETE",
    PARTIAL: "PARTIAL",
    INVALID_REQUEST: "INVALID_REQUEST",
    WEBSITE_REQUIRED: "WEBSITE_REQUIRED",
    FETCH_ERROR: "FETCH_ERROR",
    NO_CONTENT: "NO_CONTENT",
    ERROR: "ERROR",
  });

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_MAXIMUM_PAGES = 12;

const PAGE_TYPE =
  Object.freeze({
    HOME: "HOME",
    ABOUT: "ABOUT",
    INVESTOR_RELATIONS: "INVESTOR_RELATIONS",
    NEWSROOM: "NEWSROOM",
    PRESS_RELEASE: "PRESS_RELEASE",
    LEADERSHIP: "LEADERSHIP",
    GOVERNANCE: "GOVERNANCE",
    PRODUCT: "PRODUCT",
    SERVICES: "SERVICES",
    FINANCIAL: "FINANCIAL",
    SEC_FILINGS: "SEC_FILINGS",
    ESG: "ESG",
    CAREERS: "CAREERS",
    CONTACT: "CONTACT",
    OTHER: "OTHER",
  });

function now() {
  return new Date().toISOString();
}

function normalizeString(value) {
  const normalized =
    String(value ?? "")
      .trim();

  return normalized || null;
}

function normalizeSymbol(value) {
  return (
    normalizeString(value)
      ?.toUpperCase() ??
    null
  );
}

function safeErrorMessage(error) {
  return error instanceof Error
    ? error.message
    : String(error);
}

function positiveInteger(value, fallback) {
  const number =
    Number(value);

  return (
    Number.isInteger(number) &&
    number > 0
  )
    ? number
    : fallback;
}

function normalizeUrl(value) {
  const raw =
    normalizeString(value);

  if (!raw) {
    return null;
  }

  try {
    const hasProtocol =
      raw.startsWith("https://") ||
      raw.startsWith("http://");

    const url =
      new URL(
        hasProtocol
          ? raw
          : `https://${raw}`,
      );

    if (
      url.protocol !== "https:" &&
      url.protocol !== "http:"
    ) {
      return null;
    }

    url.hash = "";

    return url.toString();
  } catch {
    return null;
  }
}

function extractDomain(value) {
  const normalized =
    normalizeUrl(value);

  if (!normalized) {
    return null;
  }

  try {
    return new URL(normalized)
      .hostname
      .toLowerCase()
      .replace(/^www\./, "");
  } catch {
    return null;
  }
}

function sameDomain(candidate, officialWebsite) {
  try {
    const candidateUrl =
      new URL(candidate);

    const officialUrl =
      new URL(officialWebsite);

    const candidateHost =
      candidateUrl.hostname
        .toLowerCase()
        .replace(/^www\./, "");

    const officialHost =
      officialUrl.hostname
        .toLowerCase()
        .replace(/^www\./, "");

    return (
      candidateHost === officialHost ||
      candidateHost.endsWith(
        `.${officialHost}`,
      )
    );
  } catch {
    return false;
  }
}

function classifyPage(url, title = "") {
  const text =
    `${url} ${title}`
      .toLowerCase();

  if (
    /investor|investors|investor-relations|investor_relations/.test(
      text,
    )
  ) {
    return PAGE_TYPE.INVESTOR_RELATIONS;
  }

  if (
    /press-release|press_release/.test(
      text,
    )
  ) {
    return PAGE_TYPE.PRESS_RELEASE;
  }

  if (
    /newsroom|press|media|news/.test(
      text,
    )
  ) {
    return PAGE_TYPE.NEWSROOM;
  }

  if (
    /leadership|executive|management|board|directors/.test(
      text,
    )
  ) {
    return PAGE_TYPE.LEADERSHIP;
  }

  if (
    /governance|corporate-governance/.test(
      text,
    )
  ) {
    return PAGE_TYPE.GOVERNANCE;
  }

  if (
    /financial|earnings|quarterly|annual-report|annual_report|results/.test(
      text,
    )
  ) {
    return PAGE_TYPE.FINANCIAL;
  }

  if (
    /sec|filing|10-k|10-q|8-k/.test(
      text,
    )
  ) {
    return PAGE_TYPE.SEC_FILINGS;
  }

  if (
    /product|products/.test(
      text,
    )
  ) {
    return PAGE_TYPE.PRODUCT;
  }

  if (
    /service|services/.test(
      text,
    )
  ) {
    return PAGE_TYPE.SERVICES;
  }

  if (
    /sustainability|esg|responsibility|environment/.test(
      text,
    )
  ) {
    return PAGE_TYPE.ESG;
  }

  if (
    /career|careers|jobs/.test(
      text,
    )
  ) {
    return PAGE_TYPE.CAREERS;
  }

  if (
    /contact/.test(
      text,
    )
  ) {
    return PAGE_TYPE.CONTACT;
  }

  if (
    /about|company|who-we-are/.test(
      text,
    )
  ) {
    return PAGE_TYPE.ABOUT;
  }

  return PAGE_TYPE.OTHER;
}

function decodeEntities(value) {
  return String(value ?? "")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'")
    .replace(/&nbsp;/gi, " ");
}

function stripHtml(html) {
  return decodeEntities(
    String(html ?? "")
      .replace(
        /<script[\s\S]*?<\/script>/gi,
        " ",
      )
      .replace(
        /<style[\s\S]*?<\/style>/gi,
        " ",
      )
      .replace(
        /<noscript[\s\S]*?<\/noscript>/gi,
        " ",
      )
      .replace(
        /<svg[\s\S]*?<\/svg>/gi,
        " ",
      )
      .replace(
        /<[^>]+>/g,
        " ",
      )
      .replace(
        /\s+/g,
        " ",
      )
      .trim(),
  );
}

function extractTitle(html) {
  const match =
    String(html ?? "")
      .match(
        /<title[^>]*>([\s\S]*?)<\/title>/i,
      );

  return match?.[1]
    ? stripHtml(match[1])
    : null;
}

function extractMetaDescription(html) {
  const source =
    String(html ?? "");

  const match =
    source.match(
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    ) ??
    source.match(
      /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["'][^>]*>/i,
    );

  return match?.[1]
    ? decodeEntities(match[1])
    : null;
}

function extractLinks({
  html,
  baseUrl,
  officialWebsite,
}) {
  const links = [];

  const regex =
    /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  let match;

  while (
    (
      match =
        regex.exec(
          String(html ?? ""),
        )
    )
  ) {
    const href =
      match?.[1];

    const label =
      stripHtml(
        match?.[2],
      );

    if (!href) {
      continue;
    }

    try {
      const resolvedUrl =
        new URL(
          href,
          baseUrl,
        );

      if (
        resolvedUrl.protocol !==
          "https:" &&
        resolvedUrl.protocol !==
          "http:"
      ) {
        continue;
      }

      resolvedUrl.hash = "";

      const resolved =
        resolvedUrl.toString();

      if (
        !sameDomain(
          resolved,
          officialWebsite,
        )
      ) {
        continue;
      }

      links.push({
        url: resolved,
        label,
      });
    } catch {
      // Ignore malformed links.
    }
  }

  const unique =
    new Map();

  for (const link of links) {
    if (!unique.has(link.url)) {
      unique.set(
        link.url,
        link,
      );
    }
  }

  return [
    ...unique.values(),
  ];
}

async function fetchPage({
  url,
  timeoutMs,
}) {
  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () =>
        controller.abort(),
      timeoutMs,
    );

  try {
    const response =
      await fetch(
        url,
        {
          redirect: "follow",
          signal: controller.signal,
          headers: {
            "User-Agent":
              "AEMA-ResearchBot/1.0",
            Accept:
              "text/html,application/xhtml+xml",
          },
        },
      );

    if (!response.ok) {
      return {
        approved: false,
        url,
        statusCode:
          response.status,
        contentType:
          response.headers.get(
            "content-type",
          ),
        html: null,
        errors: [
          `HTTP ${response.status}`,
        ],
      };
    }

    const contentType =
      response.headers.get(
        "content-type",
      ) ??
      "";

    if (
      !contentType
        .toLowerCase()
        .includes("text/html")
    ) {
      return {
        approved: false,
        url:
          response.url ??
          url,
        statusCode:
          response.status,
        contentType,
        html: null,
        errors: [
          "Page was not HTML.",
        ],
      };
    }

    const html =
      await response.text();

    return {
      approved: true,
      url:
        response.url ??
        url,
      statusCode:
        response.status,
      contentType,
      html,
      errors: [],
    };
  } catch (error) {
    return {
      approved: false,
      url,
      statusCode: null,
      contentType: null,
      html: null,
      errors: [
        safeErrorMessage(error),
      ],
    };
  } finally {
    clearTimeout(timer);
  }
}

function normalizePage({
  fetched,
  officialWebsite,
}) {
  if (
    !fetched?.approved ||
    !fetched?.html
  ) {
    return null;
  }

  const title =
    extractTitle(
      fetched.html,
    );

  const description =
    extractMetaDescription(
      fetched.html,
    );

  const text =
    stripHtml(
      fetched.html,
    );

  return {
    url:
      fetched.url,
    title,
    description,
    pageType:
      classifyPage(
        fetched.url,
        title,
      ),
    text,
    textLength:
      text.length,
    links:
      extractLinks({
        html:
          fetched.html,
        baseUrl:
          fetched.url,
        officialWebsite,
      }),
    source: {
      sourceType:
        "COMPANY_WEBSITE",
      authority:
        "PRIMARY",
      publisher:
        null,
      url:
        fetched.url,
      retrievedAt:
        now(),
    },
  };
}

function buildFindings(pages) {
  return pages
    .filter(Boolean)
    .map(
      page => ({
        category:
          "COMPANY_SOURCE",
        type:
          page.pageType,
        sentiment:
          "NEUTRAL",
        status:
          "CONFIRMED",
        severity:
          "INFORMATIONAL",
        confidence:
          1,
        headline:
          page.title ??
          page.url,
        summary:
          page.description ??
          (
            page.text
              ? page.text.slice(
                  0,
                  500,
                )
              : null
          ),
        source:
          page.source,
      }),
    );
}

function pagePriority(pageType) {
  const weights = {
    INVESTOR_RELATIONS:
      100,
    FINANCIAL:
      95,
    SEC_FILINGS:
      90,
    NEWSROOM:
      85,
    PRESS_RELEASE:
      80,
    LEADERSHIP:
      70,
    GOVERNANCE:
      65,
    PRODUCT:
      60,
    SERVICES:
      55,
    ABOUT:
      50,
    ESG:
      40,
    CAREERS:
      10,
    CONTACT:
      5,
    OTHER:
      0,
  };

  return (
    weights[
      pageType
    ] ??
    0
  );
}

export async function researchCompanyWebsite({
  symbol,
  officialWebsite = null,
  domainResolver =
    resolveCompanyDomain,
  maximumPages =
    DEFAULT_MAXIMUM_PAGES,
  timeoutMs =
    DEFAULT_TIMEOUT_MS,
} = {}) {
  const startedAt =
    now();

  const normalizedSymbol =
    normalizeSymbol(
      symbol,
    );

  if (!normalizedSymbol) {
    return {
      approved: false,
      provider:
        "COMPANY_WEBSITE_RESEARCH",
      status:
        COMPANY_WEBSITE_RESEARCH_STATUS
          .INVALID_REQUEST,
      symbol: null,
      companyName: null,
      officialWebsite: null,
      domain: null,
      profile: null,
      pageCount: 0,
      pages: [],
      evidence: [],
      warnings: [],
      errors: [
        "A stock symbol is required.",
      ],
      startedAt,
      timestamp:
        now(),
    };
  }

  let normalizedWebsite =
    normalizeUrl(
      officialWebsite,
    );

  let domainResult =
    null;

  if (!normalizedWebsite) {
    try {
      domainResult =
        await domainResolver({
          symbol:
            normalizedSymbol,
        });
    } catch (error) {
      domainResult = {
        approved: false,
        website: null,
        domain: null,
        companyName: null,
        profile: null,
        warnings: [
          "Company domain resolver failed safely.",
        ],
        errors: [
          safeErrorMessage(error),
        ],
      };
    }

    if (
      domainResult
        ?.approved ===
        true
    ) {
      normalizedWebsite =
        normalizeUrl(
          domainResult
            ?.website,
        );
    }
  }

  const resolvedDomain =
    domainResult
      ?.domain ??
    extractDomain(
      normalizedWebsite,
    );

  const companyName =
    domainResult
      ?.companyName ??
    null;

  const profile =
    domainResult
      ?.profile ??
    null;

  if (!normalizedWebsite) {
    return {
      approved: false,
      provider:
        "COMPANY_WEBSITE_RESEARCH",
      status:
        COMPANY_WEBSITE_RESEARCH_STATUS
          .WEBSITE_REQUIRED,
      symbol:
        normalizedSymbol,
      companyName,
      officialWebsite:
        null,
      domain:
        resolvedDomain,
      profile,
      pageCount: 0,
      pages: [],
      evidence: [],
      warnings: [
        ...(
          Array.isArray(
            domainResult
              ?.warnings,
          )
            ? domainResult
                .warnings
            : []
        ),
        "A verified official company website could not be resolved.",
      ],
      errors:
        Array.isArray(
          domainResult
            ?.errors,
        )
          ? domainResult
              .errors
          : [],
      startedAt,
      timestamp:
        now(),
    };
  }

  try {
    const limit =
      Math.min(
        50,
        positiveInteger(
          maximumPages,
          DEFAULT_MAXIMUM_PAGES,
        ),
      );

    const effectiveTimeout =
      Math.min(
        60_000,
        positiveInteger(
          timeoutMs,
          DEFAULT_TIMEOUT_MS,
        ),
      );

    const seen =
      new Set();

    const queued =
      new Set([
        normalizedWebsite,
      ]);

    const queue = [
      normalizedWebsite,
    ];

    const pages =
      [];

    const warnings =
      [];

    while (
      queue.length > 0 &&
      pages.length < limit
    ) {
      const url =
        queue.shift();

      queued.delete(url);

      if (
        !url ||
        seen.has(url)
      ) {
        continue;
      }

      seen.add(url);

      const fetched =
        await fetchPage({
          url,
          timeoutMs:
            effectiveTimeout,
        });

      if (
        fetched.approved !==
        true
      ) {
        warnings.push(
          `Unable to research ${url}: ${
            fetched
              ?.errors
              ?.[0] ??
            "Unknown error"
          }`,
        );

        continue;
      }

      if (
        !sameDomain(
          fetched.url,
          normalizedWebsite,
        )
      ) {
        warnings.push(
          `Skipped redirected page outside verified company domain: ${fetched.url}`,
        );

        continue;
      }

      const page =
        normalizePage({
          fetched,
          officialWebsite:
            normalizedWebsite,
        });

      if (!page) {
        continue;
      }

      pages.push(page);

      const prioritized =
        page.links
          .map(
            link => ({
              ...link,
              pageType:
                classifyPage(
                  link.url,
                  link.label,
                ),
            }),
          )
          .filter(
            link =>
              link.pageType !==
              PAGE_TYPE.OTHER,
          )
          .sort(
            (a, b) =>
              pagePriority(
                b.pageType,
              ) -
              pagePriority(
                a.pageType,
              ),
          );

      for (const link of prioritized) {
        if (
          seen.has(
            link.url,
          ) ||
          queued.has(
            link.url,
          )
        ) {
          continue;
        }

        queue.push(
          link.url,
        );

        queued.add(
          link.url,
        );
      }
    }

    const evidence =
      buildFindings(
        pages,
      );

    const approved =
      pages.length > 0;

    let status =
      COMPANY_WEBSITE_RESEARCH_STATUS
        .NO_CONTENT;

    if (approved) {
      status =
        queue.length === 0
          ? COMPANY_WEBSITE_RESEARCH_STATUS
              .COMPLETE
          : COMPANY_WEBSITE_RESEARCH_STATUS
              .PARTIAL;
    }

    return {
      approved,
      provider:
        "COMPANY_WEBSITE_RESEARCH",
      status,
      symbol:
        normalizedSymbol,
      companyName,
      officialWebsite:
        normalizedWebsite,
      domain:
        resolvedDomain,
      profile,
      pageCount:
        pages.length,
      requestedMaximumPages:
        limit,
      pages,
      evidence,
      warnings: [
        ...(
          Array.isArray(
            domainResult
              ?.warnings,
          )
            ? domainResult
                .warnings
            : []
        ),
        ...warnings,
      ],
      errors: [],
      startedAt,
      timestamp:
        now(),
    };
  } catch (error) {
    return {
      approved: false,
      provider:
        "COMPANY_WEBSITE_RESEARCH",
      status:
        COMPANY_WEBSITE_RESEARCH_STATUS
          .ERROR,
      symbol:
        normalizedSymbol,
      companyName,
      officialWebsite:
        normalizedWebsite,
      domain:
        resolvedDomain,
      profile,
      pageCount: 0,
      pages: [],
      evidence: [],
      warnings: [
        "Company website research failed safely.",
      ],
      errors: [
        safeErrorMessage(error),
      ],
      startedAt,
      timestamp:
        now(),
    };
  }
}

export default
  researchCompanyWebsite;
