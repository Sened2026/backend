-- EXÉCUTER CE SCRIPT DANS L'ÉDITEUR SQL DE SUPABASE
-- Ce script expose les tables du schéma 'public' dans le schéma 'api' via des vues
-- Cela est nécessaire car votre instance Supabase n'expose que le schéma 'api'

CREATE SCHEMA IF NOT EXISTS api;

-- Accorder les permissions de base
GRANT USAGE ON SCHEMA api TO postgres,
anon,
authenticated,
service_role;

-- 1. SUBSCRIPTIONS
CREATE OR REPLACE VIEW api.subscriptions AS
SELECT *
FROM public.subscriptions;

ALTER VIEW api.subscriptions SET(security_invoker = on);
-- Respecte les politiques RLS de public.subscriptions
GRANT ALL ON api.subscriptions TO authenticated, service_role;

-- 2. SUBSCRIPTION PLANS
CREATE OR REPLACE VIEW api.subscription_plans AS
SELECT *
FROM public.subscription_plans;

ALTER VIEW api.subscription_plans SET(security_invoker = on);

GRANT
SELECT
    ON api.subscription_plans TO authenticated,
    service_role,
    anon;

-- 3. PROFILES
CREATE OR REPLACE VIEW api.profiles AS SELECT * FROM public.profiles;

ALTER VIEW api.profiles SET(security_invoker = on);

GRANT ALL ON api.profiles TO authenticated, service_role;

-- 4. COMPANIES
CREATE OR REPLACE VIEW api.companies AS
SELECT *
FROM public.companies;

ALTER VIEW api.companies SET(security_invoker = on);

GRANT ALL ON api.companies TO authenticated, service_role;

-- 5. USER_COMPANIES
CREATE OR REPLACE VIEW api.user_companies AS
SELECT *
FROM public.user_companies;

ALTER VIEW api.user_companies SET(security_invoker = on);

GRANT ALL ON api.user_companies TO authenticated, service_role;

-- NOTE: Si vous avez d'autres tables (quotes, invoices, etc.), ajoutez-les ici sur le même modèle.