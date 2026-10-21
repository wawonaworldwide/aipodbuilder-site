import Stripe from 'stripe';
import type { Env } from '../env';
export const apiVersion = '2025-03-31.basil';
export function stripeClient(env: Env): Stripe {
  if (
    env.STORE_MODE !== 'test' ||
    !/^(sk|rk)_test_/.test(env.STRIPE_SECRET_KEY || '')
  )
    throw Error('Test payment setup required.');
  return new Stripe(env.STRIPE_SECRET_KEY!, {
    apiVersion: apiVersion as Stripe.LatestApiVersion,
    httpClient: Stripe.createFetchHttpClient(),
    timeout: 5000,
    maxNetworkRetries: 0,
  });
}
export type StoreStripe = Pick<
  Stripe,
  'checkout' | 'paymentIntents' | 'charges'
>;
