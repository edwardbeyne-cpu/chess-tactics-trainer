# Sprint 5 Deployment Notes

## New Environment Variables

Add the following environment variables to Vercel (or .env.local for local development):

### Stripe Configuration
- `STRIPE_SECRET_KEY` – Stripe secret key (starts with `sk_`)
- `STRIPE_PUBLISHABLE_KEY` – Stripe publishable key (starts with `pk_`)
- `STRIPE_WEBHOOK_SECRET` – Webhook signing secret from Stripe dashboard
- `STRIPE_PRICE_ID_MONTHLY` – Price ID for monthly subscription ($9.99)
- `STRIPE_PRICE_ID_ANNUAL` – Price ID for annual subscription ($69.99)

### Rewardful Affiliate Tracking
- `NEXT_PUBLIC_REWARDFUL_API_KEY` – Rewardful API key (optional)

### Free Trial
- `NEXT_PUBLIC_TRIAL_DAYS` – Number of days for free trial (default: 7)

### Base URL (for webhooks)
- `NEXT_PUBLIC_BASE_URL` – Base URL for redirects (e.g., https://chess-tactics-trainer-v2.vercel.app)

## Stripe Setup Steps

1. Create a Stripe account if not already.
2. Enable test mode.
3. Create two products with prices:
   - Monthly Pro subscription: $9.99 recurring
   - Annual Pro subscription: $69.99 recurring
4. Copy the Price IDs (looks like `price_xxxx`) and set as environment variables.
5. In Stripe dashboard, configure webhook endpoint: `https://yourdomain.com/api/stripe/webhook`
6. Copy the webhook secret and set as `STRIPE_WEBHOOK_SECRET`.
7. Set `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY` from API keys.

## Rewardful Setup (optional)

1. Sign up at Rewardful.com.
2. Create a campaign for ChessTrainer.
3. Copy the API key and set as `NEXT_PUBLIC_REWARDFUL_API_KEY`.

## Testing

- Without Stripe keys, the checkout API will return an error message; the modal will show a user‑friendly error.
- Free trial starts on first puzzle solve (localStorage).
- Trial banner shows days remaining.
- Paywall blocks puzzle access after trial expires (unless subscription active).
- Subscription status is stored in localStorage (mock) – will be replaced with real DB later.

## Deployment

Merge to main after keys are added, or deploy preview branch to test.

## Known Limitations

- Subscription status is stored in localStorage only; webhook events are logged but not persisted.
- Customer portal requires customer ID (not yet stored).
- Referral ID cookie handling is basic; may need refinement.