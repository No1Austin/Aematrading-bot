import {
  finite,
  clamp,
  complete,
  insufficient,
} from "./cryptoEngineUtils.js";

export default async function run(c) {
  const m = c?.measurements ?? {};
  const d =
    c?.preferredDirection ?? "LONG";

  const v =
    finite(m?.volume24hUsd);
  const l =
    finite(m?.liquidityUsd);
  const n =
    finite(
      c?.venues?.venueCount ??
        m?.venueCount,
    );
  const cex =
    finite(
      c?.venues?.cexCount ??
        m?.cexCount,
    );

  if (!v && !l) {
    return insufficient(
      "CRYPTO_LIQUIDITY",
    );
  }

  const vs =
    clamp(
      (Math.log10(v + 1) / 8) * 100,
    );

  const ls =
    l
      ? clamp(
          (Math.log10(l + 1) / 8) *
            100,
        )
      : vs * 0.65;

  const venues =
    clamp(
      n * 12 + cex * 6,
    );

  const score =
    vs * 0.45 +
    ls * 0.35 +
    venues * 0.2;

  /*
   * Confidence is based on independent liquidity evidence
   * availability. It does not increase merely because the
   * liquidity score itself is high.
   */
  let confidence = 35;

  if (v > 0) confidence += 25;
  if (l > 0) confidence += 20;
  if (n > 0) confidence += 10;
  if (cex > 0) confidence += 10;

  return complete(
    "CRYPTO_LIQUIDITY",
    score,
    d,
    {
      volume24hUsd: v,
      liquidityUsd: l,
      venueCount: n,
      cexCount: cex,
    },
    clamp(confidence),
  );
}
