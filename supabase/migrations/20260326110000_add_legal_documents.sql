-- Documents légaux versionnés pour la plateforme et les CGV d'entreprise

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.legal_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scope TEXT NOT NULL CHECK (scope IN ('platform', 'company')),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL CHECK (document_type IN ('platform_cgv', 'privacy_policy', 'legal_notice', 'sales_terms')),
    slug TEXT NOT NULL,
    title VARCHAR(255) NOT NULL,
    is_required BOOLEAN NOT NULL DEFAULT false,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    CONSTRAINT legal_documents_scope_company_check CHECK (
        (scope = 'platform' AND company_id IS NULL)
        OR (scope = 'company' AND company_id IS NOT NULL)
    ),
    CONSTRAINT legal_documents_company_doc_unique UNIQUE (scope, company_id, document_type)
);

CREATE UNIQUE INDEX IF NOT EXISTS legal_documents_platform_slug_idx
    ON public.legal_documents(slug)
    WHERE scope = 'platform';

CREATE UNIQUE INDEX IF NOT EXISTS legal_documents_platform_type_idx
    ON public.legal_documents(document_type)
    WHERE scope = 'platform';

CREATE INDEX IF NOT EXISTS legal_documents_company_id_idx
    ON public.legal_documents(company_id);

DROP TRIGGER IF EXISTS on_legal_documents_updated ON public.legal_documents;
CREATE TRIGGER on_legal_documents_updated
    BEFORE UPDATE ON public.legal_documents
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

CREATE TABLE IF NOT EXISTS public.legal_document_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legal_document_id UUID NOT NULL REFERENCES public.legal_documents(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL CHECK (version_number >= 1),
    title VARCHAR(255) NOT NULL,
    content_text TEXT NOT NULL,
    content_format TEXT NOT NULL DEFAULT 'plain_text' CHECK (content_format IN ('plain_text')),
    checksum_sha256 VARCHAR(64) NOT NULL,
    is_published BOOLEAN NOT NULL DEFAULT false,
    published_at TIMESTAMPTZ,
    source_kind TEXT NOT NULL DEFAULT 'manual' CHECK (source_kind IN ('manual', 'quote_snapshot')),
    quote_id UUID REFERENCES public.quotes(id) ON DELETE SET NULL,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    CONSTRAINT legal_document_versions_unique UNIQUE (legal_document_id, version_number)
);

CREATE INDEX IF NOT EXISTS legal_document_versions_legal_document_id_idx
    ON public.legal_document_versions(legal_document_id);

CREATE UNIQUE INDEX IF NOT EXISTS legal_document_versions_published_unique_idx
    ON public.legal_document_versions(legal_document_id)
    WHERE is_published = true;

DROP TRIGGER IF EXISTS on_legal_document_versions_updated ON public.legal_document_versions;
CREATE TRIGGER on_legal_document_versions_updated
    BEFORE UPDATE ON public.legal_document_versions
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

CREATE TABLE IF NOT EXISTS public.user_legal_acceptances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    legal_document_version_id UUID NOT NULL REFERENCES public.legal_document_versions(id) ON DELETE CASCADE,
    accepted_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    ip_address INET,
    user_agent TEXT,
    acceptance_source TEXT NOT NULL DEFAULT 'explicit' CHECK (acceptance_source IN ('explicit', 'signup_sync')),
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    CONSTRAINT user_legal_acceptances_unique UNIQUE (user_id, legal_document_version_id)
);

CREATE INDEX IF NOT EXISTS user_legal_acceptances_user_id_idx
    ON public.user_legal_acceptances(user_id);

CREATE INDEX IF NOT EXISTS user_legal_acceptances_version_id_idx
    ON public.user_legal_acceptances(legal_document_version_id);

ALTER TABLE public.quotes
    ADD COLUMN IF NOT EXISTS legal_document_version_id UUID REFERENCES public.legal_document_versions(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS legal_document_version_number INTEGER,
    ADD COLUMN IF NOT EXISTS terms_checksum_sha256 VARCHAR(64);

CREATE INDEX IF NOT EXISTS quotes_legal_document_version_id_idx
    ON public.quotes(legal_document_version_id);

ALTER TABLE public.quote_signatures
    ADD COLUMN IF NOT EXISTS accepted_legal_version_id UUID REFERENCES public.legal_document_versions(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS accepted_terms_snapshot TEXT,
    ADD COLUMN IF NOT EXISTS accepted_terms_checksum VARCHAR(64);

CREATE INDEX IF NOT EXISTS quote_signatures_accepted_legal_version_id_idx
    ON public.quote_signatures(accepted_legal_version_id);

-- Seed documents plateforme
INSERT INTO public.legal_documents (scope, company_id, document_type, slug, title, is_required)
SELECT 'platform', NULL, 'platform_cgv', 'cgv', 'Conditions générales de vente', true
WHERE NOT EXISTS (
    SELECT 1 FROM public.legal_documents WHERE scope = 'platform' AND document_type = 'platform_cgv'
);

INSERT INTO public.legal_documents (scope, company_id, document_type, slug, title, is_required)
SELECT 'platform', NULL, 'privacy_policy', 'confidentialite', 'Politique de confidentialité', true
WHERE NOT EXISTS (
    SELECT 1 FROM public.legal_documents WHERE scope = 'platform' AND document_type = 'privacy_policy'
);

INSERT INTO public.legal_documents (scope, company_id, document_type, slug, title, is_required)
SELECT 'platform', NULL, 'legal_notice', 'mentions-legales', 'Mentions légales', false
WHERE NOT EXISTS (
    SELECT 1 FROM public.legal_documents WHERE scope = 'platform' AND document_type = 'legal_notice'
);

INSERT INTO public.legal_document_versions (
    legal_document_id,
    version_number,
    title,
    content_text,
    checksum_sha256,
    is_published,
    published_at,
    source_kind
)
SELECT
    doc.id,
    1,
    doc.title,
    content.content_text,
    encode(extensions.digest(content.content_text, 'sha256'), 'hex'),
    true,
    TIMEZONE('utc', NOW()),
    'manual'
FROM public.legal_documents doc
CROSS JOIN LATERAL (
    SELECT CASE doc.document_type
        WHEN 'platform_cgv' THEN
$$SENED - Conditions générales de vente

1. Objet
Les présentes conditions générales de vente encadrent l'accès et l'utilisation du service SENED de gestion de devis, factures et abonnements professionnels.

2. Éditeur
Le service est édité par la société SENED. Les informations légales complètes figurent dans la page "Mentions légales".

3. Compte utilisateur
L'utilisateur s'engage à fournir des informations exactes, à préserver la confidentialité de ses accès et à ne pas détourner le service de son usage professionnel normal.

4. Abonnements et prix
Les tarifs applicables sont ceux affichés au moment de la souscription. Sauf mention contraire, les prix sont exprimés hors taxes. L'abonnement peut être mensuel ou annuel selon l'offre choisie.

5. Paiement
Le paiement est exigible selon les modalités proposées lors de la souscription. Tout incident de paiement peut entraîner la suspension de l'accès au service jusqu'à régularisation.

6. Disponibilité du service
SENED met en œuvre des moyens raisonnables pour assurer la disponibilité de la plateforme. Des interruptions temporaires peuvent survenir pour maintenance, sécurité ou évolution du service.

7. Données et confidentialité
Le traitement des données personnelles est décrit dans la Politique de confidentialité accessible sur la plateforme.

8. Propriété intellectuelle
Les éléments composant SENED restent la propriété exclusive de SENED ou de ses concédants. Aucun droit de propriété n'est transféré à l'utilisateur en dehors d'un droit d'usage du service.

9. Responsabilité
SENED répond de ses obligations dans la limite du droit applicable. L'utilisateur reste responsable des contenus, documents commerciaux et données saisis dans le service.

10. Résiliation
L'utilisateur peut mettre fin à son abonnement selon les modalités indiquées dans son espace. SENED peut suspendre ou résilier un compte en cas de manquement grave aux présentes conditions.

11. Droit applicable et litiges
Les présentes conditions sont soumises au droit français. En cas de litige, les parties rechercheront une solution amiable avant toute action contentieuse.$$::TEXT
        WHEN 'privacy_policy' THEN
$$SENED - Politique de confidentialité

1. Finalité
Cette politique décrit la manière dont SENED collecte, utilise et conserve les données personnelles nécessaires à la fourniture du service.

2. Données collectées
Nous pouvons traiter les données de compte, de facturation, d'identification, d'usage de la plateforme et les données nécessaires à l'émission de devis et factures.

3. Base légale
Les traitements sont réalisés notamment pour l'exécution du contrat, le respect des obligations légales et l'intérêt légitime lié à la sécurité et à l'amélioration du service.

4. Destinataires
Les données sont accessibles aux équipes habilitées de SENED et aux sous-traitants strictement nécessaires à l'exploitation du service, dans la limite de leurs missions.

5. Durée de conservation
Les données sont conservées pendant la durée nécessaire à la relation contractuelle puis pendant les durées légales applicables.

6. Sécurité
SENED met en œuvre des mesures techniques et organisationnelles raisonnables pour protéger les données contre l'accès non autorisé, la perte ou l'altération.

7. Droits des personnes
Conformément à la réglementation applicable, toute personne concernée peut exercer ses droits d'accès, rectification, suppression, limitation, opposition et portabilité lorsque ces droits sont ouverts.

8. Contact
Pour toute question relative aux données personnelles, l'utilisateur peut contacter SENED via les coordonnées indiquées dans les Mentions légales.$$::TEXT
        WHEN 'legal_notice' THEN
$$SENED - Mentions légales

Éditeur du site
SENED
Adresse : à compléter
Email : contact@sened.fr

Directeur de la publication
À compléter

Hébergeur
À compléter

Propriété intellectuelle
L'ensemble du site, de ses contenus et de son identité visuelle est protégé par le droit applicable.

Contact
Pour toute demande, utilisez l'adresse de contact publiée sur la plateforme.$$::TEXT
    END AS content_text
) AS content
WHERE doc.scope = 'platform'
  AND NOT EXISTS (
      SELECT 1
      FROM public.legal_document_versions version
      WHERE version.legal_document_id = doc.id
  );

-- Migration des CGV d'entreprise existantes vers le nouveau modèle
INSERT INTO public.legal_documents (
    scope,
    company_id,
    document_type,
    slug,
    title,
    is_required,
    created_by,
    updated_by
)
SELECT
    'company',
    company.id,
    'sales_terms',
    'sales-terms-' || company.id::TEXT,
    'Conditions générales de vente',
    true,
    company.owner_id,
    company.owner_id
FROM public.companies company
WHERE COALESCE(NULLIF(BTRIM(company.terms_and_conditions), ''), NULL) IS NOT NULL
ON CONFLICT ON CONSTRAINT legal_documents_company_doc_unique DO NOTHING;

INSERT INTO public.legal_document_versions (
    legal_document_id,
    version_number,
    title,
    content_text,
    checksum_sha256,
    is_published,
    published_at,
    source_kind,
    created_by
)
SELECT
    doc.id,
    1,
    doc.title,
    company.terms_and_conditions,
    encode(extensions.digest(company.terms_and_conditions, 'sha256'), 'hex'),
    true,
    TIMEZONE('utc', NOW()),
    'manual',
    company.owner_id
FROM public.legal_documents doc
JOIN public.companies company
    ON company.id = doc.company_id
WHERE doc.scope = 'company'
  AND doc.document_type = 'sales_terms'
  AND COALESCE(NULLIF(BTRIM(company.terms_and_conditions), ''), NULL) IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM public.legal_document_versions version
      WHERE version.legal_document_id = doc.id
  );

UPDATE public.quotes quote
SET
    legal_document_version_id = version.id,
    legal_document_version_number = version.version_number,
    terms_checksum_sha256 = version.checksum_sha256
FROM public.legal_documents doc
JOIN public.legal_document_versions version
    ON version.legal_document_id = doc.id
   AND version.is_published = true
WHERE quote.company_id = doc.company_id
  AND doc.scope = 'company'
  AND doc.document_type = 'sales_terms'
  AND COALESCE(NULLIF(BTRIM(quote.terms_and_conditions), ''), NULL) = COALESCE(NULLIF(BTRIM(version.content_text), ''), NULL)
  AND quote.legal_document_version_id IS NULL;

UPDATE public.quote_signatures signature
SET
    accepted_legal_version_id = quote.legal_document_version_id,
    accepted_terms_snapshot = quote.terms_and_conditions,
    accepted_terms_checksum = quote.terms_checksum_sha256
FROM public.quotes quote
WHERE quote.id = signature.quote_id
  AND signature.accepted_legal_version_id IS NULL;
