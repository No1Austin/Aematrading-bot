import fs from "fs";
import path from "path";

const file = path.resolve(
  "src/crypto/intelligence/cryptoGptIntelligenceProvider.js",
);

const source = fs.readFileSync(file, "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const hasNews = /news\s*:/.test(source);
const hasNarrative = /socialNarrative\s*:/.test(source);

assert(hasNews, "Missing news output.");
assert(hasNarrative, "Missing socialNarrative output.");

const hasCoverage =
  /coverage/.test(source) ||
  /evidenceCoverage/.test(source);

const hasConfidence =
  /confidence/.test(source);

const hasGeneratedAt =
  /generatedAt/.test(source);

const hasAvailable =
  /available/.test(source);

const hasEvidenceArray =
  /evidence/.test(source);

const hasSummary =
  /summary/.test(source);

console.log(
  JSON.stringify(
    {
      passed: true,
      phase: "6.45",

      provider: {
        newsPresent: hasNews,
        narrativePresent: hasNarrative,

        explicitCoverageContract: hasCoverage,
        confidenceContract: hasConfidence,
        generatedAtAuthority: hasGeneratedAt,
        availabilityContract: hasAvailable,
        evidenceArrayPresent: hasEvidenceArray,
        summaryPresent: hasSummary,
      },

      finding: {
        productionFixRequired: !hasCoverage,
        area: "GPT_SUPPORTING_COVERAGE_AUTHORITY",
        recommendedFix:
          hasCoverage
            ? "NO_PROVIDER_SCHEMA_CHANGE_REQUIRED"
            : "ADD_EXPLICIT_INTERNAL_COVERAGE_TO_GPT_NEWS_AND_SOCIAL_NARRATIVE_OUTPUTS",
      },

      executionAuthority: false,
      liveExecution: false,

      nextStage:
        hasCoverage
          ? "GPT_SUPPORTING_RUNTIME_CONTRACT_TEST"
          : "GPT_PROVIDER_SCHEMA_EXTENSION",
    },
    null,
    2,
  ),
);