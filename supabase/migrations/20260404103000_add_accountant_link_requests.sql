CREATE TABLE IF NOT EXISTS public.accountant_link_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    accountant_company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    merchant_company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    requested_by UUID NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
    responded_at TIMESTAMPTZ,
    responded_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_accountant_link_requests_accountant_company
ON public.accountant_link_requests (accountant_company_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_accountant_link_requests_merchant_company
ON public.accountant_link_requests (merchant_company_id, status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_accountant_link_requests_pending_pair
ON public.accountant_link_requests (accountant_company_id, merchant_company_id)
WHERE status = 'pending';
