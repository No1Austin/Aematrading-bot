
import express from "express";

import {
  authenticateRequest,
  getSubscription,
  getAdmin,
  getStripe,
  publicSubscription,
} from "./shared.js";

import {
  BillingError,
  billingFailure,
  reconcileUser,
  listCustomerSubscriptions,
  chooseSubscription,
} from "./stripeSync.js";

const router = express.Router();

// ============================================================
// AUTHENTICATION
// ============================================================

async function requireUser(req, res) {
  const user = await authenticateRequest(req);

  if (!user) {
    res.status(401).json({
      code: "AUTH_REQUIRED",
      error: "Sign in to continue.",
    });

    return null;
  }

  return user;
}

// ============================================================
// GET /api/billing/me
//
// Read subscription access from Supabase.
// Do not query Stripe during ordinary page navigation.
// ============================================================

router.get("/me", async (req, res) => {
  try {
    const user = await requireUser(req, res);

    if (!user) return;

    const row = await getSubscription(user.id);

    res.set("Cache-Control", "private, no-store");

    return res.json(publicSubscription(row));
  } catch (error) {
    const status =
      Number.isInteger(error?.status) &&
      error.status >= 400 &&
      error.status < 600
        ? error.status
        : 503;

    return res
      .status(status)
      .json(billingFailure(error, "billing_status_lookup"));
  }
});

// ============================================================
// POST /api/billing/checkout
//
// Create Stripe Checkout only when there is no existing
// non-terminal Stripe subscription.
// ============================================================

router.post("/checkout", async (req, res) => {
  let stage = "authentication";

  try {
    const user = await requireUser(req, res);

    if (!user) return;

    stage = "configuration";

    const required = [
      "STRIPE_SECRET_KEY",
      "STRIPE_PRICE_ID",
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "BILLING_RETURN_URL",
    ];

    const missing = required.filter(
      (name) => !process.env[name]
    );

    if (missing.length) {
      throw new BillingError(
        "BILLING_CONFIGURATION_MISSING",
        "Billing server configuration is incomplete.",
        { missing }
      );
    }

    const stripe = getStripe();
    const admin = getAdmin();

    stage = "loading_subscription";

    const row = await getSubscription(user.id);

    // Preserve an existing local subscription.
    if (
      row.status === "active" &&
      row.current_period_end &&
      Date.parse(row.current_period_end) > Date.now() &&
      !row.stripe_customer_id
    ) {
      return res.status(409).json({
        code: "SUBSCRIPTION_ALREADY_ACTIVE",
        error: "Your subscription is already active.",
      });
    }

    stage = "creating_or_loading_customer";

    let customerId = row.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create(
        {
          email: user.email ?? undefined,
          metadata: {
            aema_user_id: user.id,
          },
        },
        {
          idempotencyKey: `aema-customer-${user.id}`,
        }
      );

      customerId = customer.id;

      const { data, error } = await admin
        .from("subscriptions")
        .update({
          stripe_customer_id: customerId,
        })
        .eq("user_id", user.id)
        .is("stripe_customer_id", null)
        .select("user_id, stripe_customer_id")
        .maybeSingle();

      if (error) {
        throw new BillingError(
          "SUPABASE_WRITE_FAILED",
          "Unable to link Stripe customer.",
          { cause: error.message }
        );
      }

      if (!data) {
        throw new BillingError(
          "CUSTOMER_LINK_CONFLICT",
          "Stripe customer was linked by another request. Refresh billing and retry."
        );
      }
    }

    // Check Stripe only during Checkout,
    // not during normal navigation.

    stage = "checking_stripe_subscriptions";

    const existing = await listCustomerSubscriptions(
      customerId
    );

    const selected = chooseSubscription(
      existing,
      row.stripe_subscription_id
    );

    const nonTerminalStatuses = [
      "active",
      "trialing",
      "past_due",
      "unpaid",
      "paused",
    ];

    if (
      selected &&
      nonTerminalStatuses.includes(selected.status)
    ) {
      await reconcileUser(user.id);

      return res.status(409).json({
        code: "STRIPE_SUBSCRIPTION_EXISTS",
        error:
          "A Stripe subscription already exists. Open billing management instead of subscribing again.",
        subscription_status: selected.status,
      });
    }

    stage = "creating_checkout";

    const base = String(
      process.env.BILLING_RETURN_URL
    ).replace(/\/+$/, "");

    const parsed = new URL(base);

    if (
      !["https:", "http:"].includes(parsed.protocol)
    ) {
      throw new BillingError(
        "INVALID_RETURN_URL",
        "Billing return URL must be HTTP(S)."
      );
    }

    const session =
      await stripe.checkout.sessions.create({
        mode: "subscription",

        customer: customerId,

        client_reference_id: user.id,

        line_items: [
          {
            price: process.env.STRIPE_PRICE_ID,
            quantity: 1,
          },
        ],

        success_url:
          `${base}/billing?billing=success` +
          "&session_id={CHECKOUT_SESSION_ID}",

        cancel_url:
          `${base}/billing?billing=cancelled`,

        allow_promotion_codes: true,

        subscription_data: {
          metadata: {
            aema_user_id: user.id,
          },
        },
      });

    if (!session.url) {
      throw new BillingError(
        "CHECKOUT_URL_MISSING",
        "Stripe created Checkout without a redirect URL."
      );
    }

    return res.json({
      url: session.url,
    });
  } catch (error) {
    return res
      .status(
        error instanceof BillingError &&
          error.code ===
            "BILLING_CONFIGURATION_MISSING"
          ? 503
          : 500
      )
      .json(billingFailure(error, stage));
  }
});

// ============================================================
// POST /api/billing/portal
//
// Open Stripe customer billing portal.
// ============================================================

router.post("/portal", async (req, res) => {
  try {
    const user = await requireUser(req, res);

    if (!user) return;

    const row = await getSubscription(user.id);

    if (!row.stripe_customer_id) {
      return res.status(409).json({
        code: "NO_STRIPE_CUSTOMER",
        error:
          "No Stripe billing account exists yet.",
      });
    }

    const base = String(
      process.env.BILLING_RETURN_URL ?? ""
    ).replace(/\/+$/, "");

    if (!base) {
      throw new BillingError(
        "BILLING_CONFIGURATION_MISSING",
        "BILLING_RETURN_URL is missing."
      );
    }

    const session =
      await getStripe().billingPortal.sessions.create({
        customer: row.stripe_customer_id,
        return_url: `${base}/billing`,
      });

    return res.json({
      url: session.url,
    });
  } catch (error) {
    return res
      .status(503)
      .json(billingFailure(error, "billing_portal"));
  }
});

export default router;
