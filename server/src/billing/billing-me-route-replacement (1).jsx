// Replace only router.get('/me', ...) in server/src/billing/routes.js
// Do not call reconcileUser() here. Stripe webhook remains authoritative for updates.
router.get('/me', async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const row = await getSubscription(user.id);
    return res.json(publicSubscription(row));
  } catch (error) {
    const status = Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599
      ? error.status
      : 503;
    return res.status(status).json(billingFailure(error, 'billing_status_lookup'));
  }
});
