ALTER TABLE public.company_chorus_pro_settings
    ADD COLUMN IF NOT EXISTS verified_company_siret VARCHAR(14),
    ADD COLUMN IF NOT EXISTS verified_structure_label TEXT,
    ADD COLUMN IF NOT EXISTS verified_user_role TEXT,
    ADD COLUMN IF NOT EXISTS verified_user_status TEXT,
    ADD COLUMN IF NOT EXISTS verified_attachment_status TEXT,
    ADD COLUMN IF NOT EXISTS verified_services JSONB,
    ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ;
