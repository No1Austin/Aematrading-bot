
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

// ============================================================
// AEMA RESEARCH — SHARED BILLING SERVICES
// ============================================================
//
// Responsibilities:
// 1. Initialize Stripe securely.
// 2. Initialize Supabase service-role client.
// 3. Authenticate requests using Supabase JWTs.
// 4. Retrieve existing subscription records.
// 5. Determine subscription access.
// 6. Explain subscription access failures.
//
// IMPORTANT:
// - Never expose service-role credentials to the frontend.
// - Never trust a subscription status supplied by the browser.
// - Never create or reset trials during billing requests.
// - Stripe is the authority for paid subscription status.
// - Supabase stores the synchronized access state.
//
// ============================================================

// ------------------------------------------------------------
// SERVICE CLIENTS
// ------------------------------------------------------------

let stripeClient = null;
let adminClient = null;

// ------------------------------------------------------------
// BILLING ERROR CLASS
// ------------------------------------------------------------

export class BillingError extends Error {
  constructor(
    code,
    message,
    {
      status = 500,
      details = null,
      cause = undefined,
    } = {}
  ) {
    super(message, { cause });

    this.name = "BillingError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

// ------------------------------------------------------------
// DIAGNOSTIC LOGGING
// ------------------------------------------------------------

export function logBillingError(
  stage,
  error,
  context = {}
) {
  console.error("[BILLING_FAILURE]", {
    stage,
    code: error?.code ?? "UNKNOWN_BILLING_ERROR",
    message: error?.message ?? "Unknown billing error",
    status: error?.status ?? 500,
    details: error?.details ?? null,
    context,
    timestamp: new Date().toISOString(),
  });
}

// ------------------------------------------------------------
// CONFIGURATION VALIDATION
// ------------------------------------------------------------

function requireEnvironmentVariable(name) {
  const value = process.env[name];

  if (!value || !String(value).trim()) {
    throw new BillingError(
      "BILLING_CONFIGURATION_MISSING",
      `Required billing configuration is missing: ${name}`,
      {
        status: 503,
        details: {
          variable: name,
        },
      }
    );
  }

  return String(value).trim();
}

// ------------------------------------------------------------
// STRIPE CLIENT
// ------------------------------------------------------------

export function getStripe() {
  if (stripeClient) {
    return stripeClient;
  }

  const secretKey = requireEnvironmentVariable(
    "STRIPE_SECRET_KEY"
  );

  try {
    stripeClient = new Stripe(secretKey);

    return stripeClient;
  } catch (error) {
    throw new BillingError(
      "STRIPE_INITIALIZATION_FAILED",
      "Unable to initialize Stripe billing.",
      {
        status: 503,
        cause: error,
      }
    );
  }
}

// ------------------------------------------------------------
// SUPABASE ADMIN CLIENT
// ------------------------------------------------------------

export function getAdmin() {
  if (adminClient) {
    return adminClient;
  }

  const supabaseUrl = requireEnvironmentVariable(
    "SUPABASE_URL"
  );

  const serviceRoleKey = requireEnvironmentVariable(
    "SUPABASE_SERVICE_ROLE_KEY"
  );

  try {
    adminClient = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      }
    );

    return adminClient;
  } catch (error) {
    throw new BillingError(
      "SUPABASE_INITIALIZATION_FAILED",
      "Unable to initialize the billing database.",
      {
        status: 503,
        cause: error,
      }
    );
  }
}

// ------------------------------------------------------------
// AUTHENTICATE REQUEST
// ------------------------------------------------------------

export async function authenticateRequest(req) {
  const authorization = String(
    req?.headers?.authorization ?? ""
  );

  const match = authorization.match(
    /^Bearer\s+(.+)$/i
  );

  if (!match) {
    return null;
  }

  const accessToken = match[1].trim();

  if (!accessToken) {
    return null;
  }

  try {
    const admin = getAdmin();

    const { data, error } =
      await admin.auth.getUser(accessToken);

    if (error) {
      console.warn("[BILLING_AUTH_FAILED]", {
        code: "INVALID_ACCESS_TOKEN",
        message: error.message,
      });

      return null;
    }

    if (!data?.user?.id) {
      console.warn("[BILLING_AUTH_FAILED]", {
        code: "USER_NOT_FOUND",
      });

      return null;
    }

    return data.user;
  } catch (error) {
    // An infrastructure failure is not the same as an
    // invalid token. Let the route return a server error.

    logBillingError(
      "authentication",
      error
    );

    throw error;
  }
}

// ------------------------------------------------------------
// GET SUBSCRIPTION
// ------------------------------------------------------------

export async function getSubscription(userId) {
  if (!userId || typeof userId !== "string") {
    throw new BillingError(
      "INVALID_USER_ID",
      "A valid user ID is required.",
      {
        status: 400,
      }
    );
  }

  const admin = getAdmin();

  let result;

  try {
    result = await admin
      .from("subscriptions")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
  } catch (error) {
    throw new BillingError(
      "SUPABASE_CONNECTION_FAILED",
      "Unable to connect to the subscription database.",
      {
        status: 503,
        cause: error,
      }
    );
  }

  const { data, error } = result;

  if (error) {
    throw new BillingError(
      "SUBSCRIPTION_LOOKUP_FAILED",
      "Unable to retrieve the subscription record.",
      {
        status: 503,
        details: {
          databaseCode: error.code ?? null,
          databaseMessage: error.message,
          databaseHint: error.hint ?? null,
        },
        cause: error,
      }
    );
  }

  if (!data) {
    // Trials must only be created during account
    // provisioning, never from a billing request.

    throw new BillingError(
      "SUBSCRIPTION_ROW_MISSING",
      "Your subscription record is missing. Account provisioning requires attention.",
      {
        status: 409,
        details: {
          userId,
          action:
            "Check the Supabase signup trigger and subscriptions table.",
        },
      }
    );
  }

  return data;
}

// ------------------------------------------------------------
// DATE VALIDATION
// ------------------------------------------------------------

function parseBillingDate(value) {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return timestamp;
}

// ------------------------------------------------------------
// SUBSCRIPTION ACCESS EVALUATION
// ------------------------------------------------------------

export function evaluateSubscriptionAccess(
  row,
  now = Date.now()
) {
  if (!row) {
    return {
      has_access: false,
      access_reason: "SUBSCRIPTION_ROW_MISSING",
      trial_active: false,
      paid_active: false,
    };
  }

  const status = String(
    row.status ?? "inactive"
  ).toLowerCase();

  const trialEnd = parseBillingDate(
    row.trial_ends_at
  );

  const periodEnd = parseBillingDate(
    row.current_period_end
  );

  const trialActive =
    trialEnd !== null && trialEnd > now;

  const paidActive =
    status === "active" &&
    periodEnd !== null &&
    periodEnd > now;

  // Existing trial policy:
  // A valid original signup trial grants access.

  if (trialActive) {
    return {
      has_access: true,
      access_reason: "TRIAL_ACTIVE",
      trial_active: true,
      paid_active: paidActive,
    };
  }

  // Paid access requires both an active subscription
  // and a valid future billing-period end.

  if (paidActive) {
    return {
      has_access: true,
      access_reason: "PAID_SUBSCRIPTION_ACTIVE",
      trial_active: false,
      paid_active: true,
    };
  }

  // Detailed reasons for denied access.

  if (status === "active" && !row.current_period_end) {
    return {
      has_access: false,
      access_reason: "BILLING_PERIOD_MISSING",
      trial_active: false,
      paid_active: false,
    };
  }

  if (
    status === "active" &&
    row.current_period_end &&
    periodEnd === null
  ) {
    return {
      has_access: false,
      access_reason: "INVALID_BILLING_PERIOD",
      trial_active: false,
      paid_active: false,
    };
  }

  if (
    status === "active" &&
    periodEnd !== null &&
    periodEnd <= now
  ) {
    return {
      has_access: false,
      access_reason: "BILLING_PERIOD_EXPIRED",
      trial_active: false,
      paid_active: false,
    };
  }

  const statusReasons = {
    trialing: "STRIPE_TRIALING",
    past_due: "PAYMENT_PAST_DUE",
    unpaid: "PAYMENT_UNPAID",
    incomplete: "PAYMENT_INCOMPLETE",
    incomplete_expired: "PAYMENT_EXPIRED",
    canceled: "SUBSCRIPTION_CANCELED",
    paused: "SUBSCRIPTION_PAUSED",
    inactive: "NO_ACTIVE_SUBSCRIPTION",
  };

  return {
    has_access: false,
    access_reason:
      statusReasons[status] ??
      "NO_ACTIVE_SUBSCRIPTION",
    trial_active: false,
    paid_active: false,
  };
}

// ------------------------------------------------------------
// HAS ACCESS
// ------------------------------------------------------------

export function hasAccess(
  row,
  now = Date.now()
) {
  return evaluateSubscriptionAccess(
    row,
    now
  ).has_access;
}

// ------------------------------------------------------------
// PUBLIC SUBSCRIPTION RESPONSE
// ------------------------------------------------------------

export function publicSubscription(row) {
  const access = evaluateSubscriptionAccess(row);

  return {
    status: row?.status ?? "inactive",

    trial_ends_at:
      row?.trial_ends_at ?? null,

    current_period_end:
      row?.current_period_end ?? null,

    has_access:
      access.has_access,

    access_reason:
      access.access_reason,

    trial_active:
      access.trial_active,

    paid_active:
      access.paid_active,
  };
}
