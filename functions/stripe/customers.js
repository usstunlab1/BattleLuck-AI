import Stripe from 'stripe';
import { buildCreatedRange } from '../../lib/created-range.js';

export async function GET(limit = 10, email = null, start_date = null, end_date = null, context) {
  const stripeKey = context?.keychain?.key('STRIPE_SECRET_KEY') || process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) throw new Error('STRIPE_SECRET_KEY is not configured in keychain or environment.');
  const stripe = new Stripe(stripeKey);
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 10));
  const params = { limit: safeLimit };
  if (email) params.email = email;
  const created = buildCreatedRange(start_date, end_date);
  if (created) params.created = created;
  const customers = await stripe.customers.list(params);
  return customers.data;
}
