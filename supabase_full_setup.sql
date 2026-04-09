-- SCRIPT COMPLET DE RÉPARATION SUPABASE
-- À exécuter dans l'éditeur SQL de Supabase
-- Pour un bootstrap fidèle de l'application, la source de vérité reste
-- l'historique des migrations dans `supabase/migrations`.

-- 0. Extensions nécessaires
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Configuration du Schéma API (Pour que le backend puisse accéder aux données)
CREATE SCHEMA IF NOT EXISTS api;

GRANT USAGE ON SCHEMA api TO postgres,
anon,
authenticated,
service_role;

-- 2. Création de la table profiles si elle n'existe pas
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email TEXT,
    first_name TEXT,
    last_name TEXT,
    phone TEXT,
    address TEXT,
    avatar_url TEXT,
    signature_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
-- RLS pour profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF to_regclass('public.companies') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES public.profiles(id) ON DELETE RESTRICT';
    EXECUTE 'CREATE INDEX IF NOT EXISTS companies_owner_id_idx ON public.companies(owner_id)';
  END IF;
END $$;

CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles FOR
SELECT USING (true);

CREATE POLICY "Users can insert their own profile" ON public.profiles FOR
INSERT
WITH
    CHECK (auth.uid () = id);

CREATE POLICY "Users can update their own profile" ON public.profiles FOR
UPDATE USING (auth.uid () = id);

-- 3. Trigger pour création automatique du profil à l'inscription
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_company_id UUID;
  v_siret text;
  v_siren text;
  v_company_name text;
  v_address text;
  v_postal_code text;
  v_city text;
  v_country text;
  v_accountant_siren text;
  v_accountant_company_id uuid;
  v_plan_slug text;
  v_plan_id UUID;
  v_first_name text;
  v_last_name text;
  v_phone text;
  v_role_text text;
BEGIN
  v_first_name := NEW.raw_user_meta_data->>'first_name';
  v_last_name := NEW.raw_user_meta_data->>'last_name';
  v_phone := NEW.raw_user_meta_data->>'phone';

  INSERT INTO public.profiles (id, email, first_name, last_name, phone, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(v_first_name, ''),
    COALESCE(v_last_name, ''),
    v_phone,
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    first_name = COALESCE(EXCLUDED.first_name, profiles.first_name),
    last_name = COALESCE(EXCLUDED.last_name, profiles.last_name),
    phone = COALESCE(EXCLUDED.phone, profiles.phone),
    avatar_url = COALESCE(EXCLUDED.avatar_url, profiles.avatar_url);

  v_siret := NEW.raw_user_meta_data->>'siret';
  v_siren := NEW.raw_user_meta_data->>'siren';
  v_company_name := NEW.raw_user_meta_data->>'company_name';
  v_address := NEW.raw_user_meta_data->>'address';
  v_postal_code := NEW.raw_user_meta_data->>'postal_code';
  v_city := NEW.raw_user_meta_data->>'city';
  v_country := COALESCE(NEW.raw_user_meta_data->>'country', 'FR');
  v_accountant_siren := NULLIF(
    regexp_replace(COALESCE(NEW.raw_user_meta_data->>'accountant_siren', ''), '\D', '', 'g'),
    ''
  );
  v_plan_slug := NEW.raw_user_meta_data->>'plan_slug';
  v_role_text := COALESCE(NEW.raw_user_meta_data->>'role', 'merchant_admin');

  IF v_role_text NOT IN ('merchant_admin', 'merchant_consultant', 'accountant', 'accountant_consultant', 'superadmin') THEN
    v_role_text := 'merchant_admin';
  END IF;

  IF to_regclass('public.companies') IS NOT NULL
     AND to_regclass('public.user_companies') IS NOT NULL
     AND v_role_text IN ('merchant_admin', 'accountant')
     AND v_company_name IS NOT NULL
     AND v_company_name != '' THEN
    INSERT INTO public.companies (name, siren, address, postal_code, city, country, owner_id)
    VALUES (v_company_name, COALESCE(v_siren, LEFT(v_siret, 9)), v_address, v_postal_code, v_city, v_country, NEW.id)
    RETURNING id INTO v_company_id;

    INSERT INTO public.user_companies (user_id, company_id, role, is_default)
    VALUES (NEW.id, v_company_id, v_role_text, true);

    IF to_regclass('public.units') IS NOT NULL THEN
      INSERT INTO public.units (company_id, name, abbreviation)
      VALUES
        (v_company_id, 'Heure', 'h'),
        (v_company_id, 'Jour', 'j'),
        (v_company_id, 'Unité', 'u'),
        (v_company_id, 'Forfait', 'forf.'),
        (v_company_id, 'Mètre', 'm'),
        (v_company_id, 'Mètre carré', 'm²'),
        (v_company_id, 'Kilogramme', 'kg'),
        (v_company_id, 'Litre', 'L');
    END IF;

    IF to_regclass('public.document_settings') IS NOT NULL THEN
      INSERT INTO public.document_settings (company_id)
      VALUES (v_company_id)
      ON CONFLICT (company_id) DO NOTHING;
    END IF;

    IF v_role_text = 'merchant_admin'
       AND v_accountant_siren IS NOT NULL
       AND char_length(v_accountant_siren) = 9 THEN
      SELECT c.id
      INTO v_accountant_company_id
      FROM public.companies c
      WHERE c.siren = v_accountant_siren
        AND EXISTS (
          SELECT 1
          FROM public.user_companies uc
          WHERE uc.company_id = c.id
            AND uc.role = 'accountant'
        )
      ORDER BY c.created_at ASC, c.id ASC
      LIMIT 1;

      IF v_accountant_company_id IS NOT NULL THEN
        UPDATE public.companies
        SET accountant_company_id = v_accountant_company_id
        WHERE id = v_company_id;
      END IF;
    END IF;

    IF v_plan_slug IS NOT NULL AND v_plan_slug != '' THEN
      SELECT id INTO v_plan_id FROM public.subscription_plans WHERE slug = v_plan_slug LIMIT 1;
    END IF;
  END IF;

  IF v_plan_id IS NULL AND to_regclass('public.subscription_plans') IS NOT NULL THEN
    SELECT id INTO v_plan_id FROM public.subscription_plans WHERE slug = 'free' LIMIT 1;
  END IF;

  IF v_plan_id IS NOT NULL AND to_regclass('public.subscriptions') IS NOT NULL THEN
    INSERT INTO public.subscriptions (user_id, plan_id, status)
    VALUES (NEW.id, v_plan_id, 'active')
    ON CONFLICT (user_id) DO UPDATE SET
      plan_id = EXCLUDED.plan_id;
  END IF;

  IF to_regprocedure('public.accept_pending_invitations(uuid,text)') IS NOT NULL THEN
    PERFORM public.accept_pending_invitations(NEW.id, NEW.email);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 4. RATTRAPAGE (Backfill) : Créer les profils manquants pour les utilisateurs existants
INSERT INTO
    public.profiles (id, email)
SELECT id, email
FROM auth.users
WHERE
    id NOT IN(
        SELECT id
        FROM public.profiles
    );

-- 5. Exposition des tables 'public' dans le schéma 'api' (Vues)
-- Profiles
CREATE OR REPLACE VIEW api.profiles AS SELECT * FROM public.profiles;

ALTER VIEW api.profiles SET(security_invoker = on);

GRANT ALL ON api.profiles TO authenticated, service_role;

-- Subscriptions (Table + Vue)
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    plan_id UUID REFERENCES public.subscription_plans(id),
    status TEXT,
    current_period_end TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE OR REPLACE VIEW api.subscriptions AS
SELECT *
FROM public.subscriptions;

ALTER VIEW api.subscriptions SET(security_invoker = on);

GRANT ALL ON api.subscriptions TO authenticated, service_role;

-- Subscription Plans (Table + Vue)
CREATE TABLE IF NOT EXISTS public.subscription_plans (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    price_monthly NUMERIC,
    price_yearly NUMERIC,
    max_companies INTEGER,
    max_quotes_per_month INTEGER,
    max_storage_mb INTEGER,
    features JSONB,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE OR REPLACE VIEW api.subscription_plans AS
SELECT *
FROM public.subscription_plans;

ALTER VIEW api.subscription_plans SET(security_invoker = on);

GRANT
SELECT
    ON api.subscription_plans TO authenticated,
    service_role,
    anon;

-- Companies (Vue)
CREATE OR REPLACE VIEW api.companies AS
SELECT *
FROM public.companies;

ALTER VIEW api.companies SET(security_invoker = on);

GRANT ALL ON api.companies TO authenticated, service_role;

-- User Companies (Vue)
CREATE OR REPLACE VIEW api.user_companies AS
SELECT *
FROM public.user_companies;

ALTER VIEW api.user_companies SET(security_invoker = on);

GRANT ALL ON api.user_companies TO authenticated, service_role;

-- Insertion des plans par défaut si vide
INSERT INTO public.subscription_plans (name, slug, price_monthly, max_companies, max_storage_mb, features)
SELECT 'Free', 'free', 0, 1, 100, '["Devis illimités", "1 Entreprise"]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.subscription_plans WHERE slug = 'free');

INSERT INTO public.subscription_plans (name, slug, price_monthly, max_companies, max_storage_mb, features)
SELECT 'Pro', 'pro', 29, 5, 5000, '["Multi-entreprises", "Support prioritaire"]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.subscription_plans WHERE slug = 'pro');
