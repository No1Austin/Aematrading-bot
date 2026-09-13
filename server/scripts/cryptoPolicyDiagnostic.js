/**
 * ============================================================
 * AEMA CRYPTO POLICY DIAGNOSTIC — PHASE 2.4
 * ============================================================
 */

import {
  runCryptoDiscoveryCycle,
} from "../src/crypto/scanner/cryptoDiscoveryCycle.js";

import {
  evaluateCryptoBotSubmission,
} from "../src/crypto/policy/cryptoCandidateActionPolicy.js";

function divider(
  title,
) {
  console.log(
    "\n============================================================",
  );

  console.log(
    title,
  );

  console.log(
    "============================================================\n",
  );
}

const result =
  await runCryptoDiscoveryCycle({
    refreshUniverse:
      true,

    maximumUniverseAssets:
      750,

    maximumCandidates:
      20,

    includeDexDiscovery:
      true,
  });

divider(
  "AEMA CRYPTO POLICY DIAGNOSTIC",
);

console.dir(
  {
    approved:
      result?.approved,

    status:
      result?.status,

    qualifiedUniverse:
      result
        ?.scanner
        ?.qualified ??
      0,

    highInterest:
      result
        ?.scanner
        ?.highInterest ??
      0,

    selected:
      result
        ?.scanner
        ?.selected ??
      0,

    cexSelected:
      result
        ?.scanner
        ?.cexSelected ??
      0,

    emergingSelected:
      result
        ?.scanner
        ?.emergingSelected ??
      0,

    deepResearchEligible:
      result
        ?.scanner
        ?.deepResearchEligible ??
      0,

    botEligibleNow:
      result
        ?.scanner
        ?.botEligibleNow ??
      0,

    registry:
      result
        ?.registry
        ?.stats ??
      {},
  },
  {
    depth:
      null,
  },
);

divider(
  "CEX CANDIDATES",
);

console.table(
  (
    result
      ?.cexCandidates ??
    []
  ).map(
    (
      candidate,
      index,
    ) => ({
      rank:
        index + 1,

      symbol:
        candidate?.symbol,

      qualified:
        candidate?.qualified,

      highInterest:
        candidate?.highInterest,

      score:
        candidate?.scannerScore,

      type:
        candidate?.candidateType,

      policy:
        candidate?.actionPolicy,

      deepResearch:
        candidate
          ?.deepResearchEligible,

      botEligibleNow:
        candidate?.botEligible,

      execution:
        candidate
          ?.executionEligible,
    }),
  ),
);

divider(
  "EMERGING RESEARCH-ONLY CANDIDATES",
);

console.table(
  (
    result
      ?.emergingCandidates ??
    []
  ).map(
    (
      candidate,
      index,
    ) => ({
      rank:
        index + 1,

      symbol:
        candidate?.symbol,

      qualified:
        candidate?.qualified,

      highInterest:
        candidate?.highInterest,

      score:
        candidate?.scannerScore,

      type:
        candidate?.candidateType,

      policy:
        candidate?.actionPolicy,

      deepResearch:
        candidate
          ?.deepResearchEligible,

      botEligible:
        candidate?.botEligible,

      execution:
        candidate
          ?.executionEligible,

      reason:
        candidate?.policyReason,
    }),
  ),
);

divider(
  "BOT GATE SIMULATION",
);

const cex =
  result
    ?.cexCandidates
    ?.[0] ??
  null;

const emerging =
  result
    ?.emergingCandidates
    ?.[0] ??
  null;

if (cex) {
  console.log(
    "CEX before deep research:",
    evaluateCryptoBotSubmission({
      candidate:
        cex,

      deepResearchApproved:
        false,
    }),
  );

  console.log(
    "CEX after deep research approval:",
    evaluateCryptoBotSubmission({
      candidate:
        cex,

      deepResearchApproved:
        true,
    }),
  );
}

if (emerging) {
  console.log(
    "Emerging after deep research approval:",
    evaluateCryptoBotSubmission({
      candidate:
        emerging,

      deepResearchApproved:
        true,
    }),
  );
}

divider(
  "EXPECTED",
);

console.log(
  "Selected qualified CEX => deep research eligible.",
);

console.log(
  "CEX + deep research approved => bot gate allowed.",
);

console.log(
  "Emerging + deep research approved => bot gate still blocked.",
);
