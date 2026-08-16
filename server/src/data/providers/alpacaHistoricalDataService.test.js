import "dotenv/config";

import {
  getHistoricalBars,
  ALPACA_TIMEFRAME,
  ALPACA_FEED,
} from "./alpacaHistoricalDataService.js";

async function run() {
  console.log(
    "\n====================================",
  );

  console.log(
    "ALPACA REAL HISTORICAL DATA TEST",
  );

  console.log(
    "====================================\n",
  );

  const result =
    await getHistoricalBars({
      symbol: "AAPL",

      timeframe:
        ALPACA_TIMEFRAME
          .FIVE_MINUTES,

      start:
        "2026-08-03T13:30:00Z",

      end:
        "2026-08-03T20:00:00Z",

      feed:
        ALPACA_FEED.IEX,
    });

  if (
    result.approved !== true
  ) {
    console.error(
      "\nFAILED\n",
      result,
    );

    process.exitCode = 1;

    return;
  }

  console.log(
    "Provider:",
    result.provider,
  );

  console.log(
    "Symbol:",
    result.symbol,
  );

  console.log(
    "Timeframe:",
    result.timeframe,
  );

  console.log(
    "Feed:",
    result.feed,
  );

  console.log(
    "Bars:",
    result.barCount,
  );

  if (
    result.barCount > 0
  ) {
    console.log(
      "\nFIRST BAR\n",
      result.bars[0],
    );

    console.log(
      "\nLAST BAR\n",
      result.bars[
        result.bars.length -
          1
      ],
    );
  }

  console.log(
    "\nSUCCESS — REAL HISTORICAL DATA RECEIVED\n",
  );
}

run().catch(
  (error) => {
    console.error(
      "\nUNHANDLED TEST ERROR\n",
      error,
    );

    process.exitCode = 1;
  },
);