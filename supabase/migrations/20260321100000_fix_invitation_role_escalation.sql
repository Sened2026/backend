-- Fix: Faille d'escalade de rôle lors de l'inscription par invitation
-- Corrige accept_pending_invitations() pour forcer le rôle de l'invitation
-- même si le trigger handle_new_user() a déjà inséré un mauvais rôle

CREATE OR REPLACE FUNCTION public.accept_pending_invitations(p_user_id uuid, p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_invitation RECORD;
    v_email_normalized text;
BEGIN
    v_email_normalized := lower(trim(p_email));

    FOR v_invitation IN
        SELECT id, company_id, role
        FROM public.company_invitations
        WHERE lower(email) = v_email_normalized
          AND accepted_at IS NULL
          AND expires_at > now()
    LOOP
        INSERT INTO public.user_companies (user_id, company_id, role, is_default)
        VALUES (p_user_id, v_invitation.company_id, v_invitation.role, false)
        ON CONFLICT (user_id, company_id) DO UPDATE SET role = EXCLUDED.role;

        UPDATE public.company_invitations
        SET accepted_at = now()
        WHERE id = v_invitation.id;
    END LOOP;
END;
$$;
