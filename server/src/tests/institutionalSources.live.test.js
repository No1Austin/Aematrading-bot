// server/src/tests/institutionalSources.live.test.js

import {
  describe,
  expect,
  test,
} from "vitest";

import createSecInstitutionalFilingsProvider from
  "../data/providers/institutional/secInstitutionalFilingsProvider.js";

import createFinraRegShoProvider from
  "../data/providers/institutional/finraRegShoProvider.js";

describe(
  "Institutional Sources — Live Connections",
  () => {
    test(
      "connects to FINRA with real credentials",
      async () => {
        const finra =
          createFinraRegShoProvider();

        const result =
          await finra
            .testAuthentication();

        console.log(
          "FINRA AUTH:",
          result,
        );

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.status,
        ).toBe(
          "CONNECTED",
        );
      },
      30_000,
    );

    test(
      "reads live FINRA Reg SHO data for AAPL",
      async () => {
        const finra =
          createFinraRegShoProvider();

        const result =
          await finra
            .getDailyShortVolume({
              symbol:
                "AAPL",
            });

        console.log(
          "FINRA AAPL:",
          JSON.stringify(
            result,
            null,
            2,
          ),
        );

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.symbol,
        ).toBe(
          "AAPL",
        );
      },
      30_000,
    );

    test(
      "connects to SEC public submissions API",
      async () => {
        const sec =
          createSecInstitutionalFilingsProvider();

        /**
         * Apple CIK.
         *
         * This test is only checking that the public SEC
         * submissions endpoint is reachable.
         */
        const result =
          await sec
            .getSubmissions({
              cik:
                "320193",
            });

        console.log(
          "SEC COMPANY:",
          {
            cik:
              result?.cik,

            name:
              result?.name,

            tickers:
              result?.tickers,
          },
        );

        expect(
          result,
        ).toBeTruthy();

        expect(
          result.name,
        ).toBeTruthy();
      },
      30_000,
    );
  },
);