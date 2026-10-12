import { getAdmin, getStripe } from './shared.js';

export class BillingError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'BillingError';
    this.code = code;
    this.details = details;
  }
}

export const stripeId = (value) => typeof value === 'string' ? value : value?.id ?? null;

export function invoiceSubscriptionId(invoice) {
  return stripeId(
    invoice.parent?.subscription_details?.subscription ??
    invoice.subscription ??
    invoice.lines?.data?.find(line => line.parent?.subscription_item_details?.subscription)
      ?.parent?.subscription_item_details?.subscription
  );
}

function periodEnd(subscription) {
  const values = (subscription.items?.data ?? [])
    .map(item => item.current_period_end)
    .filter(value => Number.isFinite(value) && value > 0);
  if (Number.isFinite(subscription.current_period_end)) values.push(subscription.current_period_end);
  if (!values.length) throw new BillingError('STRIPE_PERIOD_MISSING', 'Stripe did not return a subscription billing-period end.', { subscriptionId: subscription.id });
  return new Date(Math.max(...values) * 1000).toISOString();
}

export async function readBillingRow(userId) {
  const { data, error } = await getAdmin().from('subscriptions')
    .select('user_id, stripe_customer_id, stripe_subscription_id, status, current_period_end')
    .eq('user_id', userId).maybeSingle();
  if (error) throw new BillingError('SUPABASE_READ_FAILED', 'Unable to read the subscription record.', { cause: error.message });
  if (!data) throw new BillingError('SUBSCRIPTION_ROW_MISSING', 'No subscription record exists for this account.', { userId });
  return data;
}

export async function writeSubscription(userId, subscription) {
  const customerId = stripeId(subscription.customer);
  if (!customerId) throw new BillingError('STRIPE_CUSTOMER_MISSING', 'Stripe subscription has no customer.', { subscriptionId: subscription.id });
  const row = await readBillingRow(userId);
  if (row.stripe_customer_id !== customerId) {
    throw new BillingError('STRIPE_CUSTOMER_MISMATCH', 'The Stripe customer does not match the authenticated account.', { userId, subscriptionId: subscription.id });
  }
  // The caller must have established the user/customer link through the stored customer ID.
  const payload = {
    stripe_subscription_id: subscription.id,
    status: subscription.status,
    current_period_end: periodEnd(subscription),
  };
  const { data, error } = await getAdmin().from('subscriptions')
    .update(payload)
    .eq('user_id', userId)
    .eq('stripe_customer_id', customerId)
    .select('user_id, stripe_subscription_id, status, current_period_end')
    .single();
  if (error || !data) {
    throw new BillingError('SUPABASE_WRITE_FAILED', 'Stripe confirmed the subscription, but Supabase did not save it.', { userId, subscriptionId: subscription.id, cause: error?.message });
  }
  console.info('[BILLING_SYNC_OK]', { userId, subscriptionId: data.stripe_subscription_id, status: data.status });
  return data;
}

const LIVE_STATUSES = new Set(['active', 'trialing', 'past_due', 'unpaid', 'paused']);

export async function listCustomerSubscriptions(customerId) {
  const items = [];
  for await (const item of getStripe().subscriptions.list({ customer: customerId, status: 'all', limit: 100 })) {
    items.push(item);
    if (items.length > 500) throw new BillingError('TOO_MANY_SUBSCRIPTIONS', 'Unusually many Stripe subscriptions exist; manual review required.');
  }
  return items;
}

export function chooseSubscription(subscriptions, currentId = null) {
  const live = subscriptions.filter(item => LIVE_STATUSES.has(item.status));
  if (live.length > 1) {
    throw new BillingError('DUPLICATE_STRIPE_SUBSCRIPTIONS', 'Multiple non-terminal Stripe subscriptions exist. Resolve the duplicates in Stripe before activating access.', { subscriptionIds: live.map(s => s.id) });
  }
  if (live.length === 1) return live[0];
  return subscriptions.find(item => item.id === currentId) ?? null;
}

export async function reconcileUser(userId) {
  const row = await readBillingRow(userId);
  if (!row.stripe_customer_id) return row; // Local free trial may exist before Stripe Checkout.
  const subscriptions = await listCustomerSubscriptions(row.stripe_customer_id);
  const selected = chooseSubscription(subscriptions, row.stripe_subscription_id);
  if (!selected) {
    // If an existing Stripe subscription disappeared, fail closed and surface a diagnostic.
    if (row.stripe_subscription_id) throw new BillingError('STRIPE_SUBSCRIPTION_NOT_FOUND', 'Previously linked Stripe subscription is no longer returned by Stripe.', { subscriptionId: row.stripe_subscription_id });
    return row;
  }
  return writeSubscription(userId, selected);
}

export async function reconcileStripeSubscription(subscriptionId) {
  const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
  const customerId = stripeId(subscription.customer);
  if (!customerId) throw new BillingError('STRIPE_CUSTOMER_MISSING', 'Subscription has no customer.', { subscriptionId });
  const { data: rows, error } = await getAdmin().from('subscriptions')
    .select('user_id, stripe_customer_id, stripe_subscription_id')
    .eq('stripe_customer_id', customerId).limit(2);
  if (error) throw new BillingError('SUPABASE_READ_FAILED', 'Unable to find subscription owner.', { cause: error.message });
  if (rows?.length !== 1) throw new BillingError('STRIPE_CUSTOMER_UNLINKED', 'Stripe customer has no unique verified Supabase account yet.', { subscriptionId });
  // Reconcile all of this customer's subscriptions rather than applying a stale event.
  // Prevents old cancellation events from deactivating a newer subscription.
  return reconcileUser(rows[0].user_id);
}

export function billingFailure(error, stage) {
  const code = error instanceof BillingError ? error.code : 'BILLING_PROVIDER_ERROR';
  console.error('[BILLING_FAILURE]', { stage, code, message: error?.message, details: error?.details });
  return { code, error: error instanceof BillingError ? error.message : 'Billing service is temporarily unavailable. Please try again.', stage };
}
