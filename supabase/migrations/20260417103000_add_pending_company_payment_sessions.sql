CREATE TABLE IF NOT EXISTS public.pending_company_payment_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    company_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    plan_id UUID REFERENCES public.subscription_plans(id) ON DELETE SET NULL,
    plan_slug VARCHAR(50),
    billing_period TEXT CHECK (billing_period IN ('monthly', 'yearly')),
    stripe_customer_id VARCHAR(255),
    stripe_subscription_id VARCHAR(255) UNIQUE,
    stripe_base_item_id TEXT,
    stripe_member_item_id TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    finalized_company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (TIMEZONE('utc', NOW()) + INTERVAL '2 days'),
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS pending_company_payment_sessions_user_idx
    ON public.pending_company_payment_sessions (user_id);

CREATE INDEX IF NOT EXISTS pending_company_payment_sessions_subscription_idx
    ON public.pending_company_payment_sessions (stripe_subscription_id);

CREATE INDEX IF NOT EXISTS pending_company_payment_sessions_finalized_company_idx
    ON public.pending_company_payment_sessions (finalized_company_id);

DROP TRIGGER IF EXISTS on_pending_company_payment_sessions_updated
    ON public.pending_company_payment_sessions;

CREATE TRIGGER on_pending_company_payment_sessions_updated
    BEFORE UPDATE ON public.pending_company_payment_sessions
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();
