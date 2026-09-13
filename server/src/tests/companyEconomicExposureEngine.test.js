// server/src/tests/companyEconomicExposureEngine.test.js

import {
  describe,
  expect,
  test,
} from "vitest";

import analyzeCompanyEconomicExposure from
  "../analysis/companyEconomicExposureEngine.js";

describe(
  "Company Economic Exposure Engine",
  () => {
    test(
      "fails closed when no classification or explicit evidence exists",
      () => {
        const result =
          analyzeCompanyEconomicExposure({
            symbol: "TEST",
          });

        expect(
          result.approved,
        ).toBe(false);

        expect(
          result.status,
        ).toBe(
          "INSUFFICIENT_DATA",
        );

        expect(
          result.sensitivity,
        ).toBeNull();

        expect(
          result.confidence,
        ).toBe(0);
      },
    );

    test(
      "technology sector produces usable five-factor exposure",
      () => {
        const result =
          analyzeCompanyEconomicExposure({
            symbol: "TEST",
            sector:
              "Technology",
          });

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.status,
        ).toBe(
          "COMPLETE",
        );

        expect(
          result.coverage,
        ).toBe(1);

        expect(
          result.sensitivity,
        ).toEqual(
          expect.objectContaining({
            recession:
              expect.any(
                Number,
              ),

            interestRates:
              expect.any(
                Number,
              ),

            consumer:
              expect.any(
                Number,
              ),

            currency:
              expect.any(
                Number,
              ),

            trade:
              expect.any(
                Number,
              ),
          }),
        );
      },
    );

    test(
      "consumer electronics industry increases trade and consumer sensitivity",
      () => {
        const result =
          analyzeCompanyEconomicExposure({
            symbol: "AAPL",
            sector:
              "Technology",
            industry:
              "Consumer Electronics",
          });

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.sensitivity
            .consumer,
        ).toBeGreaterThanOrEqual(
          0.7,
        );

        expect(
          result.sensitivity
            .trade,
        ).toBeGreaterThanOrEqual(
          0.8,
        );

        expect(
          result.sources
            .trade,
        ).toBe(
          "INDUSTRY_PROFILE",
        );
      },
    );

    test(
      "explicit evidence overrides classification priors",
      () => {
        const result =
          analyzeCompanyEconomicExposure({
            symbol: "TEST",
            sector:
              "Technology",

            explicitSensitivity: {
              recession: 0.1,
              interestRates:
                0.2,
              consumer: 0.3,
              currency: 0.4,
              trade: 0.5,
            },
          });

        expect(
          result.sensitivity,
        ).toEqual({
          recession: 0.1,
          interestRates: 0.2,
          consumer: 0.3,
          currency: 0.4,
          trade: 0.5,
        });

        expect(
          result.sources
            .recession,
        ).toBe(
          "EXPLICIT_COMPANY_EVIDENCE",
        );
      },
    );

    test(
      "measured zero remains zero",
      () => {
        const result =
          analyzeCompanyEconomicExposure({
            symbol: "TEST",
            sector:
              "Technology",

            explicitSensitivity: {
              trade: 0,
            },
          });

        expect(
          result.sensitivity
            .trade,
        ).toBe(0);

        expect(
          result.sources
            .trade,
        ).toBe(
          "EXPLICIT_COMPANY_EVIDENCE",
        );
      },
    );

    test(
      "out-of-range explicit values are clamped safely",
      () => {
        const result =
          analyzeCompanyEconomicExposure({
            symbol: "TEST",

            explicitSensitivity: {
              recession: -1,
              interestRates: 2,
              consumer: 0.5,
              currency: 0.5,
              trade: 0.5,
            },
          });

        expect(
          result.sensitivity
            .recession,
        ).toBe(0);

        expect(
          result.sensitivity
            .interestRates,
        ).toBe(1);
      },
    );
  },
);
