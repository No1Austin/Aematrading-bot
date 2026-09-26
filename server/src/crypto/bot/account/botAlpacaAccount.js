
import getAlpacaPaperAccountData from
  "../../../data/providers/alpacaPaperAccountProvider.js";

/**
 * Read-only Alpaca paper account adapter.
 * Does not submit orders or modify the existing ledger.
 */
export async function getBotAlpacaAccount() {
  const result = await getAlpacaPaperAccountData();

  if (!result.approved || !result.data) {
    throw new Error(
      `ALPACA_PAPER_UNAVAILABLE: ${
        result.errors?.join("; ") || result.status
      }`
    );
  }

  const account = result.data;

  return {
    provider: "ALPACA_PAPER",
    paperOnly: true,
    liveExecution: false,

    account: {
      status: account.status,
      cashUsd: account.balance,
      equityUsd: account.equity,
      buyingPowerUsd: account.buyingPower,
      dailyPnlUsd: account.dailyPnL,
      tradingBlocked: account.tradingBlocked,
      accountBlocked: account.accountBlocked
    },

    positions: account.openPositions,
    positionCount: account.positionCount,

    // Alpaca returns the entire paper account,
    // including any stock positions.
    accountScope: "SHARED_ALPACA_PAPER_ACCOUNT",

    fetchedAt: result.fetchedAt
  };
}

export default getBotAlpacaAccount;
