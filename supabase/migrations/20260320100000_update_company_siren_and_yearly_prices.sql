-- Migrate company identifier from SIRET to SIREN
ALTER TABLE public.companies RENAME COLUMN siret TO siren;

-- Convert existing values: when a 14-digit SIRET is stored, keep the first 9 digits (SIREN)
UPDATE public.companies
SET siren = LEFT(siren, 9)
WHERE siren IS NOT NULL
  AND LENGTH(siren) = 14;

ALTER TABLE public.companies
    ALTER COLUMN siren TYPE VARCHAR(9);

DROP INDEX IF EXISTS companies_siret_idx;
CREATE INDEX IF NOT EXISTS companies_siren_idx ON public.companies (siren);

-- Update annual prices for active plans
UPDATE public.subscription_plans
SET price_yearly = CASE slug
    WHEN 'essentiel' THEN 99
    WHEN 'business' THEN 129
    WHEN 'premium' THEN 249
    ELSE price_yearly
END
WHERE slug IN ('essentiel', 'business', 'premium');
