-- Add billing_period to track monthly vs yearly subscription
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS billing_period TEXT DEFAULT 'monthly';

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_billing_period_check
  CHECK (billing_period IN ('monthly', 'yearly'));

-- Add stripe_base_item_id to identify the base plan item explicitly (not by position)
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS stripe_base_item_id TEXT;

-- Ensure yearly lookup keys are set on all plans
UPDATE public.subscription_plans SET stripe_lookup_key_yearly = slug || '_yearly'
WHERE stripe_lookup_key_yearly IS NULL AND is_active = true;
