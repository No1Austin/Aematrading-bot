#!/usr/bin/env bash

# ============================================================
# AEMA STOCK SYSTEM — FULL DIAGNOSTIC
# ============================================================
#
# READ ONLY.
# This script does NOT modify application source files.
#
# Run from:
#   trading-bot/
#
# Output:
#   stock-system-diagnostic.txt
# ============================================================

set +e

ROOT="$(pwd)"
SERVER="$ROOT/server"
CLIENT="$ROOT/client"
REPORT="$ROOT/stock-system-diagnostic.txt"

PASS=0
FAIL=0
WARN=0

: > "$REPORT"

section() {
  echo
  echo "============================================================"
  echo "$1"
  echo "============================================================"
}

pass() {
  echo "✅ PASS: $1"
  PASS=$((PASS + 1))
}

fail() {
  echo "❌ FAIL: $1"
  FAIL=$((FAIL + 1))
}

warn() {
  echo "⚠️  WARN: $1"
  WARN=$((WARN + 1))
}

run() {
  echo
  echo "\$ $*"
  "$@" 2>&1
}

{
section "AEMA STOCK SYSTEM — FULL DIAGNOSTIC"

echo "Started: $(date)"
echo "Root: $ROOT"
echo "Node: $(node -v 2>/dev/null)"
echo "NPM: $(npm -v 2>/dev/null)"

# ============================================================
# 1. DIRECTORY STRUCTURE
# ============================================================

section "1. PROJECT STRUCTURE"

if [ -d "$SERVER/src" ]; then
  pass "server/src exists"
else
  fail "server/src missing"
fi

if [ -d "$CLIENT/src" ]; then
  pass "client/src exists"
else
  fail "client/src missing"
fi

echo
echo "Server JS files:"
find "$SERVER/src" -type f \
  \( -name "*.js" -o -name "*.mjs" -o -name "*.cjs" \) \
  | wc -l

echo "Server JSX files:"
find "$SERVER/src" -type f -name "*.jsx" | wc -l

echo "Client JSX files:"
find "$CLIENT/src" -type f -name "*.jsx" | wc -l


# ============================================================
# 2. BACKEND JSX WARNING
# ============================================================

section "2. BACKEND FILE EXTENSIONS"

BACKEND_JSX="$(
  find "$SERVER/src" \
    -type f \
    -name "*.jsx"
)"

if [ -z "$BACKEND_JSX" ]; then
  pass "No .jsx production files found in server/src"
else
  warn "Backend .jsx files detected"

  echo "$BACKEND_JSX"
  echo
  echo "NOTE:"
  echo "nodemon previously watched js,mjs,cjs,json only."
  echo "Backend JSX changes may therefore not trigger restarts."
fi


# ============================================================
# 3. BACKEND SYNTAX
# ============================================================

section "3. BACKEND JAVASCRIPT SYNTAX"

SYNTAX_FAILURES=0

while IFS= read -r file; do
  if ! node --check "$file" >/tmp/aema-node-check.txt 2>&1; then
    echo
    echo "SYNTAX ERROR:"
    echo "$file"
    cat /tmp/aema-node-check.txt
    SYNTAX_FAILURES=$((SYNTAX_FAILURES + 1))
  fi
done < <(
  find "$SERVER/src" \
    -type f \
    \( -name "*.js" -o -name "*.mjs" -o -name "*.cjs" \) \
    ! -path "*/node_modules/*" \
    ! -path "*/dist/*"
)

if [ "$SYNTAX_FAILURES" -eq 0 ]; then
  pass "All backend JS files passed node --check"
else
  fail "$SYNTAX_FAILURES backend file(s) contain syntax errors"
fi


# ============================================================
# 4. BROKEN LOCAL IMPORTS
# ============================================================

section "4. BROKEN RELATIVE IMPORTS"

cd "$SERVER" || exit 1

node --input-type=module <<'NODE'
import fs from "fs";
import path from "path";

const root = path.resolve("src");

const extensions = [
  "",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
];

function walk(dir) {
  return fs.readdirSync(dir, {
    withFileTypes: true,
  }).flatMap(entry => {
    const full =
      path.join(dir, entry.name);

    if (
      entry.name === "node_modules" ||
      entry.name === "dist"
    ) {
      return [];
    }

    return entry.isDirectory()
      ? walk(full)
      : [full];
  });
}

const files =
  walk(root).filter(file =>
    /\.(js|jsx|mjs|cjs)$/.test(file)
  );

const broken = [];

const importPattern =
  /(?:import\s+(?:[\s\S]*?\s+from\s+)?|export\s+[\s\S]*?\s+from\s+|import\s*\()\s*["'](\.[^"']+)["']/g;

for (const file of files) {
  const source =
    fs.readFileSync(file, "utf8");

  let match;

  while (
    (match = importPattern.exec(source))
  ) {
    const spec = match[1];

    const base =
      path.resolve(
        path.dirname(file),
        spec,
      );

    let found = false;

    for (const ext of extensions) {
      const candidate =
        `${base}${ext}`;

      if (
        fs.existsSync(candidate) &&
        fs.statSync(candidate).isFile()
      ) {
        found = true;
        break;
      }
    }

    if (!found) {
      const indexCandidates = [
        "index.js",
        "index.jsx",
        "index.mjs",
      ];

      for (
        const name
        of indexCandidates
      ) {
        const candidate =
          path.join(base, name);

        if (fs.existsSync(candidate)) {
          found = true;
          break;
        }
      }
    }

    if (!found) {
      broken.push({
        file:
          path.relative(
            process.cwd(),
            file,
          ),
        import: spec,
      });
    }
  }
}

if (!broken.length) {
  console.log(
    "PASS: No obviously broken relative imports found."
  );
  process.exit(0);
}

console.log(
  `FAIL: ${broken.length} broken relative import(s):`
);

for (const item of broken) {
  console.log(
    `${item.file}  ->  ${item.import}`
  );
}

process.exitCode = 2;
NODE

if [ "$?" -eq 0 ]; then
  pass "Relative import scan passed"
else
  fail "Broken relative import(s) detected"
fi


# ============================================================
# 5. DUPLICATE / CONFLICTING ENGINE FILES
# ============================================================

section "5. DUPLICATE / PARALLEL ENGINE IMPLEMENTATIONS"

echo "Institutional position engines:"
find src \
  -type f \
  -iname "*institutional*position*engine*" \
  | sort

echo
echo "Scoring engines:"
find src \
  -type f \
  -iname "*scoring*engine*" \
  | sort

echo
echo "Liquidity engines:"
find src \
  -type f \
  -iname "*liquidity*engine*" \
  | sort

echo
echo "Potential duplicated basename files:"

find src \
  -type f \
  \( -name "*.js" -o -name "*.jsx" \) \
  -exec basename {} \; \
  | sort \
  | uniq -d


# ============================================================
# 6. INSTITUTIONAL PIPELINE
# ============================================================

section "6. INSTITUTIONAL PIPELINE"

echo "--- getInstitutionalEvidence references ---"

grep -Rni \
  --exclude-dir=node_modules \
  --exclude-dir=dist \
  "getInstitutionalEvidence" \
  src \
  || true

echo
echo "--- Institutional service exports ---"

grep -n \
  -E 'export .*getInstitutional|export default|createInstitutionalEvidenceService' \
  src/services/institutionalEvidenceService.js \
  2>/dev/null \
  || true

echo
echo "--- Configured institutional bootstrap ---"

if [
  -f \
  src/services/institutionalEvidenceBootstrap.js
]; then
  sed -n '1,180p' \
    src/services/institutionalEvidenceBootstrap.js
else
  warn "institutionalEvidenceBootstrap.js missing"
fi

echo
echo "--- Suspicious configured-service aliases ---"

grep -Rni \
  --exclude-dir=node_modules \
  --exclude-dir=dist \
  -E 'configuredInstitutionalEvidenceService.*getInstitutionalEvidence|as getInstitutionalEvidence' \
  src \
  || true


# ============================================================
# 7. SECURITY RESOLVER / CUSIP
# ============================================================

section "7. INSTITUTIONAL SECURITY RESOLUTION"

grep -Rni \
  --exclude-dir=node_modules \
  --exclude-dir=dist \
  -E 'securityResolver|VERIFIED_CUSIP|lookupSecurityIdentity|institutionalManagers' \
  src/services \
  src/data/reference \
  2>/dev/null \
  | head -250


# ============================================================
# 8. MARKET DATA / VOLUME PIPELINE
# ============================================================

section "8. MARKET DATA + VOLUME PIPELINE"

echo "--- Current / Average / Relative volume references ---"

grep -Rni \
  --exclude-dir=node_modules \
  --exclude-dir=dist \
  -E 'currentVolume|averageVolume|relativeVolume|dollarVolume' \
  src/services/stockAnalysisRunner.js \
  src/data/marketDataHub.js \
  src/scanner/marketMeasurementProvider.js \
  src/analysis/liquidityExecutionEngine.js \
  2>/dev/null \
  | head -350

echo
echo "--- Live bar ingestion ---"

grep -Rni \
  --exclude-dir=node_modules \
  --exclude-dir=dist \
  -E 'LIVE BAR|bar\.volume|bar\.v|volume:' \
  src/data/providers/alpacaLiveMarketStream.js \
  src/data/marketDataHub.js \
  2>/dev/null \
  | head -250


# ============================================================
# 9. SCANNER ARCHITECTURE
# ============================================================

section "9. SCANNER ARCHITECTURE"

echo "--- Continuous scanner auto-start ---"

grep -Rni \
  --exclude-dir=node_modules \
  --exclude-dir=dist \
  -E 'AEMA_SCANNER_AUTO_START|shouldAutoStartScanner|\.start\(\)' \
  src/scanner/continuousMarketScanner.js \
  src/app.js \
  src/routes/scannerRoutes.js \
  2>/dev/null \
  | head -250

echo
echo "--- Discovery flow ---"

grep -Rni \
  --exclude-dir=node_modules \
  --exclude-dir=dist \
  -E 'getMarketUniverse|warmAlpacaUniverseBatch|scanUniverseMarket|marketMeasurementProvider|maximumCandidates' \
  src/scanner \
  | head -350


# ============================================================
# 10. ENVIRONMENT VARIABLE PRESENCE
# ============================================================

section "10. ENVIRONMENT CONFIGURATION"

node --input-type=module <<'NODE'
import "dotenv/config";

const required = [
  "APCA_API_KEY_ID",
  "APCA_API_SECRET_KEY",
];

const optional = [
  "ALPACA_TRADING_BASE_URL",
  "AEMA_SCANNER_AUTO_START",
  "SEC_CONTACT_EMAIL",
  "FINRA_CLIENT_ID",
  "FINRA_CLIENT_SECRET",
];

for (const key of required) {
  console.log(
    `${process.env[key]
      ? "OK"
      : "MISSING"} REQUIRED ${key}`
  );
}

for (const key of optional) {
  console.log(
    `${process.env[key]
      ? "SET"
      : "NOT SET"} OPTIONAL ${key}`
  );
}

/*
 * Deliberately do NOT print secrets.
 */
NODE


# ============================================================
# 11. PORT / BACKEND PROCESS
# ============================================================

section "11. BACKEND PROCESS"

if lsof -iTCP:8000 -sTCP:LISTEN >/dev/null 2>&1; then
  pass "Port 8000 is listening"

  lsof -iTCP:8000 -sTCP:LISTEN
else
  fail "Nothing is listening on port 8000"
fi


# ============================================================
# 12. LIVE API HEALTH
# ============================================================

section "12. API HEALTH"

probe() {
  NAME="$1"
  METHOD="$2"
  URL="$3"
  DATA="$4"

  echo
  echo "----- $NAME -----"

  TMP="/tmp/aema_probe_$$.txt"

  if [ "$METHOD" = "POST" ]; then
    HTTP="$(
      curl \
        -sS \
        --max-time 15 \
        -o "$TMP" \
        -w "%{http_code}" \
        -X POST \
        -H "Content-Type: application/json" \
        -d "$DATA" \
        "$URL" \
        2>/tmp/aema_curl_error.txt
    )"
  else
    HTTP="$(
      curl \
        -sS \
        --max-time 15 \
        -o "$TMP" \
        -w "%{http_code}" \
        "$URL" \
        2>/tmp/aema_curl_error.txt
    )"
  fi

  CURL_STATUS=$?

  if [ "$CURL_STATUS" -ne 0 ]; then
    echo "CURL ERROR:"
    cat /tmp/aema_curl_error.txt
    fail "$NAME request failed"
    return
  fi

  echo "HTTP $HTTP"

  if [ -s "$TMP" ]; then
    python3 -m json.tool \
      "$TMP" 2>/dev/null \
      || cat "$TMP"
  else
    echo "<EMPTY RESPONSE>"
  fi

  case "$HTTP" in
    2*)
      pass "$NAME returned HTTP $HTTP"
      ;;
    4*)
      warn "$NAME returned HTTP $HTTP"
      ;;
    5*)
      fail "$NAME returned HTTP $HTTP"
      ;;
    *)
      warn "$NAME returned HTTP $HTTP"
      ;;
  esac
}

if lsof -iTCP:8000 -sTCP:LISTEN >/dev/null 2>&1; then

  probe \
    "Markets status" \
    "GET" \
    "http://localhost:8000/api/markets/status"

  probe \
    "Scanner status" \
    "GET" \
    "http://localhost:8000/api/scanner/status"

  probe \
    "Scanner snapshot" \
    "GET" \
    "http://localhost:8000/api/scanner/snapshot?limit=20"

  probe \
    "Markets overview" \
    "GET" \
    "http://localhost:8000/api/markets/overview?limit=10"

  probe \
    "Markets news" \
    "GET" \
    "http://localhost:8000/api/markets/news?limit=5"

else
  warn "Skipping live API probes because port 8000 is closed"
fi


# ============================================================
# 13. SCANNER STATUS INTERPRETATION
# ============================================================

section "13. SCANNER STATE"

if lsof -iTCP:8000 -sTCP:LISTEN >/dev/null 2>&1; then

  SCANNER_JSON="$(
    curl -sS \
      --max-time 10 \
      http://localhost:8000/api/scanner/status
  )"

  echo "$SCANNER_JSON" \
    | python3 -m json.tool \
    2>/dev/null \
    || echo "$SCANNER_JSON"

  echo
  echo "$SCANNER_JSON" |
    node --input-type=module <<'NODE'
let text = "";

for await (
  const chunk of process.stdin
) {
  text += chunk;
}

try {
  const data =
    JSON.parse(text);

  const scanner =
    data?.scanner ?? {};

  console.log(
    "Scanner status:",
    scanner.status
  );

  console.log(
    "Active:",
    scanner.active
  );

  console.log(
    "Cycle count:",
    scanner.cycleCount
  );

  console.log(
    "Running cycle:",
    scanner.runningCycle
  );

  console.log(
    "Last error:",
    scanner.lastError
  );

  if (
    scanner.status === "STOPPED"
  ) {
    console.log(
      "DIAGNOSTIC: Scanner exists but is STOPPED."
    );
  }

  if (
    scanner.cycleCount === 0
  ) {
    console.log(
      "DIAGNOSTIC: No discovery cycle has completed."
    );
  }
} catch (error) {
  console.log(
    "Could not parse scanner status:",
    error.message
  );
}
NODE

fi


# ============================================================
# 14. TRADE SCORING ARCHITECTURE
# ============================================================

section "14. TRADE SCORING"

if [
  -f \
  src/strategy/tradeScoringEngine.js
]; then

  echo "--- Configured weights ---"

  grep -n \
    -A 35 \
    -B 5 \
    -E 'weights:|technical:|company:|institutional:' \
    src/strategy/tradeScoringEngine.js \
    | head -180

  echo
  echo "--- Directional support handling ---"

  grep -n \
    -E 'directionalSupport|support|maximumPoints|availablePoints|preferredSide|INSUFFICIENT_DATA' \
    src/strategy/tradeScoringEngine.js \
    | head -300

else
  fail "tradeScoringEngine.js missing"
fi


# ============================================================
# 15. DIRECTION / PREFERRED SIDE
# ============================================================

section "15. DIRECTION RESOLUTION"

grep -Rni \
  --exclude-dir=node_modules \
  --exclude-dir=dist \
  -E 'preferredSide|direction.*LONG|direction.*SHORT|scoreDifference|ambiguous' \
  src/strategy \
  src/orchestration \
  src/services \
  2>/dev/null \
  | head -400


# ============================================================
# 16. HISTORICAL TIMEOUTS
# ============================================================

section "16. TIMEOUTS / PERFORMANCE RISKS"

grep -Rni \
  --exclude-dir=node_modules \
  --exclude-dir=dist \
  -E '30_000|30000|45_000|45000|timeoutMs|withTimeout' \
  src/services \
  src/data/providers \
  src/scanner \
  2>/dev/null \
  | head -400


# ============================================================
# 17. TARGETED STOCK TEST SUITE
# ============================================================

section "17. TARGETED BACKEND TESTS"

TESTS=(
  "src/tests/universeMarketDataService.test.js"
  "src/tests/alpacaUniverseWarmer.test.js"
  "src/tests/alpacaUniverseWarmer.volume.test.js"
  "src/tests/marketMeasurementProvider.volume.test.js"
  "src/tests/institutionalPositionEngine.test.js"
  "src/tests/securityResolver.test.js"
  "src/tests/institutionalManagerRegistry.test.js"
  "src/tests/secInstitutionalFilingsProvider.test.js"
  "src/tests/tradeScoringEngine.test.js"
  "src/tests/tradeScoringInstitutional.integration.test.js"
  "src/tests/tradeScoringHistory.integration.test.js"
  "src/tests/selfLearningScoringLoop.integration.test.js"
  "src/tests/continuousMarketScanner.test.js"
)

EXISTING_TESTS=()

for test_file in "${TESTS[@]}"; do
  if [ -f "$test_file" ]; then
    EXISTING_TESTS+=("$test_file")
  fi
done

echo "Running ${#EXISTING_TESTS[@]} existing targeted tests..."

if [ "${#EXISTING_TESTS[@]}" -gt 0 ]; then

  npx vitest run \
    "${EXISTING_TESTS[@]}" \
    --reporter=verbose

  TEST_STATUS=$?

  if [ "$TEST_STATUS" -eq 0 ]; then
    pass "Targeted backend tests passed"
  else
    fail "One or more targeted backend tests failed"
  fi

else
  warn "No targeted tests from diagnostic list were found"
fi


# ============================================================
# 18. CLIENT IMPORT / BUILD TEST
# ============================================================

section "18. CLIENT BUILD"

cd "$CLIENT" || exit 1

if npm run build; then
  pass "Client production build passed"
else
  fail "Client production build failed"
fi


# ============================================================
# 19. FRONTEND API URL CHECK
# ============================================================

section "19. FRONTEND API CONFIGURATION"

grep -Rni \
  --exclude-dir=node_modules \
  --exclude-dir=dist \
  -E 'localhost:8000|VITE_.*API|API_BASE|baseURL' \
  src \
  .env* \
  2>/dev/null \
  | head -250


# ============================================================
# 20. COMMON HIGH-RISK SOURCE ISSUES
# ============================================================

section "20. HIGH-RISK SOURCE PATTERNS"

cd "$SERVER" || exit 1

echo "--- Explicit TODO / FIXME / HACK ---"

grep -Rni \
  --exclude-dir=node_modules \
  --exclude-dir=dist \
  -E 'TODO|FIXME|HACK|XXX' \
  src \
  | head -300 \
  || true

echo
echo "--- Empty catches ---"

grep -Rni \
  --exclude-dir=node_modules \
  --exclude-dir=dist \
  -E 'catch[[:space:]]*\([^)]*\)[[:space:]]*\{[[:space:]]*\}' \
  src \
  | head -200 \
  || true

echo
echo "--- Hard-coded localhost references in backend ---"

grep -Rni \
  --exclude-dir=node_modules \
  --exclude-dir=dist \
  "localhost" \
  src \
  | head -150 \
  || true


# ============================================================
# 21. SUMMARY
# ============================================================

section "21. DIAGNOSTIC SUMMARY"

echo "PASS: $PASS"
echo "WARN: $WARN"
echo "FAIL: $FAIL"

echo
echo "Key areas inspected:"
echo "  - backend syntax"
echo "  - relative imports"
echo "  - duplicated engines"
echo "  - institutional evidence wiring"
echo "  - CUSIP/security resolver"
echo "  - Alpaca market data"
echo "  - volume/liquidity propagation"
echo "  - scanner lifecycle"
echo "  - scanner auto-start"
echo "  - environment configuration"
echo "  - API availability"
echo "  - scoring architecture"
echo "  - direction resolution"
echo "  - historical/provider timeouts"
echo "  - targeted backend tests"
echo "  - frontend production build"
echo "  - frontend API configuration"

echo
echo "Completed: $(date)"

} 2>&1 | tee "$REPORT"

echo
echo "============================================================"
echo "DIAGNOSTIC FINISHED"
echo "============================================================"
echo
echo "Report:"
echo "$REPORT"
echo
echo "PASS=$PASS WARN=$WARN FAIL=$FAIL"
echo
echo "Send stock-system-diagnostic.txt back to ChatGPT."
