import express from 'express';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

// IMPORTANT: Mount this router before express.json() in app.js.
// Database prerequisite: see README.md in this patch.
const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function subscriptionIdFromInvoice(invoice) {
  return invoice.parent?.subscription_details?.subscription ?? invoice.subscription ?? null;
}

async function updateKnownSubscription(stripeSubscription) {
  const { data: existing, error } = await admin.from('subscriptions')
    .select('user_id, stripe_subscription_id, stripe_customer_id')
    .eq('stripe_subscription_id', stripeSubscription.id).maybeSingle();
  if (error) throw error;
  // Never create or attach an entitlement using untrusted customer metadata.
  // Checkout/account-linking must first establish the customer/subscription relationship.
  if (!existing || existing.stripe_customer_id !== stripeSubscription.customer) {
    console.warn('[STRIPE_UNLINKED_SUBSCRIPTION]', stripeSubscription.id);
    return;
  }
  const { error: updateError } = await admin.from('subscriptions').update({
    status: stripeSubscription.status,
    current_period_end: stripeSubscription.items?.data?.[0]?.current_period_end
      ? new Date(stripeSubscription.items.data[0].current_period_end * 1000).toISOString()
      : null,
  }).eq('stripe_subscription_id', stripeSubscription.id)
    .eq('stripe_customer_id', stripeSubscription.customer);
  if (updateError) throw updateError;
}

router.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (error) {
    return res.status(400).send('Invalid Stripe webhook signature');
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        // Account linking requires a server-created Checkout Session with an authenticated
        // user_id in client_reference_id. Do not grant access on an arbitrary session.
        const session = event.data.object;
        if (session.mode !== 'subscription' || !session.subscription || !session.customer) break;
        const userId = session.client_reference_id;
        if (!userId) {
          console.warn('[STRIPE_CHECKOUT_NO_USER_LINK]', session.id);
          break;
        }
        const { data: row, error: lookupError } = await admin.from('subscriptions')
          .select('user_id, stripe_customer_id').eq('user_id', userId).maybeSingle();
        if (lookupError) throw lookupError;
        if (!row || (row.stripe_customer_id && row.stripe_customer_id !== session.customer)) {
          console.warn('[STRIPE_CHECKOUT_UNMATCHED_USER]', session.id);
          break;
        }
        const subscription = await stripe.subscriptions.retrieve(session.subscription);
        const { error: updateError } = await admin.from('subscriptions').update({
          stripe_customer_id: session.customer,
          stripe_subscription_id: session.subscription,
          status: subscription.status,
          current_period_end: subscription.items?.data?.[0]?.current_period_end
            ? new Date(subscription.items.data[0].current_period_end * 1000).toISOString()
            : null,
        }).eq('user_id', userId);
        if (updateError) throw updateError;
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await updateKnownSubscription(event.data.object);
        break;
      case 'invoice.paid': {
        const invoice = event.data.object;
        const subscriptionId = subscriptionIdFromInvoice(invoice);
        if (!subscriptionId || !invoice.customer) break;
        // Synchronize status from Stripe (invoice event order is not guaranteed).
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        await updateKnownSubscription(subscription);
        if (!(invoice.amount_paid > 0 && invoice.paid === true)) break;
        const { data: subscriber, error: subError } = await admin.from('subscriptions')
          .select('user_id, stripe_subscription_id').eq('stripe_customer_id', invoice.customer)
          .eq('stripe_subscription_id', subscriptionId).maybeSingle();
        if (subError) throw subError;
        if (!subscriber) break;
        const { data: profile, error: profileError } = await admin.from('profiles')
          .select('referred_by').eq('id', subscriber.user_id).maybeSingle();
        if (profileError) throw profileError;
        if (!profile?.referred_by) break;
        const { error: rewardError } = await admin.from('reward_ledger').upsert({
          user_id: profile.referred_by,
          referred_user_id: subscriber.user_id,
          stripe_invoice_id: invoice.id,
          points_delta: 5,
          reason: 'referral_subscription_payment',
        }, { onConflict: 'stripe_invoice_id', ignoreDuplicates: true });
        if (rewardError) throw rewardError;
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const id = subscriptionIdFromInvoice(invoice);
        if (id) await updateKnownSubscription(await stripe.subscriptions.retrieve(id));
        break;
      }
      default:
        break;
    }
    return res.json({ received: true });
  } catch (error) {
    console.error('[STRIPE_WEBHOOK_PROCESSING_FAILED]', event.id, error);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
});

export default router;
