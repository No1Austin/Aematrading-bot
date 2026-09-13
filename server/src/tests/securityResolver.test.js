import { describe, expect, it, vi } from "vitest";
import createSecurityResolver from "../services/securityResolver.js";

describe("Verified Security Resolver", () => {
  it("matches only an exact verified CUSIP", async () => {
    const resolver = createSecurityResolver({
      identities: [{
        symbol: "AAPL",
        cusip: "037833100",
        verified: true,
        source: "TEST_SECURITY_MASTER",
      }],
    });

    await expect(
      resolver({ symbol: "AAPL", holding: { cusip: "037833100" } }),
    ).resolves.toMatchObject({
      matched: true,
      symbol: "AAPL",
      method: "VERIFIED_CUSIP",
    });

    await expect(
      resolver({ symbol: "AAPL", holding: { cusip: "594918104" } }),
    ).resolves.toMatchObject({
      matched: false,
      reason: "CUSIP_MISMATCH",
    });
  });

  it("fails closed when identity is not verified", async () => {
    const resolver = createSecurityResolver({
      identities: [{ symbol: "AAPL", cusip: "037833100" }],
    });

    const result = await resolver({
      symbol: "AAPL",
      holding: { cusip: "037833100" },
    });

    expect(result.matched).toBe(false);
    expect(result.reason).toBe("NO_VERIFIED_SECURITY_IDENTITY");
  });

  it("caches verified identity lookup per symbol", async () => {
    const lookup = vi.fn(async () => ({
      symbol: "MSFT",
      cusip: "594918104",
      verified: true,
    }));

    const resolver = createSecurityResolver({
      lookupSecurityIdentity: lookup,
    });

    await resolver({ symbol: "MSFT", holding: { cusip: "594918104" } });
    await resolver({ symbol: "MSFT", holding: { cusip: "594918104" } });

    expect(lookup).toHaveBeenCalledTimes(1);
  });
});
