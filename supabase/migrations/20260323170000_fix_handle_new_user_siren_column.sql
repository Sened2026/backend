-- Fix handle_new_user() trigger: use 'siren' column instead of old 'siret'
-- The column was renamed in migration 20260320100000 but the trigger was not updated.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company_id uuid;
    v_siret text;
    v_siren text;
    v_company_name text;
    v_address text;
    v_postal_code text;
    v_city text;
    v_country text;
    v_first_name text;
    v_last_name text;
    v_phone text;
    v_role_text text;
    v_role public.company_role;
    v_plan_slug text;
    v_plan_id uuid;
BEGIN
    v_first_name := NEW.raw_user_meta_data->>'first_name';
    v_last_name := NEW.raw_user_meta_data->>'last_name';
    v_phone := NEW.raw_user_meta_data->>'phone';

    INSERT INTO public.profiles (id, email, first_name, last_name, phone)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(v_first_name, ''),
        COALESCE(v_last_name, ''),
        v_phone
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        first_name = COALESCE(EXCLUDED.first_name, profiles.first_name),
        last_name = COALESCE(EXCLUDED.last_name, profiles.last_name);

    v_siren := NEW.raw_user_meta_data->>'siren';
    v_siret := NEW.raw_user_meta_data->>'siret';
    v_company_name := NEW.raw_user_meta_data->>'company_name';
    v_address := NEW.raw_user_meta_data->>'address';
    v_postal_code := NEW.raw_user_meta_data->>'postal_code';
    v_city := NEW.raw_user_meta_data->>'city';
    v_country := COALESCE(NEW.raw_user_meta_data->>'country', 'FR');

    v_role_text := COALESCE(NEW.raw_user_meta_data->>'role', 'merchant_admin');
    IF v_role_text NOT IN ('merchant_admin', 'merchant_consultant', 'accountant', 'accountant_consultant') THEN
        v_role_text := 'merchant_admin';
    END IF;
    v_role := v_role_text::public.company_role;

    IF v_role IN ('merchant_admin', 'accountant') AND v_company_name IS NOT NULL AND v_company_name != '' THEN
        INSERT INTO public.companies (name, siren, address, postal_code, city, country, owner_id)
        VALUES (v_company_name, COALESCE(v_siren, LEFT(v_siret, 9)), v_address, v_postal_code, v_city, v_country, NEW.id)
        RETURNING id INTO v_company_id;

        INSERT INTO public.user_companies (user_id, company_id, role, is_default)
        VALUES (NEW.id, v_company_id, v_role, true);

        INSERT INTO public.units (company_id, name, abbreviation)
        VALUES
            (v_company_id, 'Heure', 'h'),
            (v_company_id, 'Jour', 'j'),
            (v_company_id, 'Unite', 'u'),
            (v_company_id, 'Forfait', 'forf.'),
            (v_company_id, 'Metre', 'm'),
            (v_company_id, 'Metre carre', 'm2'),
            (v_company_id, 'Kilogramme', 'kg'),
            (v_company_id, 'Litre', 'L');

        INSERT INTO public.document_settings (company_id)
        VALUES (v_company_id)
        ON CONFLICT (company_id) DO NOTHING;
    END IF;

    -- Lire le plan choisi depuis les metadata et l'activer automatiquement
    v_plan_slug := NEW.raw_user_meta_data->>'plan_slug';
    v_plan_id := NULL;

    IF v_plan_slug IS NOT NULL AND v_plan_slug != '' THEN
        SELECT id INTO v_plan_id FROM public.subscription_plans
        WHERE slug = v_plan_slug AND is_active = true;
    END IF;

    INSERT INTO public.subscriptions (user_id, plan_id, status)
    VALUES (NEW.id, v_plan_id, (CASE WHEN v_plan_id IS NOT NULL THEN 'active' ELSE 'incomplete' END)::subscription_status)
    ON CONFLICT (user_id) DO NOTHING;

    PERFORM public.accept_pending_invitations(NEW.id, NEW.email);

    RETURN NEW;
END;
$$;
