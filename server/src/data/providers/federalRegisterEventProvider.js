import axios from "axios";

import {
  EVENT_TYPE,
  EVENT_STATUS,
  EVENT_SEVERITY,
  AUTHORITY_LEVEL,
} from "../../analysis/eventIntelligenceEngine.js";

/**
 * ============================================================
 * FEDERAL REGISTER EVENT PROVIDER
 * ============================================================
 *
 * PURPOSE
 * -------
 *
 * Pull recent U.S. federal regulatory/government documents
 * and convert them into verified market-event records.
 *
 * This provider does NOT decide bullish/bearish direction.
 *
 * Direction stays unknown until eventInterpretationEngine.js
 * evaluates the event.
 */

const FEDERAL_REGISTER_API =
  "https://www.federalregister.gov/api/v1/documents.json";

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

function normalizeDocumentType(
  value,
) {
  return normalizeText(
    value,
  ).toUpperCase();
}

function classifyDocument(
  document,
) {
  const type =
    normalizeDocumentType(
      document?.type,
    );

  const title =
    normalizeText(
      document?.title,
    ).toLowerCase();

  if (
    type === "RULE" ||
    type === "PROPOSED RULE"
  ) {
    return EVENT_TYPE.REGULATION;
  }

  if (
    title.includes(
      "tariff",
    )
  ) {
    return EVENT_TYPE.TARIFF;
  }

  if (
    title.includes(
      "sanction",
    )
  ) {
    return EVENT_TYPE.SANCTIONS;
  }

  if (
    title.includes(
      "trade",
    )
  ) {
    return EVENT_TYPE.TRADE_POLICY;
  }

  return EVENT_TYPE
    .GOVERNMENT_POLICY;
}

function determineSeverity(
  document,
) {
  const title =
    normalizeText(
      document?.title,
    ).toLowerCase();

  if (
    title.includes(
      "emergency",
    ) ||
    title.includes(
      "national emergency",
    )
  ) {
    return EVENT_SEVERITY.HIGH;
  }

  const type =
    normalizeDocumentType(
      document?.type,
    );

  if (
    type === "RULE"
  ) {
    return EVENT_SEVERITY.MODERATE;
  }

  return EVENT_SEVERITY.LOW;
}

function normalizeAgencies(
  agencies,
) {
  if (
    !Array.isArray(
      agencies,
    )
  ) {
    return [];
  }

  return agencies
    .map(
      (agency) =>
        normalizeText(
          agency?.name ??
            agency?.raw_name,
        ),
    )
    .filter(Boolean);
}

function buildTimestamp(
  publicationDate,
) {
  if (!publicationDate) {
    return null;
  }

  const parsed =
    new Date(
      `${publicationDate}T12:00:00Z`,
    );

  if (
    Number.isNaN(
      parsed.getTime(),
    )
  ) {
    return null;
  }

  return parsed
    .toISOString();
}

export async function getFederalRegisterEvents({
  asOfTimestamp =
    new Date()
      .toISOString(),

  lookbackHours = 168,

  perPage = 100,
} = {}) {
  try {
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

    const lookback =
      Math.max(
        1,
        Number(
          lookbackHours,
        ) || 168,
      );

    const cutoff =
      new Date(
        asOf.getTime() -
          lookback *
            60 *
            60 *
            1000,
      );

    const startDate =
      cutoff
        .toISOString()
        .slice(
          0,
          10,
        );

    const endDate =
      asOf
        .toISOString()
        .slice(
          0,
          10,
        );

    const response =
      await axios.get(
        FEDERAL_REGISTER_API,
        {
          timeout: 20_000,

         params: {
  "conditions[publication_date][gte]":
    startDate,

  "conditions[publication_date][lte]":
    endDate,

  per_page:
    Math.min(
      Math.max(
        Number(
          perPage,
        ) || 100,
        1,
      ),
      1000,
    ),

  order:
    "newest",
}, 

          headers: {
            Accept:
              "application/json",

            "User-Agent":
              process.env.SEC_USER_AGENT ||
              "AEMA-Trading-Bot",
          },
        },
      );

    const results =
      Array.isArray(
        response.data?.results,
      )
        ? response.data.results
        : [];

    const events = [];

    for (
      const document
      of results
    ) {
      const timestamp =
        buildTimestamp(
          document
            ?.publication_date,
        );

      if (!timestamp) {
        continue;
      }

      const publishedAt =
        new Date(
          timestamp,
        );

      if (
        publishedAt <
          cutoff ||
        publishedAt >
          asOf
      ) {
        continue;
      }

      const title =
        normalizeText(
          document?.title,
        );

      if (!title) {
        continue;
      }

      const agencies =
        normalizeAgencies(
          document
            ?.agencies,
        );

      const type =
        classifyDocument(
          document,
        );

      events.push({
        externalId:
          normalizeText(
            document
              ?.document_number,
          ) ||
          document
            ?.html_url ||
          `${timestamp}-${title}`,

        type,

        timestamp,

        title,

        summary:
          normalizeText(
            document
              ?.abstract,
          ) ||
          title,

        content:
          normalizeText(
            document
              ?.abstract,
          ) ||
          null,

        source:
          "FEDERAL_REGISTER",

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
            document,
          ),

        surprise: null,

        rawImpact: null,

        countries: [
          "US",
        ],

        sectors: [],

        symbols: [],

        url:
          document
            ?.html_url ??
          null,

        metadata: {
          provider:
            "FEDERAL_REGISTER_API",

          documentNumber:
            document
              ?.document_number ??
            null,

          documentType:
            document
              ?.type ??
            null,

          agencies,

          citation:
            document
              ?.citation ??
            null,

          pdfUrl:
            document
              ?.pdf_url ??
            null,

          docketIds:
            document
              ?.docket_ids ??
            [],

          regulationIdNumbers:
            document
              ?.regulation_id_numbers ??
            [],
        },
      });
    }

    return {
      approved: true,

      provider:
        "FEDERAL_REGISTER",

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
              "No recent Federal Register events were found.",
            ]
          : [],

      errors: [],

      fetchedAt:
        new Date()
          .toISOString(),
    };
  } catch (error) {
    return {
      approved: false,

      provider:
        "FEDERAL_REGISTER",

      status:
        "ERROR",

      eventCount: 0,

      events: [],

      warnings: [
        "Federal Register events are unavailable.",
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

export default getFederalRegisterEvents;