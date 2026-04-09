ALTER TABLE public.clients
    ADD COLUMN IF NOT EXISTS signature_contact_first_name VARCHAR(100),
    ADD COLUMN IF NOT EXISTS signature_contact_last_name VARCHAR(100),
    ADD COLUMN IF NOT EXISTS signature_contact_email VARCHAR(255),
    ADD COLUMN IF NOT EXISTS signature_contact_phone VARCHAR(20);

CREATE INDEX IF NOT EXISTS clients_signature_contact_email_idx
    ON public.clients(signature_contact_email);

UPDATE public.clients
SET
    signature_contact_first_name = COALESCE(signature_contact_first_name, first_name),
    signature_contact_last_name = COALESCE(signature_contact_last_name, last_name),
    signature_contact_email = COALESCE(signature_contact_email, email),
    signature_contact_phone = COALESCE(signature_contact_phone, phone)
WHERE type = 'individual';

ALTER TABLE public.quotes
    ADD COLUMN IF NOT EXISTS signature_provider VARCHAR(20) NOT NULL DEFAULT 'internal',
    ADD COLUMN IF NOT EXISTS yousign_signature_request_id VARCHAR(255),
    ADD COLUMN IF NOT EXISTS yousign_document_id VARCHAR(255),
    ADD COLUMN IF NOT EXISTS yousign_signer_id VARCHAR(255),
    ADD COLUMN IF NOT EXISTS yousign_status VARCHAR(50),
    ADD COLUMN IF NOT EXISTS yousign_signature_link_expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS yousign_last_event_name VARCHAR(100),
    ADD COLUMN IF NOT EXISTS yousign_last_event_at TIMESTAMPTZ;

ALTER TABLE public.quotes
    DROP CONSTRAINT IF EXISTS quotes_signature_provider_check;

ALTER TABLE public.quotes
    ADD CONSTRAINT quotes_signature_provider_check
        CHECK (signature_provider IN ('internal', 'yousign'));

CREATE INDEX IF NOT EXISTS quotes_signature_provider_idx
    ON public.quotes(signature_provider);

CREATE INDEX IF NOT EXISTS quotes_yousign_signature_request_id_idx
    ON public.quotes(yousign_signature_request_id);

ALTER TABLE public.quote_signatures
    ALTER COLUMN signature_image_url DROP NOT NULL;

CREATE TABLE IF NOT EXISTS public.quote_signature_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
    provider VARCHAR(20) NOT NULL,
    event_id VARCHAR(255) NOT NULL,
    event_name VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    CONSTRAINT quote_signature_events_provider_check
        CHECK (provider IN ('yousign')),
    CONSTRAINT quote_signature_events_event_id_unique UNIQUE (event_id)
);

CREATE INDEX IF NOT EXISTS quote_signature_events_quote_id_idx
    ON public.quote_signature_events(quote_id);

CREATE INDEX IF NOT EXISTS quote_signature_events_created_at_idx
    ON public.quote_signature_events(created_at DESC);

ALTER TABLE public.quote_signature_events ENABLE ROW LEVEL SECURITY;
