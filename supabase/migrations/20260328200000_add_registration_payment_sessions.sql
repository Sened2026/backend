CREATE TABLE IF NOT EXISTS public.registration_payment_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL,
    encrypted_password TEXT NOT NULL,
    registration_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    plan_id UUID REFERENCES public.subscription_plans(id) ON DELETE SET NULL,
    plan_slug VARCHAR(50) NOT NULL,
    billing_period TEXT NOT NULL CHECK (billing_period IN ('monthly', 'yearly')),
    stripe_customer_id VARCHAR(255),
    stripe_subscription_id VARCHAR(255) UNIQUE,
    stripe_base_item_id TEXT,
    stripe_member_item_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    finalized_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (TIMEZONE('utc', NOW()) + INTERVAL '2 days'),
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS registration_payment_sessions_email_idx
    ON public.registration_payment_sessions (lower(email));

CREATE INDEX IF NOT EXISTS registration_payment_sessions_subscription_idx
    ON public.registration_payment_sessions (stripe_subscription_id);

CREATE INDEX IF NOT EXISTS registration_payment_sessions_finalized_user_idx
    ON public.registration_payment_sessions (finalized_user_id);

DROP TRIGGER IF EXISTS on_registration_payment_sessions_updated ON public.registration_payment_sessions;
CREATE TRIGGER on_registration_payment_sessions_updated
    BEFORE UPDATE ON public.registration_payment_sessions
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();
