// Stripe checkout URL for paid actions (e.g., name change)
// Set VITE_STRIPE_CHECKOUT_URL in your Netlify env to override.
const envUrl = (import.meta as any)?.env?.VITE_STRIPE_CHECKOUT_URL as string | undefined
export const STRIPE_CHECKOUT_URL = envUrl && envUrl.length > 0
  ? envUrl
  : 'https://buy.stripe.com/test_8wM8yK7wA0gQeEw5kk'
