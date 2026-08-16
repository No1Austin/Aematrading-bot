import Parser from "rss-parser";
import axios from "axios";
import * as cheerio from "cheerio";

import {
  EVENT_TYPE,
  EVENT_STATUS,
  EVENT_SEVERITY,
  AUTHORITY_LEVEL,
} from "../../analysis/eventIntelligenceEngine.js";

/**
 * ============================================================
 * RSS PARSER
 * ============================================================
 */

const parser =
  new Parser({
    timeout: 15_000,

    headers: {
      "User-Agent":
        process.env.SEC_USER_AGENT ||
        "AEMA-Trading-Bot",
    },
  });

/**
 * Official Federal Reserve monetary-policy feed.
 */

const FED_MONETARY_POLICY_FEED =
  "https://www.federalreserve.gov/feeds/press_monetary.xml";

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function normalizeText(
  value,
) {
  return String(
    value ?? "",
  )
    .replace(
      /\s+/g,
      " ",
    )
    .trim();
}

/**
 * ============================================================
 * EVENT CLASSIFICATION
 * ============================================================
 */

function classifyFedEvent(
  title,
) {
  const text =
    normalizeText(
      title,
    ).toLowerCase();

  if (
    text.includes(
      "federal open market committee",
    ) ||
    text.includes(
      "fomc",
    ) ||
    text.includes(
      "federal funds",
    ) ||
    text.includes(
      "interest rate",
    ) ||
    text.includes(
      "monetary policy",
    )
  ) {
    return EVENT_TYPE
      .CENTRAL_BANK;
  }

  return EVENT_TYPE
    .GOVERNMENT_POLICY;
}

/**
 * ============================================================
 * EVENT SEVERITY
 * ============================================================
 */

function determineSeverity(
  title,
) {
  const text =
    normalizeText(
      title,
    ).toLowerCase();

  if (
    text.includes(
      "emergency",
    ) ||
    text.includes(
      "unscheduled",
    )
  ) {
    return EVENT_SEVERITY
      .HIGH;
  }

  if (
    text.includes(
      "federal funds rate",
    ) ||
    text.includes(
      "monetary policy",
    ) ||
    text.includes(
      "fomc",
    )
  ) {
    return EVENT_SEVERITY
      .MODERATE;
  }

  return EVENT_SEVERITY
    .LOW;
}

/**
 * ============================================================
 * FETCH FULL FED ANNOUNCEMENT
 * ============================================================
 *
 * RSS feeds often contain only a short title/summary.
 *
 * This function loads the official announcement page so
 * the interpretation engine can inspect the actual policy
 * language.
 */

async function fetchFedPageContent(
  url,
) {
  if (!url) {
    return null;
  }

  try {
    const response =
      await axios.get(
        url,
        {
          timeout: 15_000,

          headers: {
            "User-Agent":
              process.env.SEC_USER_AGENT ||
              "AEMA-Trading-Bot",

            Accept:
              "text/html",
          },
        },
      );

    const $ =
      cheerio.load(
        response.data,
      );

    /**
     * Remove obvious layout noise.
     */

    $(
      "script, style, nav, header, footer, form, noscript",
    ).remove();

    /**
     * Try likely Federal Reserve page containers.
     */

    const candidates = [
      "#content",
      "main",
      ".col-xs-12.col-sm-8.col-md-8",
      ".col-md-8",
      "article",
      "body",
    ];

    let text =
      "";

    for (
      const selector
      of candidates
    ) {
      const candidate =
        normalizeText(
          $(selector)
            .text(),
        );

      if (
        candidate.length >
        text.length
      ) {
        text =
          candidate;
      }
    }

    /**
     * Refuse extremely small/empty extraction.
     */

    if (
      !text ||
      text.length < 100
    ) {
      return null;
    }

    return text;
  } catch (error) {
    console.warn(
      "[FED CONTENT] Unable to load statement page.",
      {
        url,

        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
    );

    return null;
  }
}

/**
 * ============================================================
 * FEDERAL RESERVE EVENT PROVIDER
 * ============================================================
 *
 * PURPOSE
 * -------
 *
 * Retrieve authoritative Federal Reserve monetary-policy
 * events and attach the full official announcement text.
 *
 * IMPORTANT
 * ---------
 *
 * This provider does NOT decide whether an event is
 * bullish or bearish.
 *
 * It only supplies verified event facts.
 *
 * rawImpact and surprise remain null until the dedicated
 * interpretation layer evaluates the event.
 */

export async function getFederalReserveEvents({
  asOfTimestamp =
    new Date()
      .toISOString(),

  lookbackHours = 168,
} = {}) {
  try {
    /**
     * ========================================================
     * VALIDATE AS-OF TIME
     * ========================================================
     */

    const asOf =
      new Date(
        asOfTimestamp,
      );

    if (
      Number.isNaN(
        asOf.getTime(),
      )
    ) {
      throw new Error(
        "Invalid asOfTimestamp.",
      );
    }

    /**
     * ========================================================
     * LOOKBACK WINDOW
     * ========================================================
     */

    const lookback =
      Math.max(
        1,
        Number(
          lookbackHours,
        ) || 168,
      );

    const cutoff =
      asOf.getTime() -
      lookback *
        60 *
        60 *
        1000;

    /**
     * ========================================================
     * LOAD OFFICIAL FED RSS
     * ========================================================
     */

    const feed =
      await parser.parseURL(
        FED_MONETARY_POLICY_FEED,
      );

    const events = [];

    /**
     * ========================================================
     * PROCESS RSS ITEMS
     * ========================================================
     *
     * We use a regular async loop instead of Array.map()
     * because each qualifying event may require an HTTP
     * request for its full official announcement page.
     */

    for (
      const item
      of feed.items ?? []
    ) {
      const timestamp =
        item.isoDate ??
        item.pubDate ??
        null;

      if (!timestamp) {
        continue;
      }

      const date =
        new Date(
          timestamp,
        );

      if (
        Number.isNaN(
          date.getTime(),
        )
      ) {
        continue;
      }

      /**
       * Ignore events outside the requested window.
       */

      if (
        date.getTime() <
          cutoff ||
        date.getTime() >
          asOf.getTime()
      ) {
        continue;
      }

      const title =
        normalizeText(
          item.title,
        );

      if (!title) {
        continue;
      }

      const url =
        item.link ??
        null;

      /**
       * Fetch the complete Federal Reserve announcement.
       */

      const fullContent =
        await fetchFedPageContent(
          url,
        );

      /**
       * ======================================================
       * BUILD VERIFIED EVENT
       * ======================================================
       */

      events.push({
        externalId:
          item.guid ??
          url ??
          `${date.toISOString()}-${title}`,

        type:
          classifyFedEvent(
            title,
          ),

        timestamp:
          date.toISOString(),

        title,

        summary:
          normalizeText(
            item.contentSnippet ??
              item.content ??
              item.summary,
          ) ||
          null,

        /**
         * Full official announcement body.
         */

        content:
          fullContent,

        source:
          "FEDERAL_RESERVE",

        /**
         * Official first-party source.
         */

        sourceTier: 1,

        credibility: 1,

        authority:
          AUTHORITY_LEVEL
            .OFFICIAL,

        status:
          EVENT_STATUS
            .ANNOUNCED,

        severity:
          determineSeverity(
            title,
          ),

        /**
         * Unknown until interpreted.
         */

        surprise: null,

        rawImpact: null,

        countries: [
          "US",
        ],

        sectors: [],

        symbols: [],

        url,

        metadata: {
          provider:
            "FEDERAL_RESERVE_RSS",

          feed:
            "MONETARY_POLICY",

          fullContentLoaded:
            Boolean(
              fullContent,
            ),
        },
      });
    }

    /**
     * ========================================================
     * RESULT
     * ========================================================
     */

    return {
      approved: true,

      provider:
        "FEDERAL_RESERVE",

      status:
        events.length > 0
          ? "READY"
          : "NO_EVENTS",

      eventCount:
        events.length,

      events,

      warnings:
        events.length === 0
          ? [
              "No Federal Reserve monetary-policy events were found in the requested window.",
            ]
          : [],

      errors: [],

      fetchedAt:
        new Date()
          .toISOString(),
    };
  } catch (error) {
    /**
     * ========================================================
     * SAFE FAIL
     * ========================================================
     */

    return {
      approved: false,

      provider:
        "FEDERAL_RESERVE",

      status:
        "ERROR",

      eventCount: 0,

      events: [],

      warnings: [
        "Federal Reserve events are unavailable.",
      ],

      errors: [
        error instanceof Error
          ? error.message
          : String(error),
      ],

      fetchedAt:
        new Date()
          .toISOString(),
    };
  }
}

export default getFederalReserveEvents;