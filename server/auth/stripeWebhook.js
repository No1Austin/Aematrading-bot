import express from 'express';
import { getAdmin, getStripe } from '../src/billing/shared.js';
import { BillingError, billingFailure, stripeId, invoiceSubscriptionId, reconcileStripeSubscription, reconcileUser, readBillingRow } from '../src/billing/stripeSync.js';

const router = express.Router();

async function handleCheckout(sessionObject) {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionObject.id);
  if (session.mode !== 'subscription') return;
  if (session.status !== 'complete' || !stripeId(session.subscription)) {
    throw new BillingError('CHECKOUT_NOT_COMPLETE', 'Checkout is not complete or has no subscription.', { sessionId: session.id });
  }
  const userId = session.client_reference_id;
  if (!userId) throw new BillingError('CHECKOUT_USER_MISSING', 'Checkout has no verified user reference.', { sessionId: session.id });
  const row = await readBillingRow(userId);
  if (!row.stripe_customer_id || row.stripe_customer_id !== stripeId(session.customer)) {
    throw new BillingError('CHECKOUT_CUSTOMER_MISMATCH', 'Checkout customer does not match the stored customer for this user.', { sessionId: session.id });
  }
  const subscription = await stripe.subscriptions.retrieve(stripeId(session.subscription));
  if (stripeId(subscription.customer) !== row.stripe_customer_id) {
    throw new BillingError('CHECKOUT_SUBSCRIPTION_MISMATCH', 'Checkout subscription belongs to a different customer.', { sessionId: session.id });
  }
  await reconcileUser(userId);
}

async function awardReferral(invoice) {
  if (invoice.paid !== true || !(invoice.amount_paid > 0)) return;
  const subscriptionId = invoiceSubscriptionId(invoice);
  const customerId = stripeId(invoice.customer);
  if (!subscriptionId || !customerId) return;
  const { data: subscriber, error: subError } = await getAdmin().from('subscriptions')
    .select('user_id').eq('stripe_customer_id', customerId)
    .eq('stripe_subscription_id', subscriptionId).maybeSingle();
  if (subError) throw subError;
  if (!subscriber) return;
  const { data: profile, error: profileError } = await getAdmin().from('profiles')
    .select('referred_by').eq('id', subscriber.user_id).maybeSingle();
  if (profileError) throw profileError;
  if (!profile?.referred_by) return;
  const { error: rewardError } = await getAdmin().from('reward_ledger').upsert({
    user_id: profile.referred_by, referred_user_id: subscriber.user_id,
    stripe_invoice_id: invoice.id, points_delta: 5, reason: 'referral_subscription_payment',
  }, { onConflict: 'stripe_invoice_id', ignoreDuplicates: true });
  if (rewardError) throw rewardError;
}

async function handleEvent(event) {
  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckout(event.data.object);
      return;
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      await reconcileStripeSubscription(event.data.object.id);
      return;
    case 'invoice.paid': {
      const id = invoiceSubscriptionId(event.data.object);
      if (id) await reconcileStripeSubscription(id);
      await awardReferral(event.data.object);
      return;
    }
    case 'invoice.payment_failed': {
      const id = invoiceSubscriptionId(event.data.object);
      if (id) await reconcileStripeSubscription(id);
      return;
    }
    default:
      console.info('[STRIPE_EVENT_IGNORED]', { eventId: event.id, type: event.type });
  }
}

router.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
  let event;
  try {
    if (!process.env.STRIPE_WEBHOOK_SECRET) throw new Error('STRIPE_WEBHOOK_SECRET missing');
    event = getStripe().webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    console.error('[STRIPE_SIGNATURE_FAILED]', error.message);
    return res.status(400).json({ received: false, code: 'STRIPE_SIGNATURE_INVALID', error: 'Stripe webhook signature verification failed.' });
  }
  try {
    await handleEvent(event);
    console.info('[STRIPE_WEBHOOK_PROCESSED]', { eventId: event.id, type: event.type });
    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('[STRIPE_WEBHOOK_FAILED]', { eventId: event.id, type: event.type, code: error?.code, message: error?.message, details: error?.details });
    return res.status(500).json({ received: false, ...billingFailure(error, 'stripe_webhook'), event_id: event.id });
  }
});

export default router;
