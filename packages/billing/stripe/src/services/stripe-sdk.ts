import 'server-only';
import { StripeServerEnvSchema } from '../schema/stripe-server-env.schema';

const STRIPE_API_VERSION = '2026-10-28.endive';

/**
 * @description returns a Stripe instance
 */
export async function createStripeClient() {
  const { default: Stripe } = await import('stripe');

  // Parse the environment variables and validate them
  const stripeServerEnv = StripeServerEnvSchema.parse({
    secretKey: process.env.STRIPE_SECRET_KEY,
    webhooksSecret: process.env.STRIPE_WEBHOOK_SECRET,
  });

  return new Stripe(stripeServerEnv.secretKey, {
    apiVersion: STRIPE_API_VERSION,
  });
}
