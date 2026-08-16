import "dotenv/config";

import getAlpacaPaperAccountData from "./alpacaPaperAccountProvider.js";

async function run() {
  console.log(
    "\n====================================",
  );

  console.log(
    "REAL ALPACA PAPER ACCOUNT TEST",
  );

  console.log(
    "====================================\n",
  );

  const result =
    await getAlpacaPaperAccountData();

  if (
    result.approved !== true ||
    !result.data
  ) {
    console.error(
      "ALPACA PAPER ACCOUNT PROVIDER FAILED:",
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
    "Status:",
    result.status,
  );

  console.log(
    "\nACCOUNT DATA\n",
  );

  console.dir(
    result.data,
    {
      depth: null,
    },
  );

  /**
   * Basic fail-safe checks.
   */

  if (
    !Number.isFinite(
      Number(
        result.data.equity,
      ),
    )
  ) {
    throw new Error(
      "Equity is invalid.",
    );
  }

  if (
    !Number.isFinite(
      Number(
        result.data.buyingPower,
      ),
    )
  ) {
    throw new Error(
      "Buying power is invalid.",
    );
  }

  if (
    !Array.isArray(
      result.data.openPositions,
    )
  ) {
    throw new Error(
      "openPositions must be an array.",
    );
  }

  console.log(
    "\n====================================",
  );

  console.log(
    "SUCCESS — REAL ALPACA PAPER ACCOUNT RECEIVED",
  );

  console.log(
    "====================================",
  );

  console.log(
    "Equity:",
    result.data.equity,
  );

  console.log(
    "Buying power:",
    result.data.buyingPower,
  );

  console.log(
    "Daily P&L:",
    result.data.dailyPnL,
  );

  console.log(
    "Positions:",
    result.data.positionCount,
  );

  console.log(
    "Trading blocked:",
    result.data.tradingBlocked
      ? "YES"
      : "NO",
  );

  console.log(
    "Shorting enabled:",
    result.data.shortingEnabled
      ? "YES"
      : "NO",
  );

  console.log(
    "====================================\n",
  );
}

run().catch(
  (error) => {
    console.error(
      "\n====================================",
    );

    console.error(
      "ALPACA PAPER ACCOUNT TEST FAILED",
    );

    console.error(
      "====================================\n",
    );

    console.error(
      error instanceof Error
        ? error.stack ??
          error.message
        : String(error),
    );

    process.exitCode = 1;
  },
);