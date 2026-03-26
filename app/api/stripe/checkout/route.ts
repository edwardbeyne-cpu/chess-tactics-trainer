import { NextRequest, NextResponse } from 'next/server';
import { createCheckoutSession } from '@/lib/stripe';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { priceId, plan, email } = body;

    // Determine priceId from plan or validate provided priceId
    const monthlyPriceId = process.env.STRIPE_PRICE_ID_MONTHLY;
    const annualPriceId = process.env.STRIPE_PRICE_ID_ANNUAL;

    if (!monthlyPriceId || !annualPriceId) {
      console.error('Missing Stripe price IDs in environment variables');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    let finalPriceId: string;
    if (priceId) {
      // Validate provided priceId
      if (priceId !== monthlyPriceId && priceId !== annualPriceId) {
        return NextResponse.json(
          { error: 'Invalid price ID' },
          { status: 400 }
        );
      }
      finalPriceId = priceId;
    } else if (plan === 'monthly') {
      finalPriceId = monthlyPriceId;
    } else if (plan === 'annual') {
      finalPriceId = annualPriceId;
    } else {
      return NextResponse.json(
        { error: 'Missing priceId or plan' },
        { status: 400 }
      );
    }

    // Get referral ID from cookies (Rewardful)
    const cookieStore = await cookies();
    const referralId = cookieStore.get('rewardful_referral')?.value;

    // Determine base URL for redirects
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const successUrl = `${baseUrl}/app/dashboard?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${baseUrl}/pricing`;

    const session = await createCheckoutSession({
      priceId: finalPriceId,
      customerEmail: email,
      successUrl,
      cancelUrl,
      referralId,
    });

    return NextResponse.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}