import {
  describe,
  expect,
  test,
} from "vitest";

import validatePaperExecution, {
  DEFAULT_PAPER_EXECUTION_CONFIG,
} from "../execution/paperExecutionGateway.js";

const NOW =
  Date.parse(
    "2026-08-23T15:00:00.000Z",
  );

function decision(overrides = {}) {
  return {
    symbol: "AAPL",

    preferredSide: "LONG",

    canProceedToPaperExecution:
      true,

    position: {
      shares: 100,
      side: "LONG",
    },

    timestamp:
      new Date(
        NOW - 5_000,
      ).toISOString(),

    ...overrides,
  };
}

describe(
  "Paper Execution Gateway — Approval",
  () => {
    test(
      "approves a valid paper trade",
      () => {
        const result =
          validatePaperExecution({
            finalDecision:
              decision(),

            now: NOW,
          });

        expect(
          result.status,
        ).toBe(
          "APPROVED",
        );

        expect(
          result.canSubmit,
        ).toBe(true);

        expect(
          result.order.symbol,
        ).toBe("AAPL");

        expect(
          result.order.qty,
        ).toBe(100);

        expect(
          result.order.side,
        ).toBe("buy");

        expect(
          result.order.paper,
        ).toBe(true);
      },
    );
  },
);

describe(
  "Paper Execution Gateway — Pipeline Approval",
  () => {
    test(
      "blocks when final pipeline approval is false",
      () => {
        const result =
          validatePaperExecution({
            finalDecision:
              decision({
                canProceedToPaperExecution:
                  false,
              }),

            now: NOW,
          });

        expect(
          result.canSubmit,
        ).toBe(false);

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
  "Paper Execution Gateway — Position",
  () => {
    test(
      "blocks zero shares",
      () => {
        const result =
          validatePaperExecution({
            finalDecision:
              decision({
                position: {
                  shares: 0,
                  side: "LONG",
                },
              }),

            now: NOW,
          });

        expect(
          result.canSubmit,
        ).toBe(false);
      },
    );

    test(
      "blocks negative shares",
      () => {
        const result =
          validatePaperExecution({
            finalDecision:
              decision({
                position: {
                  shares: -10,
                  side: "LONG",
                },
              }),

            now: NOW,
          });

        expect(
          result.canSubmit,
        ).toBe(false);
      },
    );

    test(
      "blocks fractional shares",
      () => {
        const result =
          validatePaperExecution({
            finalDecision:
              decision({
                position: {
                  shares: 10.5,
                  side: "LONG",
                },
              }),

            now: NOW,
          });

        expect(
          result.canSubmit,
        ).toBe(false);
      },
    );

    test(
      "blocks oversized orders",
      () => {
        const result =
          validatePaperExecution({
            finalDecision:
              decision({
                position: {
                  shares: 10001,
                  side: "LONG",
                },
              }),

            now: NOW,
          });

        expect(
          result.canSubmit,
        ).toBe(false);
      },
    );
  },
);

describe(
  "Paper Execution Gateway — Side",
  () => {
    test(
      "converts SHORT to broker SELL",
      () => {
        const result =
          validatePaperExecution({
            finalDecision:
              decision({
                preferredSide:
                  "SHORT",

                position: {
                  shares: 50,
                  side: "SHORT",
                },
              }),

            now: NOW,
          });

        expect(
          result.canSubmit,
        ).toBe(true);

        expect(
          result.order.side,
        ).toBe("sell");
      },
    );

    test(
      "blocks invalid side",
      () => {
        const result =
          validatePaperExecution({
            finalDecision:
              decision({
                preferredSide:
                  "SIDEWAYS",
              }),

            now: NOW,
          });

        expect(
          result.canSubmit,
        ).toBe(false);
      },
    );
  },
);

describe(
  "Paper Execution Gateway — Freshness",
  () => {
    test(
      "blocks stale decisions",
      () => {
        const result =
          validatePaperExecution({
            finalDecision:
              decision({
                timestamp:
                  new Date(
                    NOW -
                      120_000,
                  ).toISOString(),
              }),

            now: NOW,
          });

        expect(
          result.canSubmit,
        ).toBe(false);

        expect(
          result.status,
        ).toBe(
          "BLOCKED",
        );
      },
    );

    test(
      "blocks future decisions",
      () => {
        const result =
          validatePaperExecution({
            finalDecision:
              decision({
                timestamp:
                  new Date(
                    NOW +
                      5_000,
                  ).toISOString(),
              }),

            now: NOW,
          });

        expect(
          result.canSubmit,
        ).toBe(false);
      },
    );
  },
);

describe(
  "Paper Execution Gateway — Duplicate Protection",
  () => {
    test(
      "blocks an already-submitted execution key",
      () => {
        const first =
          validatePaperExecution({
            finalDecision:
              decision(),

            now: NOW,
          });

        expect(
          first.canSubmit,
        ).toBe(true);

        const second =
          validatePaperExecution({
            finalDecision:
              decision(),

            now: NOW,

            previouslySubmittedKeys: [
              first.executionKey,
            ],
          });

        expect(
          second.canSubmit,
        ).toBe(false);

        expect(
          second.reasonCode,
        ).toBe(
          "DUPLICATE_EXECUTION",
        );
      },
    );
  },
);

describe(
  "Paper Execution Gateway — Paper Safety",
  () => {
    test(
      "blocks when paper-only protection is disabled",
      () => {
        const result =
          validatePaperExecution({
            finalDecision:
              decision(),

            now: NOW,

            config: {
              paperOnly: false,
            },
          });

        expect(
          result.canSubmit,
        ).toBe(false);

        expect(
          result.reasonCode,
        ).toBe(
          "PAPER_MODE_REQUIRED",
        );
      },
    );
  },
);

describe(
  "Paper Execution Gateway — Validation",
  () => {
    test(
      "missing final decision safely blocks",
      () => {
        const result =
          validatePaperExecution({
            now: NOW,
          });

        expect(
          result.canSubmit,
        ).toBe(false);
      },
    );

    test(
      "missing symbol safely blocks",
      () => {
        const result =
          validatePaperExecution({
            finalDecision:
              decision({
                symbol: null,
              }),

            now: NOW,
          });

        expect(
          result.canSubmit,
        ).toBe(false);
      },
    );

    test(
      "missing timestamp safely blocks",
      () => {
        const result =
          validatePaperExecution({
            finalDecision:
              decision({
                timestamp: null,
              }),

            now: NOW,
          });

        expect(
          result.canSubmit,
        ).toBe(false);
      },
    );
  },
);

describe(
  "Paper Execution Gateway — Configuration",
  () => {
    test(
      "default configuration is frozen",
      () => {
        expect(
          Object.isFrozen(
            DEFAULT_PAPER_EXECUTION_CONFIG,
          ),
        ).toBe(true);
      },
    );
  },
);

describe(
  "Paper Execution Gateway — Determinism",
  () => {
    test(
      "same inputs produce same execution intent",
      () => {
        const input =
          decision();

        const first =
          validatePaperExecution({
            finalDecision:
              input,

            now: NOW,
          });

        const second =
          validatePaperExecution({
            finalDecision:
              input,

            now: NOW,
          });

        expect(
          first,
        ).toEqual(
          second,
        );
      },
    );
  },
);