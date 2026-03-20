# Stripe Branding Configuration

Configure in Stripe Dashboard > Settings > Branding.

## Colors

- **Brand color / Accent:** `#0A84FF`
- **Background:** `#0F0F0F`

## Logo

Upload ANKI+ logo (white text on transparent background). Used on Checkout page and receipts.

## Checkout Page

The hosted Stripe Checkout automatically uses these brand colors. No code changes needed.

Optional: Custom domain (`pay.ankiplus.de`) — configure in Settings > Custom domains.

## Customer Portal

Configure in Settings > Billing > Customer Portal:

- Enable: subscription cancellation, plan switching
- Return URL: `https://anki-plus.vercel.app/dashboard/subscription`
- Branding: inherits from global Stripe branding settings

## Products & Prices

Two subscription products configured in Stripe:

| Product | Price ID Config Key | Monthly Price |
|---------|-------------------|---------------|
| Student | `stripe.price_tier1` | 4,99€ |
| Exam Pro | `stripe.price_tier2` | 14,99€ |

Price IDs are stored in Firebase Functions config (`firebase functions:config:set stripe.price_tier1="price_xxx"`).
