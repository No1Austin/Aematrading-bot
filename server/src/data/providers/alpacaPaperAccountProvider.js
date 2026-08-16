import axios from "axios";

const ALPACA_PAPER_BASE_URL =
  "https://paper-api.alpaca.markets";

function getHeaders() {
  const apiKey =
    process.env.ALPACA_API_KEY;

  const secretKey =
    process.env.ALPACA_SECRET_KEY;

  if (
    !apiKey ||
    !secretKey
  ) {
    throw new Error(
      "Alpaca paper credentials are missing.",
    );
  }

  return {
    "APCA-API-KEY-ID":
      apiKey,

    "APCA-API-SECRET-KEY":
      secretKey,

    Accept:
      "application/json",
  };
}

function safeNumber(
  value,
  fallback = 0,
) {
  const number =
    Number(value);

  return Number.isFinite(
    number,
  )
    ? number
    : fallback;
}

export async function getAlpacaPaperAccountData() {
  try {
    const headers =
      getHeaders();

    const [
      accountResponse,
      positionsResponse,
    ] =
      await Promise.all([
        axios.get(
          `${ALPACA_PAPER_BASE_URL}/v2/account`,
          {
            timeout:
              15_000,

            headers,
          },
        ),

        axios.get(
          `${ALPACA_PAPER_BASE_URL}/v2/positions`,
          {
            timeout:
              15_000,

            headers,
          },
        ),
      ]);

    const account =
      accountResponse.data ??
      {};

    const rawPositions =
      Array.isArray(
        positionsResponse.data,
      )
        ? positionsResponse.data
        : [];

    const openPositions =
      rawPositions.map(
        (position) => ({
          symbol:
            position.symbol ??
            null,

          side:
            String(
              position.side ??
              "",
            ).toUpperCase(),

          quantity:
            safeNumber(
              position.qty,
            ),

          marketValue:
            safeNumber(
              position.market_value,
            ),

          costBasis:
            safeNumber(
              position.cost_basis,
            ),

          unrealizedPnL:
            safeNumber(
              position.unrealized_pl,
            ),

          unrealizedPnLPercent:
            safeNumber(
              position.unrealized_plpc,
            ),

          currentPrice:
            safeNumber(
              position.current_price,
            ),

          averageEntryPrice:
            safeNumber(
              position.avg_entry_price,
            ),
        }),
      );

    const equity =
      safeNumber(
        account.equity,
      );

    const lastEquity =
      safeNumber(
        account.last_equity,
        equity,
      );

    const dailyPnL =
      equity -
      lastEquity;

    const portfolioExposure =
      openPositions.reduce(
        (
          total,
          position,
        ) =>
          total +
          Math.abs(
            position.marketValue,
          ),
        0,
      );

    return {
      approved: true,

      provider:
        "ALPACA_PAPER",

      status:
        "READY",

      data: {
        accountId:
          account.id ??
          null,

        accountNumber:
          account.account_number ??
          null,

        status:
          account.status ??
          null,

        balance:
          safeNumber(
            account.cash,
          ),

        equity,

        buyingPower:
          safeNumber(
            account.buying_power,
          ),

        regTBuyingPower:
          safeNumber(
            account.regt_buying_power,
          ),

        dayTradingBuyingPower:
          safeNumber(
            account.daytrading_buying_power,
          ),

        lastEquity,

        dailyPnL,

        /**
         * Keep your existing configured risk rule.
         */
        riskPercent:
          0.005,

        /**
         * Keep the current daily-loss limit for now.
         * Later we can make this percentage-based.
         */
        dailyLossLimit:
          200,

        openPositions,

        portfolioExposure,

        positionCount:
          openPositions.length,

        patternDayTrader:
          Boolean(
            account.pattern_day_trader,
          ),

        tradingBlocked:
          Boolean(
            account.trading_blocked,
          ),

        accountBlocked:
          Boolean(
            account.account_blocked,
          ),

        shortingEnabled:
          Boolean(
            account.shorting_enabled,
          ),
      },

      warnings: [],

      errors: [],

      fetchedAt:
        new Date()
          .toISOString(),
    };
  } catch (error) {
    return {
      approved: false,

      provider:
        "ALPACA_PAPER",

      status:
        "ERROR",

      data: null,

      warnings: [
        "Real Alpaca PAPER account data is unavailable.",
      ],

      errors: [
        error instanceof Error
          ? error.message
          : String(error),
      ],

      fetchedAt:
        new Date()
          .toISOString(),
    };
  }
}

export default getAlpacaPaperAccountData;