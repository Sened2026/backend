BEGIN;

-- Nettoie les catégories dupliquées par entreprise en ignorant la casse et les espaces.
WITH normalized_categories AS (
    SELECT
        id,
        company_id,
        lower(btrim(name)) AS normalized_name,
        first_value(id) OVER (
            PARTITION BY company_id, lower(btrim(name))
            ORDER BY created_at ASC, id ASC
        ) AS canonical_id,
        row_number() OVER (
            PARTITION BY company_id, lower(btrim(name))
            ORDER BY created_at ASC, id ASC
        ) AS row_number
    FROM public.product_categories
),
duplicate_categories AS (
    SELECT id AS duplicate_id, canonical_id
    FROM normalized_categories
    WHERE row_number > 1
)
UPDATE public.products AS products
SET category_id = duplicate_categories.canonical_id
FROM duplicate_categories
WHERE products.category_id = duplicate_categories.duplicate_id
  AND products.category_id IS DISTINCT FROM duplicate_categories.canonical_id;

DELETE FROM public.product_categories AS categories
USING (
    SELECT duplicate_id
    FROM (
        SELECT
            id AS duplicate_id,
            row_number() OVER (
                PARTITION BY company_id, lower(btrim(name))
                ORDER BY created_at ASC, id ASC
            ) AS row_number
        FROM public.product_categories
    ) AS ranked_categories
    WHERE row_number > 1
) AS duplicate_categories
WHERE categories.id = duplicate_categories.duplicate_id;

UPDATE public.product_categories
SET name = btrim(name)
WHERE name IS DISTINCT FROM btrim(name);

ALTER TABLE public.product_categories
DROP CONSTRAINT IF EXISTS product_categories_company_id_name_key;

DROP INDEX IF EXISTS public.product_categories_company_id_normalized_name_idx;

CREATE UNIQUE INDEX product_categories_company_id_normalized_name_idx
ON public.product_categories (company_id, lower(btrim(name)));

COMMIT;
