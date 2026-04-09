ALTER TABLE public.company_chorus_pro_settings
    ADD COLUMN IF NOT EXISTS chorus_id_utilisateur_courant BIGINT,
    ADD COLUMN IF NOT EXISTS chorus_id_fournisseur BIGINT,
    ADD COLUMN IF NOT EXISTS chorus_id_service_fournisseur BIGINT,
    ADD COLUMN IF NOT EXISTS chorus_code_coordonnees_bancaires_fournisseur BIGINT;

ALTER TABLE public.chorus_pro_submissions
    ADD COLUMN IF NOT EXISTS mode_depot VARCHAR(50),
    ADD COLUMN IF NOT EXISTS piece_jointe_id BIGINT,
    ADD COLUMN IF NOT EXISTS deposit_response JSONB,
    ADD COLUMN IF NOT EXISTS deposit_error_message TEXT;
