/**
 * ============================================================
 * AEMA SCANNER RESULT INSPECTOR
 * ============================================================
 *
 * Run from:
 *
 *   server/
 *
 * with:
 *
 *   node scripts/inspectScannerResult.js
 *
 * This does NOT start a new scan.
 * It only prints the current scanner state / last completed result.
 */

import continuousMarketScanner from
  "../src/scanner/continuousMarketScanner.js";


function safeArray(
  value,
) {
  return Array.isArray(
    value,
  )
    ? value
    : [];
}


function printDivider(
  title,
) {
  console.log(
    "\n==============================================",
  );

  console.log(
    title,
  );

  console.log(
    "==============================================\n",
  );
}


async function inspectScannerResult() {
  try {
    printDivider(
      "AEMA SCANNER STATE",
    );

    const state =
      continuousMarketScanner
        .getState();

    console.dir(
      {
        status:
          state?.status,

        cycleCount:
          state?.cycleCount,

        startedAt:
          state?.startedAt,

        lastCycleStartedAt:
          state
            ?.lastCycleStartedAt,

        lastCycleCompletedAt:
          state
            ?.lastCycleCompletedAt,

        nextCycleAt:
          state
            ?.nextCycleAt,

        skippedCycles:
          state
            ?.skippedCycles,

        lastError:
          state
            ?.lastError,
      },
      {
        depth: null,
      },
    );


    printDivider(
      "LAST DISCOVERY RESULT",
    );

    const result =
      state
        ?.lastResult ??
      null;

    if (!result) {
      console.log(
        "❌ No completed scanner result is currently stored.",
      );

      return;
    }

    console.dir(
      {
        status:
          result?.status,

        approved:
          result?.approved,

        universe:
          result
            ?.universe
            ?.assetCount ??
          0,

        warmed:
          result
            ?.marketData
            ?.warmed ??
          0,

        measured:
          result
            ?.measurements
            ?.built ??
          result
            ?.marketData
            ?.measured ??
          0,

        researchable:
          result
            ?.scanner
            ?.researchable ??
          result
            ?.marketData
            ?.researchable ??
          0,

        qualified:
          result
            ?.scanner
            ?.qualified ??
          result
            ?.marketData
            ?.qualified ??
          0,

        scannerCandidates:
          safeArray(
            result
              ?.scannerCandidates,
          ).length,

        selectedCandidates:
          safeArray(
            result
              ?.selectedCandidates,
          ).length,

        registryCandidates:
          safeArray(
            result
              ?.candidates,
          ).length,

        errors:
          safeArray(
            result?.errors,
          ).length,

        warnings:
          safeArray(
            result?.warnings,
          ).length,
      },
      {
        depth: null,
      },
    );


    printDivider(
      "SELECTED MARKET RESEARCH CANDIDATES",
    );

    const selected =
      safeArray(
        result
          ?.selectedCandidates,
      );

    if (
      selected.length ===
      0
    ) {
      console.log(
        "❌ No selectedCandidates found.",
      );
    } else {
      console.table(
        selected.map(
          (
            candidate,
            index,
          ) => ({
            rank:
              index + 1,

            symbol:
              candidate
                ?.symbol,

            score:
              candidate
                ?.scannerScore,

            eligible:
              candidate
                ?.eligible,

            qualified:
              candidate
                ?.qualified,

            direction:
              candidate
                ?.preferredDirection,

            directionEdge:
              candidate
                ?.directionEdge,

            status:
              candidate
                ?.discoveryStatus ??
              candidate
                ?.status,

            reason:
              safeArray(
                candidate
                  ?.reasons,
              )
                .slice(
                  0,
                  2,
                )
                .join(
                  " | ",
                ),
          }),
        ),
      );
    }


    printDivider(
      "FULL SCANNER CANDIDATE LIST",
    );

    const scannerCandidates =
      safeArray(
        result
          ?.scannerCandidates,
      );

    if (
      scannerCandidates.length ===
      0
    ) {
      console.log(
        "❌ No scannerCandidates found.",
      );
    } else {
      console.table(
        scannerCandidates
          .slice(
            0,
            20,
          )
          .map(
            (
              candidate,
              index,
            ) => ({
              rank:
                index + 1,

              symbol:
                candidate
                  ?.symbol,

              score:
                candidate
                  ?.scannerScore,

              eligible:
                candidate
                  ?.eligible,

              qualified:
                candidate
                  ?.qualified,

              direction:
                candidate
                  ?.preferredDirection,

              edge:
                candidate
                  ?.directionEdge,
            }),
          ),
      );
    }


    printDivider(
      "ERRORS",
    );

    const errors =
      safeArray(
        result?.errors,
      );

    if (
      errors.length ===
      0
    ) {
      console.log(
        "✅ No scanner errors.",
      );
    } else {
      console.dir(
        errors.slice(
          0,
          50,
        ),
        {
          depth: null,
        },
      );
    }


    printDivider(
      "WARNINGS",
    );

    const warnings =
      safeArray(
        result?.warnings,
      );

    if (
      warnings.length ===
      0
    ) {
      console.log(
        "✅ No scanner warnings.",
      );
    } else {
      console.dir(
        warnings.slice(
          0,
          50,
        ),
        {
          depth: null,
        },
      );
    }


    printDivider(
      "INSPECTION COMPLETE",
    );

  } catch (error) {
    console.error(
      "\n❌ INSPECTION FAILED",
      error,
    );

    process.exitCode = 1;
  }
}


await inspectScannerResult();