// server/scripts/testAdanosLiveSocial.mjs

import "dotenv/config";

import getLiveSocialSentiment
  from "../src/services/liveSocialSentimentService.js";

const symbol =
  String(
    process.argv[2] ??
    "AAPL",
  )
    .trim()
    .toUpperCase();

if (
  !process.env
    .ADANOS_API_KEY
) {
  console.error(
    "ADANOS_API_KEY is missing from server/.env",
  );

  process.exit(1);
}

console.log(
  `\nRunning LIVE Adanos social analysis for ${symbol}...\n`,
);

const result =
  await getLiveSocialSentiment({
    symbol,

    /**
     * With the free plan this makes two API calls on a cache miss:
     * one Reddit + one X.
     */
    adanosConfig: {
      includeReddit: true,
      includeX: true,
      cacheTtlMs:
        5 * 60 * 1000,
    },
  });

console.dir(
  result,
  {
    depth: null,
  },
);

console.log(
  "\nSUMMARY",
);

console.log({
  approved:
    result.approved,

  status:
    result.status,

  symbol:
    result.symbol,

  direction:
    result.social
      ?.direction ??
    null,

  confidence:
    result.social
      ?.confidence ??
    null,

  rawScore:
    result.social
      ?.rawScore ??
    null,

  crowdState:
    result.social
      ?.crowdState ??
    null,

  platformCount:
    result.social
      ?.platformCount ??
    0,

  cached:
    result.sourceResult
      ?.cached ??
    false,
});
