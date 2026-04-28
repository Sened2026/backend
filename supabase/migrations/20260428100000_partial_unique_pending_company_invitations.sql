DROP INDEX IF EXISTS public.uq_company_invitations_company_email_lower;

CREATE UNIQUE INDEX uq_company_invitations_company_email_lower
ON public.company_invitations (company_id, lower(email))
WHERE accepted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_company_invitations_company_email_lower
ON public.company_invitations (company_id, lower(email));
