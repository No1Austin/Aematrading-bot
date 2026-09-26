import express from 'express';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
// Mount BEFORE express.json(): app.use('/api/billing/webhook', stripeWebhook)
router.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
  let event;
  try { event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET); }
  catch (err) { return res.status(400).send(`Invalid signature: ${err.message}`); }
  try {
    if (event.type === 'invoice.paid') {
      const invoice = event.data.object;
      // Match only a known subscription customer; do not award for unrelated invoices.
      if (invoice.subscription && invoice.customer) {
        const { data: subscriber, error: subError } = await admin.from('subscriptions')
          .select('user_id, stripe_subscription_id').eq('stripe_customer_id', invoice.customer).single();
        if (subError) throw subError;
        if (subscriber?.stripe_subscription_id === invoice.subscription && invoice.amount_paid > 0) {
          const { data: profile, error: profileError } = await admin.from('profiles').select('referred_by').eq('id', subscriber.user_id).single();
          if (profileError) throw profileError;
          if (profile?.referred_by) {
            // Unique invoice ID makes retries idempotent.
            const { error } = await admin.from('reward_ledger').upsert({
              user_id: profile.referred_by, referred_user_id: subscriber.user_id,
              stripe_invoice_id: invoice.id, points_delta: 5, reason: 'referral_subscription_payment',
            }, { onConflict: 'stripe_invoice_id', ignoreDuplicates: true });
            if (error) throw error;
          }
        }
      }
    }
    res.json({ received: true });
  } catch (err) { console.error('Stripe webhook failed:', err); res.status(500).json({ error: 'Webhook processing failed' }); }
});
export default router;
