/**
 * ============================================================
 * INSTITUTIONAL EVIDENCE BOOTSTRAP
 * ============================================================
 *
 * Canonical production wiring for institutional evidence.
 *
 * IMPORTANT CONTRACT:
 * - configuredInstitutionalEvidenceService is a SERVICE OBJECT.
 * - getInstitutionalEvidence is a FUNCTION.
 *
 * Keeping those contracts separate prevents the historical runtime error:
 *   "getInstitutionalEvidence is not a function"
 */

import {
  createInstitutionalEvidenceService,
} from "./institutionalEvidenceService.js";

import createSecurityResolver from
  "./securityResolver.js";

import getInstitutionalManagers from
  "../data/reference/institutionalManagerRegistry.js";

function normalizePositiveInteger(
  value,
  fallback,
) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0
    ? parsed
    : fallback;
}

function assertServiceContract(service) {
  if (
    !service ||
    typeof service !== "object" ||
    typeof service.getInstitutionalEvidence !== "function"
  ) {
    throw new TypeError(
      "Institutional evidence service must expose getInstitutionalEvidence(options).",
    );
  }

  return service;
}

export function createConfiguredInstitutionalEvidenceService({
  secProvider = null,
  finraProvider = null,
  lookupSecurityIdentity = null,
  identities = [],
  managers = null,
  managerLimit = 4,
} = {}) {
  const securityResolver =
    createSecurityResolver({
      lookupSecurityIdentity:
        typeof lookupSecurityIdentity === "function"
          ? lookupSecurityIdentity
          : null,
      identities:
        Array.isArray(identities)
          ? identities
          : [],
    });

  const institutionalManagers =
    Array.isArray(managers)
      ? managers
      : getInstitutionalManagers({
          limit: normalizePositiveInteger(
            managerLimit,
            4,
          ),
        });

  return assertServiceContract(
    createInstitutionalEvidenceService({
      secProvider,
      finraProvider,
      securityResolver,
      institutionalManagers:
        Array.isArray(institutionalManagers)
          ? institutionalManagers
          : [],
    }),
  );
}

/** Singleton service object for production paths. */
export const configuredInstitutionalEvidenceService =
  createConfiguredInstitutionalEvidenceService();

/**
 * Canonical callable adapter used by runners/providers.
 * Always remains a function even though the underlying service is an object.
 */
export async function getInstitutionalEvidence(
  options = {},
) {
  try {
    return await configuredInstitutionalEvidenceService
      .getInstitutionalEvidence(
        options && typeof options === "object"
          ? options
          : {},
      );
  } catch (error) {
    return {
      approved: false,
      service: "INSTITUTIONAL_EVIDENCE",
      status: "ERROR",
      symbol:
        typeof options?.symbol === "string"
          ? options.symbol.trim().toUpperCase() || null
          : null,
      evidence: null,
      warnings: [
        "Institutional evidence failed safely and was not treated as positive evidence.",
      ],
      errors: [
        error instanceof Error
          ? error.message
          : String(error),
      ],
      timestamp: new Date().toISOString(),
    };
  }
}

/** Default export is callable for compatibility with function-style imports. */
export default getInstitutionalEvidence;
