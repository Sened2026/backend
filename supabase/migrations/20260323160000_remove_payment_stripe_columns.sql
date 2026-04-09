-- Remove Stripe payment columns from invoices (invoice payments no longer use Stripe)
ALTER TABLE public.invoices DROP COLUMN IF EXISTS stripe_checkout_session_id;
ALTER TABLE public.invoices DROP COLUMN IF EXISTS stripe_payment_intent_id;
ALTER TABLE public.invoices DROP COLUMN IF EXISTS stripe_payment_link_id;
ALTER TABLE public.invoices DROP COLUMN IF EXISTS stripe_payment_link_url;

-- Remove Stripe Connect columns from companies (no longer used for invoice payment routing)
ALTER TABLE public.companies DROP COLUMN IF EXISTS stripe_account_id;
ALTER TABLE public.companies DROP COLUMN IF EXISTS stripe_onboarding_completed;
