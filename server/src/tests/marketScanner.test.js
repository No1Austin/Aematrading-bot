import {
  beforeEach,
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  clearMarketUniverseCache,
  getMarketUniverse,
  MARKET_UNIVERSE_STATUS,
} from "../scanner/marketUniverseProvider.js";

import {
  scanMarket,
} from "../scanner/marketScanner.js";

import {
  clearCandidateRegistry,
  getCandidate,
} from "../scanner/candidateRegistry.js";

/**
 * ============================================================
 * ENVIRONMENT BACKUP
 * ============================================================
 */

const originalApiKey =
  process.env.ALPACA_API_KEY;

const originalSecretKey =
  process.env.ALPACA_SECRET_KEY;

const originalBaseUrl =
  process.env.ALPACA_TRADING_BASE_URL;

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function mockFetchResponse(
  payload,
  {
    ok = true,
    status = 200,
  } = {},
) {
  return vi.fn(
    async () => ({
      ok,
      status,

      json:
        async () =>
          payload,

      text:
        async () =>
          JSON.stringify(
            payload,
          ),
    }),
  );
}

function alpacaAsset({
  symbol,
  assetClass = "us_equity",
  status = "active",
  exchange = "NASDAQ",
  tradable = true,
  marginable = true,
  shortable = true,
  borrowStatus = "easy",
  easyToBorrow = true,
  fractionable = true,
} = {}) {
  return {
    id:
      `asset-${symbol}`,

    class:
      assetClass,

    exchange,

    symbol,

    name:
      `${symbol} Corporation`,

    status,

    tradable,

    marginable,

    shortable,

    borrow_status:
      borrowStatus,

    easy_to_borrow:
      easyToBorrow,

    fractionable,

    attributes: [],
  };
}

function baseMeasurement(
  overrides = {},
) {
  return {
    symbol: "TEST",

    price: 100,

    bid: 99.95,
    ask: 100.05,

    averageDailyVolume:
      2_000_000,

    dollarVolume:
      200_000_000,

    spreadPercent:
      0.001,

    relativeVolume:
      1.5,

    change5mPercent:
      0,

    change15mPercent:
      0,

    change60mPercent:
      0,

    atrPercent:
      2,

    intradayRangePercent:
      3,

    vwap: 100,

    ema20: 100,
    ema50: 100,

    recentHigh: 105,
    recentLow: 95,

    tradable: true,
    shortable: true,

    marketRegime:
      "NEUTRAL",

    ...overrides,
  };
}

function bullishMeasurement({
  symbol,
  strength = 1,
} = {}) {
  return baseMeasurement({
    symbol,

    price:
      110 + strength,

    relativeVolume:
      2.2 +
      strength * 0.2,

    change5mPercent:
      0.7 +
      strength * 0.1,

    change15mPercent:
      1.4 +
      strength * 0.2,

    change60mPercent:
      2.5 +
      strength * 0.3,

    atrPercent: 2.2,

    intradayRangePercent:
      4,

    vwap: 106,

    ema20: 105,

    ema50: 101,

    recentHigh: 108,

    recentLow: 98,

    marketRegime:
      "BULLISH",
  });
}

function bearishMeasurement({
  symbol,
  strength = 1,
} = {}) {
  return baseMeasurement({
    symbol,

    price:
      90 - strength,

    relativeVolume:
      2.2 +
      strength * 0.2,

    change5mPercent:
      -(
        0.7 +
        strength * 0.1
      ),

    change15mPercent:
      -(
        1.4 +
        strength * 0.2
      ),

    change60mPercent:
      -(
        2.5 +
        strength * 0.3
      ),

    atrPercent: 2.2,

    intradayRangePercent:
      4,

    vwap: 94,

    ema20: 95,

    ema50: 100,

    recentHigh: 104,

    recentLow: 92,

    marketRegime:
      "BEARISH",
  });
}

/**
 * ============================================================
 * RESET
 * ============================================================
 */

beforeEach(() => {
  clearMarketUniverseCache();
  clearCandidateRegistry();

  process.env.ALPACA_API_KEY =
    "test-key";

  process.env.ALPACA_SECRET_KEY =
    "test-secret";

  process.env.ALPACA_TRADING_BASE_URL =
    "https://paper-api.alpaca.markets";

  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();

  if (
    originalApiKey ===
    undefined
  ) {
    delete process.env
      .ALPACA_API_KEY;
  } else {
    process.env
      .ALPACA_API_KEY =
      originalApiKey;
  }

  if (
    originalSecretKey ===
    undefined
  ) {
    delete process.env
      .ALPACA_SECRET_KEY;
  } else {
    process.env
      .ALPACA_SECRET_KEY =
      originalSecretKey;
  }

  if (
    originalBaseUrl ===
    undefined
  ) {
    delete process.env
      .ALPACA_TRADING_BASE_URL;
  } else {
    process.env
      .ALPACA_TRADING_BASE_URL =
      originalBaseUrl;
  }

  clearMarketUniverseCache();
  clearCandidateRegistry();
});

/**
 * ============================================================
 * MARKET UNIVERSE — AUTH
 * ============================================================
 */

describe(
  "Market Universe Provider — Authentication",
  () => {
    it(
      "fails closed when Alpaca credentials are missing",
      async () => {
        delete process.env
          .ALPACA_API_KEY;

        delete process.env
          .ALPACA_SECRET_KEY;

        const result =
          await getMarketUniverse({
            refresh: true,
          });

        expect(
          result.approved,
        ).toBe(false);

        expect(
          result.status,
        ).toBe(
          MARKET_UNIVERSE_STATUS
            .AUTH_MISSING,
        );

        expect(
          result.assets,
        ).toEqual([]);

        expect(
          result.symbols,
        ).toEqual([]);
      },
    );
  },
);

/**
 * ============================================================
 * MARKET UNIVERSE — FILTERING
 * ============================================================
 */

describe(
  "Market Universe Provider — Filtering",
  () => {
    it(
      "keeps active tradable US equities",
      async () => {
        const fetchMock =
          mockFetchResponse([
            alpacaAsset({
              symbol: "AAPL",
            }),

            alpacaAsset({
              symbol: "NVDA",
            }),
          ]);

        vi.stubGlobal(
          "fetch",
          fetchMock,
        );

        const result =
          await getMarketUniverse({
            refresh: true,
          });

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.status,
        ).toBe(
          MARKET_UNIVERSE_STATUS
            .COMPLETE,
        );

        expect(
          result.symbols,
        ).toEqual([
          "AAPL",
          "NVDA",
        ]);
      },
    );

    it(
      "removes non-US-equity assets",
      async () => {
        vi.stubGlobal(
          "fetch",
          mockFetchResponse([
            alpacaAsset({
              symbol: "AAPL",
            }),

            alpacaAsset({
              symbol: "BTCUSD",
              assetClass:
                "crypto",
            }),
          ]),
        );

        const result =
          await getMarketUniverse({
            refresh: true,
          });

        expect(
          result.symbols,
        ).toEqual([
          "AAPL",
        ]);
      },
    );

    it(
      "removes inactive assets",
      async () => {
        vi.stubGlobal(
          "fetch",
          mockFetchResponse([
            alpacaAsset({
              symbol: "AAPL",
            }),

            alpacaAsset({
              symbol: "OLD",
              status:
                "inactive",
            }),
          ]),
        );

        const result =
          await getMarketUniverse({
            refresh: true,
          });

        expect(
          result.symbols,
        ).toEqual([
          "AAPL",
        ]);
      },
    );

    it(
      "removes non-tradable assets by default",
      async () => {
        vi.stubGlobal(
          "fetch",
          mockFetchResponse([
            alpacaAsset({
              symbol: "AAPL",
            }),

            alpacaAsset({
              symbol: "LOCKED",
              tradable: false,
            }),
          ]),
        );

        const result =
          await getMarketUniverse({
            refresh: true,
          });

        expect(
          result.symbols,
        ).toEqual([
          "AAPL",
        ]);
      },
    );

    it(
      "removes OTC assets by default",
      async () => {
        vi.stubGlobal(
          "fetch",
          mockFetchResponse([
            alpacaAsset({
              symbol: "AAPL",
              exchange:
                "NASDAQ",
            }),

            alpacaAsset({
              symbol: "OTCX",
              exchange:
                "OTC",
            }),
          ]),
        );

        const result =
          await getMarketUniverse({
            refresh: true,
          });

        expect(
          result.symbols,
        ).toEqual([
          "AAPL",
        ]);
      },
    );
  },
);

/**
 * ============================================================
 * MARKET UNIVERSE — SHORT METADATA
 * ============================================================
 */

describe(
  "Market Universe Provider — LONG/SHORT Eligibility",
  () => {
    it(
      "preserves LONG eligibility for tradable stocks",
      async () => {
        vi.stubGlobal(
          "fetch",
          mockFetchResponse([
            alpacaAsset({
              symbol: "AAPL",
              shortable: false,
            }),
          ]),
        );

        const result =
          await getMarketUniverse({
            refresh: true,
          });

        expect(
          result.longEligibleSymbols,
        ).toContain("AAPL");
      },
    );

    it(
      "preserves SHORT eligibility for shortable stocks",
      async () => {
        vi.stubGlobal(
          "fetch",
          mockFetchResponse([
            alpacaAsset({
              symbol: "NVDA",
              shortable: true,
              borrowStatus:
                "easy",
            }),
          ]),
        );

        const result =
          await getMarketUniverse({
            refresh: true,
          });

        expect(
          result.shortEligibleSymbols,
        ).toContain(
          "NVDA",
        );
      },
    );

    it(
      "does not mark non-shortable stocks as SHORT eligible",
      async () => {
        vi.stubGlobal(
          "fetch",
          mockFetchResponse([
            alpacaAsset({
              symbol: "AAPL",
              shortable: false,
            }),
          ]),
        );

        const result =
          await getMarketUniverse({
            refresh: true,
          });

        expect(
          result.shortEligibleSymbols,
        ).not.toContain(
          "AAPL",
        );
      },
    );

    it(
      "does not mark unavailable borrow as SHORT eligible",
      async () => {
        vi.stubGlobal(
          "fetch",
          mockFetchResponse([
            alpacaAsset({
              symbol: "XYZ",
              shortable: true,
              borrowStatus:
                "unavailable",
            }),
          ]),
        );

        const result =
          await getMarketUniverse({
            refresh: true,
          });

        expect(
          result.shortEligibleSymbols,
        ).not.toContain(
          "XYZ",
        );
      },
    );
  },
);

/**
 * ============================================================
 * MARKET UNIVERSE — CACHE
 * ============================================================
 */

describe(
  "Market Universe Provider — Cache",
  () => {
    it(
      "reuses a completed cached universe",
      async () => {
        const fetchMock =
          mockFetchResponse([
            alpacaAsset({
              symbol: "AAPL",
            }),
          ]);

        vi.stubGlobal(
          "fetch",
          fetchMock,
        );

        const first =
          await getMarketUniverse();

        const second =
          await getMarketUniverse();

        expect(
          first.symbols,
        ).toEqual([
          "AAPL",
        ]);

        expect(
          second.symbols,
        ).toEqual([
          "AAPL",
        ]);

        expect(
          fetchMock,
        ).toHaveBeenCalledTimes(1);
      },
    );

    it(
      "refresh bypasses completed cache",
      async () => {
        const fetchMock =
          vi.fn();

        fetchMock
          .mockResolvedValueOnce({
            ok: true,
            status: 200,

            json:
              async () => [
                alpacaAsset({
                  symbol: "AAPL",
                }),
              ],

            text:
              async () => "",
          })
          .mockResolvedValueOnce({
            ok: true,
            status: 200,

            json:
              async () => [
                alpacaAsset({
                  symbol: "NVDA",
                }),
              ],

            text:
              async () => "",
          });

        vi.stubGlobal(
          "fetch",
          fetchMock,
        );

        const first =
          await getMarketUniverse();

        const second =
          await getMarketUniverse({
            refresh: true,
          });

        expect(
          first.symbols,
        ).toEqual([
          "AAPL",
        ]);

        expect(
          second.symbols,
        ).toEqual([
          "NVDA",
        ]);

        expect(
          fetchMock,
        ).toHaveBeenCalledTimes(2);
      },
    );

    it(
      "deduplicates simultaneous universe builds",
      async () => {
        let resolveRequest;

        const providerPromise =
          new Promise(
            resolve => {
              resolveRequest =
                resolve;
            },
          );

        const fetchMock =
          vi.fn(
            async () => {
              await providerPromise;

              return {
                ok: true,
                status: 200,

                json:
                  async () => [
                    alpacaAsset({
                      symbol:
                        "AAPL",
                    }),
                  ],

                text:
                  async () => "",
              };
            },
          );

        vi.stubGlobal(
          "fetch",
          fetchMock,
        );

        const first =
          getMarketUniverse();

        const second =
          getMarketUniverse();

        resolveRequest();

        const [
          firstResult,
          secondResult,
        ] =
          await Promise.all([
            first,
            second,
          ]);

        expect(
          fetchMock,
        ).toHaveBeenCalledTimes(1);

        expect(
          firstResult.symbols,
        ).toEqual([
          "AAPL",
        ]);

        expect(
          secondResult.symbols,
        ).toEqual([
          "AAPL",
        ]);
      },
    );
  },
);

/**
 * ============================================================
 * MARKET SCANNER — BASIC CONTRACT
 * ============================================================
 */

describe(
  "Market Scanner — Basic Contract",
  () => {
    it(
      "handles an empty measurement set safely",
      async () => {
        const result =
          await scanMarket({
            measurements: [],

            submitForDeepResearch:
              false,
          });

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.scanned,
        ).toBe(0);

        expect(
          result.qualified,
        ).toBe(0);

        expect(
          result.candidates,
        ).toEqual([]);
      },
    );

    it(
      "rejects weak market setups",
      async () => {
        const result =
          await scanMarket({
            measurements: [
              baseMeasurement({
                symbol: "FLAT",

                relativeVolume:
                  1,

                change5mPercent:
                  0,

                change15mPercent:
                  0,

                change60mPercent:
                  0,

                vwap: 100,
                ema20: 100,
                ema50: 100,
              }),
            ],

            submitForDeepResearch:
              false,
          });

        expect(
          result.scanned,
        ).toBe(1);

        expect(
          result.qualified,
        ).toBe(0);

        expect(
          result.candidates,
        ).toEqual([]);
      },
    );
  },
);

/**
 * ============================================================
 * MARKET SCANNER — LONG / SHORT DISCOVERY
 * ============================================================
 */

describe(
  "Market Scanner — Directional Discovery",
  () => {
    it(
      "discovers a strong LONG candidate",
      async () => {
        const result =
          await scanMarket({
            measurements: [
              bullishMeasurement({
                symbol: "NVDA",
                strength: 2,
              }),
            ],

            submitForDeepResearch:
              false,
          });

        expect(
          result.qualified,
        ).toBe(1);

        expect(
          result.candidates[0]
            .symbol,
        ).toBe("NVDA");

        expect(
          result.candidates[0]
            .preferredDirection,
        ).toBe("LONG");
      },
    );

    it(
      "discovers a strong SHORT candidate",
      async () => {
        const result =
          await scanMarket({
            measurements: [
              bearishMeasurement({
                symbol: "TSLA",
                strength: 2,
              }),
            ],

            submitForDeepResearch:
              false,
          });

        expect(
          result.qualified,
        ).toBe(1);

        expect(
          result.candidates[0]
            .symbol,
        ).toBe("TSLA");

        expect(
          result.candidates[0]
            .preferredDirection,
        ).toBe("SHORT");
      },
    );
  },
);

/**
 * ============================================================
 * MARKET SCANNER — RANKING
 * ============================================================
 */

describe(
  "Market Scanner — Ranking",
  () => {
    it(
      "ranks qualified candidates by scanner score",
      async () => {
        const result =
          await scanMarket({
            measurements: [
              bullishMeasurement({
                symbol: "LOW",
                strength: 1,
              }),

              bullishMeasurement({
                symbol: "HIGH",
                strength: 4,
              }),

              bullishMeasurement({
                symbol: "MID",
                strength: 2,
              }),
            ],

            submitForDeepResearch:
              false,
          });

        const scores =
          result.candidates.map(
            candidate =>
              candidate
                .scannerScore,
          );

        for (
          let index = 1;
          index < scores.length;
          index += 1
        ) {
          expect(
            scores[index - 1],
          ).toBeGreaterThanOrEqual(
            scores[index],
          );
        }
      },
    );
  },
);

/**
 * ============================================================
 * MARKET SCANNER — CANDIDATE CAP
 * ============================================================
 */

describe(
  "Market Scanner — Candidate Limit",
  () => {
    it(
      "limits the number of returned candidates",
      async () => {
        const result =
          await scanMarket({
            measurements: [
              bullishMeasurement({
                symbol: "AAA",
                strength: 5,
              }),

              bullishMeasurement({
                symbol: "BBB",
                strength: 4,
              }),

              bullishMeasurement({
                symbol: "CCC",
                strength: 3,
              }),

              bullishMeasurement({
                symbol: "DDD",
                strength: 2,
              }),
            ],

            maximumCandidates: 2,

            submitForDeepResearch:
              false,
          });

        expect(
          result.candidates,
        ).toHaveLength(2);
      },
    );
  },
);

/**
 * ============================================================
 * MARKET SCANNER — QUALIFICATION GATE
 * ============================================================
 */

describe(
  "Market Scanner — Qualification Safety",
  () => {
    it(
      "does not expose rejected stocks as candidates",
      async () => {
        const result =
          await scanMarket({
            measurements: [
              bullishMeasurement({
                symbol: "GOOD",
                strength: 3,
              }),

              baseMeasurement({
                symbol: "BAD",
                tradable: false,
              }),
            ],

            submitForDeepResearch:
              false,
          });

        expect(
          result.candidates.some(
            candidate =>
              candidate.symbol ===
              "GOOD",
          ),
        ).toBe(true);

        expect(
          result.candidates.some(
            candidate =>
              candidate.symbol ===
              "BAD",
          ),
        ).toBe(false);
      },
    );
  },
);

/**
 * ============================================================
 * MARKET SCANNER — RESEARCH SUBMISSION
 * ============================================================
 */

describe(
  "Market Scanner — Deep Research Submission",
  () => {
    it(
      "does not register candidates when deep research submission is disabled",
      async () => {
        await scanMarket({
          measurements: [
            bullishMeasurement({
              symbol: "NVDA",
              strength: 3,
            }),
          ],

          submitForDeepResearch:
            false,
        });

        expect(
          getCandidate("NVDA"),
        ).toBeNull();
      },
    );
  },
);