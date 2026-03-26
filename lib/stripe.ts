import Stripe from 'stripe';

export const isStripeConfigured = !!process.env.STRIPE_SECRET_KEY;

let stripeInstance: Stripe | null = null;
if (isStripeConfigured) {
  stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2026-03-25.dahlia', // Updated to current stable version
  });
} else {
  console.warn('STRIPE_SECRET_KEY not set. Stripe functionality disabled.');
}

export const stripe = stripeInstance as Stripe;

/**
 * Create a Stripe Checkout session for subscription
 */
export async function createCheckoutSession({
  priceId,
  customerEmail,
  successUrl,
  cancelUrl,
  referralId,
}: {
  priceId: string;
  customerEmail?: string;
  successUrl: string;
  cancelUrl: string;
  referralId?: string;
}) {
  if (!stripeInstance) {
    throw new Error('Stripe is not configured');
  }
  const session = await stripeInstance.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    customer_email: customerEmail,
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      referralId: referralId || '',
    },
    subscription_data: referralId ? {
      metadata: { referralId },
    } : undefined,
  });

  return session;
}

/**
 * Create a customer portal session
 */
export async function createCustomerPortalSession(customerId: string, returnUrl: string) {
  if (!stripeInstance) {
    throw new Error('Stripe is not configured');
  }
  const session = await stripeInstance.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
  return session;
}

/**
 * Validate Stripe webhook signature
 */
export function constructWebhookEvent(payload: string | Buffer, signature: string) {
  if (!stripeInstance) {
    throw new Error('Stripe is not configured');
  }
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error('Missing STRIPE_WEBHOOK_SECRET environment variable');
  }
  return stripeInstance.webhooks.constructEvent(payload, signature, webhookSecret);
}