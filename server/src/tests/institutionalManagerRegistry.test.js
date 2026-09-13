import { describe, expect, it } from "vitest";
import {
  INSTITUTIONAL_MANAGER_REGISTRY,
  getInstitutionalManagers,
} from "../data/reference/institutionalManagerRegistry.js";

describe("Institutional Manager Registry", () => {
  it("returns normalized enabled managers with CIKs", () => {
    const managers = getInstitutionalManagers();
    expect(managers.length).toBeGreaterThan(0);
    expect(managers.every(item => /^\d{10}$/.test(item.cik))).toBe(true);
    expect(managers.every(item => item.enabled === true)).toBe(true);
  });

  it("supports a manager limit", () => {
    expect(getInstitutionalManagers({ limit: 2 })).toHaveLength(2);
  });

  it("does not encode stock ownership claims", () => {
    expect(
      INSTITUTIONAL_MANAGER_REGISTRY.some(item =>
        Object.hasOwn(item, "symbols") ||
        Object.hasOwn(item, "holdings"),
      ),
    ).toBe(false);
  });
});
