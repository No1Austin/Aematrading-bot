
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUTPUT = path.join(ROOT, "payment-audit.json");

const SKIP = new Set([
  "node_modules", ".git", "dist", "build",
  "coverage", ".next", ".vercel", ".cache",
  ".supabase"
]);

const EXTENSIONS = new Set([
  ".js", ".jsx", ".ts", ".tsx", ".json", ".sql"
]);

const MAX_SIZE = 1024 * 1024;

const patterns = {
  authentication:
    /\b(supabase\.auth|signUp|signIn|onAuthStateChange|auth\.getUser|requireAuth)\b/i,

  payments:
    /\b(stripe|checkout\.sessions|paymentIntent|payment_intent|paymentMethod|payment_method|paddle|lemonsqueezy)\b/i,

  subscriptions:
    /\b(subscription|subscriptions|price_id|priceId|billing_cycle|cancel_at_period_end)\b/i,

  trials:
    /\b(trial_end|trial_start|trial_period_days|trialEndsAt|trial_expires_at|free.trial)\b/i,

  access:
    /\b(isPremium|hasAccess|subscriptionStatus|subscription_status|trialActive|trialExpired|requireSubscription|premiumAccess)\b/i,

  webhooks:
    /\b(webhook|checkout\.session\.completed|invoice\.paid|invoice\.payment_failed|customer\.subscription)\b/i,

  database:
    /\b(create table|alter table|row level security|create policy|subscriptions|user_profiles)\b/i
};

const findings = [];
const filesScanned = [];

function walk(directory) {
  for (const item of fs.readdirSync(directory, {
    withFileTypes: true
  })) {
    const fullPath = path.join(directory, item.name);

    if (item.isSymbolicLink()) continue;

    if (item.isDirectory()) {
      if (!SKIP.has(item.name)) walk(fullPath);
      continue;
    }

    if (!item.isFile()) continue;

    if (
      item.name.startsWith(".env") ||
      item.name.includes(".secret") ||
      item.name.includes("credentials") ||
      item.name.includes("service-account") ||
      item.name === "package-lock.json"
    ) continue;

    const ext = path.extname(item.name);

    if (!EXTENSIONS.has(ext)) continue;

    if (fs.statSync(fullPath).size > MAX_SIZE) continue;

    const relativePath = path.relative(ROOT, fullPath);

    // Avoid reading or reporting the audit's own output.
    if (relativePath === "payment-audit.json") continue;

    const source = fs.readFileSync(fullPath, "utf8");
    const lines = source.split(/\r?\n/);

    filesScanned.push(relativePath);

    for (const [category, pattern] of Object.entries(patterns)) {
      const matches = [];

      lines.forEach((line, index) => {
        if (pattern.test(line)) {
          // Record locations, not source lines.
          // Source lines can contain credentials or tokens.
          matches.push(index + 1);
        }
      });

      if (matches.length) {
        findings.push({
          file: relativePath,
          category,
          matchingLines: matches.slice(0, 30),
          totalMatches: matches.length
        });
      }
    }
  }
}

walk(ROOT);

const report = {
  project: "AEMA Research",
  purpose: "Read-only payment architecture inventory",
  generatedAt: new Date().toISOString(),
  filesScanned: filesScanned.length,
  findings
};

fs.writeFileSync(
  OUTPUT,
  JSON.stringify(report, null, 2)
);

console.log("Payment architecture audit completed.");
console.log(`Files scanned: ${filesScanned.length}`);
console.log(`Findings: ${findings.length}`);
console.log(`Report: ${OUTPUT}`);
console.log(
  "No application files or database records were modified."
);
