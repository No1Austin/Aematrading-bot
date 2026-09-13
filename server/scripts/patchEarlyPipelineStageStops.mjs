import fs from "node:fs";

const targets = [
  {
    file:
      "src/tests/portfolioRiskPipeline.integration.test.js",
    stage: "PORTFOLIO_RISK",
  },
  {
    file:
      "src/tests/correlationExposurePipeline.integration.test.js",
    stage: "CORRELATION_EXPOSURE",
  },
  {
    file:
      "src/tests/volatilityRiskPipeline.integration.test.js",
    stage: "VOLATILITY_RISK",
  },
];

function findMatchingParen(source, openIndex) {
  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let i = openIndex; i < source.length; i += 1) {
    const char = source[i];

    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === quote) {
        quote = null;
      }

      continue;
    }

    if (
      char === '"' ||
      char === "'" ||
      char === "`"
    ) {
      quote = char;
      continue;
    }

    if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;

      if (depth === 0) {
        return i;
      }
    }
  }

  return -1;
}

for (const target of targets) {
  let source =
    fs.readFileSync(
      target.file,
      "utf8",
    );

  const marker =
    "runTradingAnalysis(";

  let searchFrom = 0;
  let patched = 0;

  while (true) {
    const callIndex =
      source.indexOf(
        marker,
        searchFrom,
      );

    if (callIndex === -1) {
      break;
    }

    const openIndex =
      callIndex +
      marker.length -
      1;

    const closeIndex =
      findMatchingParen(
        source,
        openIndex,
      );

    if (closeIndex === -1) {
      throw new Error(
        `Could not parse ${target.file}`,
      );
    }

    const argument =
      source
        .slice(
          openIndex + 1,
          closeIndex,
        )
        .trim();

    // Ignore anything already patched.
    if (
      argument.includes(
        "stopAfter:",
      )
    ) {
      searchFrom =
        closeIndex + 1;
      continue;
    }

    // Only patch the integration-test
    // analysisInput(...) calls.
    if (
      !argument.startsWith(
        "analysisInput(",
      )
    ) {
      searchFrom =
        closeIndex + 1;
      continue;
    }

    const replacement =
      `runTradingAnalysis({\n` +
      `  ...${argument},\n` +
      `  stopAfter: "${target.stage}",\n` +
      `})`;

    source =
      source.slice(
        0,
        callIndex,
      ) +
      replacement +
      source.slice(
        closeIndex + 1,
      );

    searchFrom =
      callIndex +
      replacement.length;

    patched += 1;
  }

  fs.writeFileSync(
    target.file,
    source,
  );

  console.log(
    `${target.file}: patched ${patched}`,
  );
}