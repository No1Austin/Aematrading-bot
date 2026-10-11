import { createClient } from "@supabase/supabase-js";

/** Public SaaS research entitlement only. Never attach to private bot routes. */
let adminClient;
function getAdmin() {
  if (adminClient) return adminClient;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing");
  adminClient = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return adminClient;
}

function isFuture(value) {
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > Date.now();
}

export default async function requireResearchSubscription(req, res, next) {
  const authorization = req.get("authorization") || "";
  const match = /^Bearer\s+(\S+)$/i.exec(authorization.trim());
  if (!match) {
    return res.status(401).json({
      error: "AUTH_REQUIRED",
      message: "Sign in to access research.",
    });
  }

  try {
    const admin = getAdmin();
    const { data: auth, error: authError } = await admin.auth.getUser(match[1]);
    if (authError || !auth?.user?.id) {
      return res.status(401).json({ error: "INVALID_TOKEN", message: "Please sign in again." });
    }

    const { data: subscription, error: dbError } = await admin
      .from("subscriptions")
      .select("status, trial_ends_at, current_period_end")
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (dbError) throw dbError;

    const trialActive = isFuture(subscription?.trial_ends_at);
    const paidActive = subscription?.status === "active" &&
      isFuture(subscription?.current_period_end);

    if (!trialActive && !paidActive) {
      return res.status(402).json({
        error: "SUBSCRIPTION_REQUIRED",
        message: "Your free trial has expired. Subscribe to continue researching.",
        trial_ends_at: subscription?.trial_ends_at ?? null,
      });
    }

    req.researchUserId = auth.user.id;
    return next();
  } catch (error) {
    console.error("[RESEARCH_SUBSCRIPTION_CHECK_FAILED]", error?.message ?? error);
    return res.status(503).json({
      error: "SUBSCRIPTION_CHECK_UNAVAILABLE",
      message: "Research access could not be verified. Please try again later.",
    });
  }
}
