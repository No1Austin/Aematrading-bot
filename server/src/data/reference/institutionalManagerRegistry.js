/**
 * AEMA Institutional Manager Registry
 *
 * Curated manager CIK registry used by the default institutional
 * evidence service. CIKs identify SEC filing managers; they do not
 * imply that a manager owns any requested security.
 */

export const INSTITUTIONAL_MANAGER_REGISTRY = Object.freeze([
  Object.freeze({ cik: "0001364742", name: "BlackRock, Inc.", priority: 100, enabled: true }),
  Object.freeze({ cik: "0000102909", name: "The Vanguard Group, Inc.", priority: 100, enabled: true }),
  Object.freeze({ cik: "0001067983", name: "Berkshire Hathaway Inc.", priority: 90, enabled: true }),
  Object.freeze({ cik: "00093751", name: "State Street Corp", priority: 90, enabled: true }),
]);

function normalizeCik(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits ? digits.padStart(10, "0") : null;
}

export function getInstitutionalManagers({
  enabledOnly = true,
  limit = null,
} = {}) {
  let rows = INSTITUTIONAL_MANAGER_REGISTRY
    .filter(row => !enabledOnly || row.enabled === true)
    .map(row => ({ ...row, cik: normalizeCik(row.cik) }))
    .filter(row => row.cik)
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.name.localeCompare(b.name));

  const parsedLimit = Number(limit);
  if (Number.isInteger(parsedLimit) && parsedLimit > 0) {
    rows = rows.slice(0, parsedLimit);
  }

  return rows;
}

export default getInstitutionalManagers;
