-- Auto-create and auto-link an invited accountant's cabinet without creating
-- a personal paid subscription. Keep accountant_firm invitations unchanged.

CREATE OR REPLACE FUNCTION public.accept_pending_invitations(p_user_id uuid, p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_invitation RECORD;
    v_email_normalized text;
    v_accountant_company_id uuid;
    v_has_companies boolean;
BEGIN
    v_email_normalized := lower(trim(p_email));

    FOR v_invitation IN
        SELECT
            id,
            company_id,
            role,
            COALESCE(invitation_type, 'member') AS invitation_type,
            invited_firm_name,
            invited_firm_siren
        FROM public.company_invitations
        WHERE lower(email) = v_email_normalized
          AND accepted_at IS NULL
          AND expires_at > now()
    LOOP
        IF v_invitation.invitation_type = 'accountant_firm' THEN
            SELECT c.id
            INTO v_accountant_company_id
            FROM public.user_companies uc
            JOIN public.companies c ON c.id = uc.company_id
            WHERE uc.user_id = p_user_id
              AND uc.role = 'accountant'
            ORDER BY uc.created_at ASC
            LIMIT 1;

            IF v_accountant_company_id IS NULL AND v_invitation.invited_firm_siren IS NOT NULL THEN
                SELECT c.id
                INTO v_accountant_company_id
                FROM public.companies c
                JOIN public.user_companies uc ON uc.company_id = c.id
                WHERE c.siren = v_invitation.invited_firm_siren
                  AND uc.role = 'accountant'
                ORDER BY uc.created_at ASC
                LIMIT 1;
            END IF;

            IF v_accountant_company_id IS NULL THEN
                SELECT EXISTS(
                    SELECT 1
                    FROM public.user_companies
                    WHERE user_id = p_user_id
                ) INTO v_has_companies;

                INSERT INTO public.companies (name, siren, owner_id)
                VALUES (
                    COALESCE(v_invitation.invited_firm_name, 'Cabinet comptable'),
                    v_invitation.invited_firm_siren,
                    p_user_id
                )
                RETURNING id INTO v_accountant_company_id;

                INSERT INTO public.user_companies (user_id, company_id, role, is_default)
                VALUES (p_user_id, v_accountant_company_id, 'accountant', NOT v_has_companies)
                ON CONFLICT (user_id, company_id) DO NOTHING;

                INSERT INTO public.units (company_id, name, abbreviation)
                VALUES
                    (v_accountant_company_id, 'Heure', 'h'),
                    (v_accountant_company_id, 'Jour', 'j'),
                    (v_accountant_company_id, 'Unite', 'u'),
                    (v_accountant_company_id, 'Forfait', 'forf.'),
                    (v_accountant_company_id, 'Metre', 'm'),
                    (v_accountant_company_id, 'Metre carre', 'm2'),
                    (v_accountant_company_id, 'Kilogramme', 'kg'),
                    (v_accountant_company_id, 'Litre', 'L');

                INSERT INTO public.document_settings (company_id)
                VALUES (v_accountant_company_id)
                ON CONFLICT (company_id) DO NOTHING;
            ELSE
                INSERT INTO public.user_companies (user_id, company_id, role, is_default)
                VALUES (p_user_id, v_accountant_company_id, 'accountant', false)
                ON CONFLICT (user_id, company_id) DO NOTHING;
            END IF;

            UPDATE public.companies
            SET accountant_company_id = v_accountant_company_id
            WHERE id = v_invitation.company_id;
        ELSE
            INSERT INTO public.user_companies (user_id, company_id, role, is_default)
            VALUES (p_user_id, v_invitation.company_id, v_invitation.role, false)
            ON CONFLICT (user_id, company_id) DO UPDATE
            SET role = EXCLUDED.role;

            IF v_invitation.role = 'accountant' THEN
                SELECT c.id
                INTO v_accountant_company_id
                FROM public.user_companies uc
                JOIN public.companies c ON c.id = uc.company_id
                WHERE uc.user_id = p_user_id
                  AND uc.role = 'accountant'
                  AND c.owner_id = p_user_id
                ORDER BY uc.is_default DESC, uc.created_at ASC
                LIMIT 1;

                IF v_accountant_company_id IS NOT NULL THEN
                    UPDATE public.companies
                    SET accountant_company_id = v_accountant_company_id
                    WHERE id = v_invitation.company_id
                      AND accountant_company_id IS NULL;
                END IF;
            END IF;
        END IF;

        UPDATE public.company_invitations
        SET accepted_at = now()
        WHERE id = v_invitation.id;
    END LOOP;
END;
$$;

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
    v_price_monthly numeric;
    v_price_yearly numeric;
    v_is_invited_member_accountant boolean := false;
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

    IF v_role = 'accountant' THEN
        SELECT EXISTS(
            SELECT 1
            FROM public.company_invitations
            WHERE lower(email) = lower(trim(NEW.email))
              AND accepted_at IS NULL
              AND expires_at > now()
              AND role = 'accountant'
              AND COALESCE(invitation_type, 'member') = 'member'
        )
        INTO v_is_invited_member_accountant;
    END IF;

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

    v_plan_slug := NEW.raw_user_meta_data->>'plan_slug';
    v_plan_id := NULL;
    v_price_monthly := NULL;
    v_price_yearly := NULL;

    IF NOT v_is_invited_member_accountant THEN
        IF v_plan_slug IS NOT NULL AND v_plan_slug != '' THEN
            SELECT id, price_monthly, price_yearly INTO v_plan_id, v_price_monthly, v_price_yearly
            FROM public.subscription_plans
            WHERE slug = v_plan_slug AND is_active = true;
        END IF;

        INSERT INTO public.subscriptions (user_id, plan_id, status)
        VALUES (NEW.id, v_plan_id,
            (CASE
                WHEN v_plan_id IS NOT NULL AND COALESCE(v_price_monthly, 0) = 0 AND COALESCE(v_price_yearly, 0) = 0 THEN 'active'
                ELSE 'incomplete'
            END)::subscription_status)
        ON CONFLICT (user_id) DO NOTHING;
    END IF;

    PERFORM public.accept_pending_invitations(NEW.id, NEW.email);

    RETURN NEW;
END;
$$;
