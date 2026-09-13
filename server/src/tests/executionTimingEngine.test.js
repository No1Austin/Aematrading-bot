// server/src/tests/executionTimingEngine.test.js

import {
  describe,
  expect,
  test,
} from "vitest";

import evaluateExecutionTiming, {
  DEFAULT_EXECUTION_TIMING_CONFIG,
} from "../risk/executionTimingEngine.js";

function trade(
  overrides = {},
) {
  return {
    symbol: "AAPL",
    side: "LONG",
    shares: 100,
    entryPrice: 200,
    ...overrides,
  };
}

// August dates below are EDT (UTC-4).
function atEastern(
  hour,
  minute,
  second = 0,
) {
  const utcHour =
    hour + 4;

  return new Date(
    Date.UTC(
      2026,
      7,
      24,
      utcHour,
      minute,
      second,
    ),
  ).toISOString();
}

describe(
  "Execution Timing Engine — Approval",
  () => {
    test(
      "approves healthy regular-session timing",
      () => {
        const result =
          evaluateExecutionTiming({
            proposedTrade:
              trade(),

            timestamp:
              atEastern(
                10,
                30,
              ),
          });

        expect(
          result.status,
        ).toBe(
          "APPROVED",
        );

        expect(
          result.canExecute,
        ).toBe(true);

        expect(
          result.approvedShares,
        ).toBe(100);
      },
    );
  },
);

describe(
  "Execution Timing Engine — Opening Window",
  () => {
    test(
      "blocks the very early opening window",
      () => {
        const result =
          evaluateExecutionTiming({
            proposedTrade:
              trade(),

            timestamp:
              atEastern(
                9,
                31,
              ),
          });

        expect(
          result.status,
        ).toBe(
          "BLOCKED",
        );

        expect(
          result.canExecute,
        ).toBe(false);
      },
    );

    test(
      "reduces exposure during the opening-risk window",
      () => {
        const result =
          evaluateExecutionTiming({
            proposedTrade:
              trade(),

            timestamp:
              atEastern(
                9,
                35,
              ),
          });

        expect(
          result.status,
        ).toBe(
          "REDUCED",
        );

        expect(
          result.approvedShares,
        ).toBeLessThan(
          100,
        );
      },
    );
  },
);

describe(
  "Execution Timing Engine — Closing Window",
  () => {
    test(
      "reduces exposure near the close",
      () => {
        const result =
          evaluateExecutionTiming({
            proposedTrade:
              trade(),

            timestamp:
              atEastern(
                15,
                50,
              ),
          });

        expect(
          result.status,
        ).toBe(
          "REDUCED",
        );

        expect(
          result.approvedShares,
        ).toBeLessThan(
          100,
        );
      },
    );

    test(
      "blocks the final minutes before close",
      () => {
        const result =
          evaluateExecutionTiming({
            proposedTrade:
              trade(),

            timestamp:
              atEastern(
                15,
                59,
              ),
          });

        expect(
          result.status,
        ).toBe(
          "BLOCKED",
        );
      },
    );
  },
);

describe(
  "Execution Timing Engine — Midday",
  () => {
    test(
      "reduces during the configured lunch window",
      () => {
        const result =
          evaluateExecutionTiming({
            proposedTrade:
              trade(),

            timestamp:
              atEastern(
                12,
                30,
              ),
          });

        expect(
          result.status,
        ).toBe(
          "REDUCED",
        );

        expect(
          result.approvedShares,
        ).toBe(80);
      },
    );
  },
);

describe(
  "Execution Timing Engine — Extended Hours",
  () => {
    test(
      "blocks premarket by default",
      () => {
        const result =
          evaluateExecutionTiming({
            proposedTrade:
              trade(),

            timestamp:
              atEastern(
                8,
                30,
              ),
          });

        expect(
          result.status,
        ).toBe(
          "BLOCKED",
        );

        expect(
          result.metrics
            .session,
        ).toBe(
          "PREMARKET",
        );
      },
    );

    test(
      "blocks after-hours by default",
      () => {
        const result =
          evaluateExecutionTiming({
            proposedTrade:
              trade(),

            timestamp:
              atEastern(
                16,
                30,
              ),
          });

        expect(
          result.status,
        ).toBe(
          "BLOCKED",
        );

        expect(
          result.metrics
            .session,
        ).toBe(
          "AFTER_HOURS",
        );
      },
    );

    test(
      "blocks weekends",
      () => {
        const result =
          evaluateExecutionTiming({
            proposedTrade:
              trade(),

            timestamp:
              "2026-08-23T14:30:00.000Z",
          });

        expect(
          result.status,
        ).toBe(
          "BLOCKED",
        );

        expect(
          result.metrics
            .session,
        ).toBe(
          "MARKET_CLOSED",
        );
      },
    );
  },
);

describe(
  "Execution Timing Engine — Scheduled Event Proximity",
  () => {
    test(
      "reduces when a scheduled event is close",
      () => {
        const result =
          evaluateExecutionTiming({
            proposedTrade:
              trade(),

            timestamp:
              atEastern(
                10,
                30,
              ),

            minutesUntilScheduledEvent:
              5,
          });

        expect(
          result.status,
        ).toBe(
          "REDUCED",
        );

        expect(
          result.approvedShares,
        ).toBe(50);
      },
    );

    test(
      "blocks when a scheduled event is extremely close",
      () => {
        const result =
          evaluateExecutionTiming({
            proposedTrade:
              trade(),

            timestamp:
              atEastern(
                10,
                30,
              ),

            minutesUntilScheduledEvent:
              1,
          });

        expect(
          result.status,
        ).toBe(
          "BLOCKED",
        );
      },
    );

    test(
      "accepts an absolute scheduled event timestamp",
      () => {
        const timestamp =
          atEastern(
            10,
            30,
          );

        const scheduledEventAt =
          atEastern(
            10,
            35,
          );

        const result =
          evaluateExecutionTiming({
            proposedTrade:
              trade(),

            timestamp,
            scheduledEventAt,
          });

        expect(
          result.status,
        ).toBe(
          "REDUCED",
        );

        expect(
          result.metrics
            .scheduledEventDistanceMinutes,
        ).toBe(5);
      },
    );
  },
);

describe(
  "Execution Timing Engine — Safety",
  () => {
    test(
      "never increases shares",
      () => {
        const result =
          evaluateExecutionTiming({
            proposedTrade:
              trade({
                shares:
                  40,
              }),

            timestamp:
              atEastern(
                10,
                30,
              ),

            config: {
              lunchExposureMultiplier:
                2,

              openingExposureMultiplier:
                2,

              closingExposureMultiplier:
                2,

              scheduledEventExposureMultiplier:
                2,
            },
          });

        expect(
          result.approvedShares,
        ).toBeLessThanOrEqual(
          40,
        );
      },
    );

    test(
      "applies same timing protection to SHORT trades",
      () => {
        const result =
          evaluateExecutionTiming({
            proposedTrade:
              trade({
                side:
                  "SHORT",
              }),

            timestamp:
              atEastern(
                9,
                35,
              ),
          });

        expect(
          result.status,
        ).toBe(
          "REDUCED",
        );

        expect(
          result.approvedShares,
        ).toBeLessThan(
          100,
        );
      },
    );

    test(
      "blocks when required reduction is below minimum executable exposure",
      () => {
        const result =
          evaluateExecutionTiming({
            proposedTrade:
              trade(),

            timestamp:
              atEastern(
                12,
                30,
              ),

            config: {
              lunchExposureMultiplier:
                0.05,

              minimumExposureMultiplier:
                0.1,
            },
          });

        expect(
          result.status,
        ).toBe(
          "BLOCKED",
        );

        expect(
          result.canExecute,
        ).toBe(false);
      },
    );
  },
);

describe(
  "Execution Timing Engine — Validation",
  () => {
    test(
      "missing proposed trade safely blocks",
      () => {
        const result =
          evaluateExecutionTiming({
            timestamp:
              atEastern(
                10,
                30,
              ),
          });

        expect(
          result.status,
        ).toBe(
          "INVALID_INPUT",
        );

        expect(
          result.canExecute,
        ).toBe(false);
      },
    );

    test(
      "invalid side safely blocks",
      () => {
        const result =
          evaluateExecutionTiming({
            proposedTrade:
              trade({
                side:
                  "SIDEWAYS",
              }),

            timestamp:
              atEastern(
                10,
                30,
              ),
          });

        expect(
          result.status,
        ).toBe(
          "INVALID_INPUT",
        );
      },
    );

    test(
      "missing timestamp safely blocks",
      () => {
        const result =
          evaluateExecutionTiming({
            proposedTrade:
              trade(),
          });

        expect(
          result.status,
        ).toBe(
          "INVALID_INPUT",
        );

        expect(
          result.canExecute,
        ).toBe(false);
      },
    );
  },
);

describe(
  "Execution Timing Engine — Configuration",
  () => {
    test(
      "exports frozen default configuration",
      () => {
        expect(
          Object.isFrozen(
            DEFAULT_EXECUTION_TIMING_CONFIG,
          ),
        ).toBe(true);
      },
    );
  },
);

describe(
  "Execution Timing Engine — Determinism",
  () => {
    test(
      "same inputs produce same decision",
      () => {
        const input = {
          proposedTrade:
            trade(),

          timestamp:
            atEastern(
              12,
              30,
            ),

          minutesUntilScheduledEvent:
            7,
        };

        const first =
          evaluateExecutionTiming(
            input,
          );

        const second =
          evaluateExecutionTiming(
            input,
          );

        expect(
          second,
        ).toEqual(
          first,
        );
      },
    );
  },
);
