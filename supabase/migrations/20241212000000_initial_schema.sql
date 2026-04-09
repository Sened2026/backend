-- ============================================
-- MIGRATION CONSOLIDEE : Schema complet
-- Application Devis/Factures
-- ============================================
-- Date: 2024-12-12 (consolidee le 2026-03-18)
-- Description: Schema final unique regroupant toutes les migrations
-- ============================================

-- Extension requise pour gen_random_bytes() (utilisee par company_invitations)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================
-- A. TYPES ENUM (etat final)
-- ============================================

CREATE TYPE subscription_status AS ENUM ('active', 'canceled', 'past_due', 'trialing', 'incomplete');

CREATE TYPE company_role AS ENUM (
    'merchant_admin',
    'merchant_consultant',
    'accountant',
    'accountant_consultant',
    'superadmin'
);

CREATE TYPE client_type AS ENUM ('individual', 'professional');

CREATE TYPE document_type AS ENUM ('quote', 'invoice', 'credit_note');

CREATE TYPE quote_status AS ENUM ('draft', 'sent', 'accepted', 'refused', 'expired', 'viewed', 'converted');

CREATE TYPE invoice_status AS ENUM ('draft', 'sent', 'paid', 'overdue', 'cancelled', 'partial', 'signed', 'rejected', 'suspended');

CREATE TYPE discount_type AS ENUM ('percentage', 'fixed');

CREATE TYPE storage_document_type AS ENUM ('quote_pdf', 'invoice_pdf', 'signature', 'logo', 'attachment', 'avatar');

CREATE TYPE invoice_type AS ENUM ('standard', 'deposit', 'final', 'credit_note');

CREATE TYPE facturx_profile AS ENUM ('minimum', 'basic', 'en16931');

CREATE TYPE payment_method AS ENUM ('stripe', 'bank_transfer', 'cash', 'check', 'other');

-- ============================================
-- B. FUNCTIONS utilitaires
-- ============================================

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc', NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- C. TABLES (etat final)
-- ============================================

-- profiles
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL UNIQUE,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    phone VARCHAR(20),
    address TEXT,
    avatar_url TEXT,
    signature_url TEXT,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

CREATE INDEX profiles_email_idx ON public.profiles (email);

CREATE TRIGGER on_profiles_updated
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- subscription_plans
CREATE TABLE public.subscription_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL,
    slug VARCHAR(50) NOT NULL UNIQUE,
    price_monthly DECIMAL(10, 2) NOT NULL DEFAULT 0,
    price_yearly DECIMAL(10, 2) NOT NULL DEFAULT 0,
    max_companies INTEGER,
    max_quotes_per_month INTEGER,
    max_invoices_per_month INTEGER,
    max_members INTEGER,
    max_storage_mb INTEGER NOT NULL DEFAULT 100,
    features JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    stripe_price_id TEXT,
    stripe_lookup_key_monthly TEXT,
    stripe_lookup_key_yearly TEXT,
    price_per_additional_member DECIMAL(10, 2) DEFAULT 0,
    stripe_member_lookup_key TEXT,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

-- subscriptions
CREATE TABLE public.subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
    plan_id UUID REFERENCES public.subscription_plans (id),
    stripe_customer_id VARCHAR(255),
    stripe_subscription_id VARCHAR(255),
    status subscription_status NOT NULL DEFAULT 'active',
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN DEFAULT false,
    extra_members_quantity INTEGER DEFAULT 0,
    stripe_member_item_id TEXT,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    UNIQUE (user_id)
);

CREATE INDEX subscriptions_user_id_idx ON public.subscriptions (user_id);
CREATE INDEX subscriptions_stripe_customer_id_idx ON public.subscriptions (stripe_customer_id);

CREATE TRIGGER on_subscriptions_updated
    BEFORE UPDATE ON public.subscriptions
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- companies
CREATE TABLE public.companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    legal_name VARCHAR(255),
    siret VARCHAR(14),
    vat_number VARCHAR(20),
    address TEXT,
    city VARCHAR(100),
    postal_code VARCHAR(10),
    country VARCHAR(2) DEFAULT 'FR',
    phone VARCHAR(20),
    email VARCHAR(255),
    website VARCHAR(255),
    logo_url TEXT,
    rib_iban VARCHAR(34),
    rib_bic VARCHAR(11),
    rib_bank_name VARCHAR(100),
    default_vat_rate DECIMAL(5, 2) DEFAULT 20.00,
    default_payment_terms INTEGER DEFAULT 30,
    terms_and_conditions TEXT,
    quote_validity_days INTEGER DEFAULT 30,
    quote_footer TEXT,
    invoice_footer TEXT,
    stripe_account_id VARCHAR(255),
    stripe_onboarding_completed BOOLEAN DEFAULT false,
    accountant_company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
    owner_id UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

CREATE INDEX companies_siret_idx ON public.companies (siret);
CREATE INDEX idx_companies_accountant_company_id ON public.companies(accountant_company_id) WHERE accountant_company_id IS NOT NULL;
CREATE INDEX companies_owner_id_idx ON public.companies(owner_id);

CREATE TRIGGER on_companies_updated
    BEFORE UPDATE ON public.companies
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- user_companies
CREATE TABLE public.user_companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
    role company_role NOT NULL DEFAULT 'merchant_consultant',
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    UNIQUE (user_id, company_id)
);

CREATE INDEX user_companies_user_id_idx ON public.user_companies (user_id);
CREATE INDEX user_companies_company_id_idx ON public.user_companies (company_id);

-- units
CREATE TABLE public.units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL,
    abbreviation VARCHAR(10) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    UNIQUE (company_id, abbreviation)
);

CREATE INDEX units_company_id_idx ON public.units (company_id);

-- product_categories
CREATE TABLE public.product_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    color VARCHAR(7) DEFAULT '#6366f1',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, name)
);

CREATE INDEX idx_product_categories_company_id ON public.product_categories(company_id);
CREATE INDEX idx_product_categories_name ON public.product_categories(name);

CREATE OR REPLACE FUNCTION update_product_categories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_product_categories_updated_at
    BEFORE UPDATE ON public.product_categories
    FOR EACH ROW EXECUTE FUNCTION update_product_categories_updated_at();

-- products
CREATE TABLE public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
    reference VARCHAR(50),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    unit_id UUID REFERENCES public.units (id) ON DELETE SET NULL,
    unit_price DECIMAL(12, 2) NOT NULL DEFAULT 0,
    vat_rate DECIMAL(5, 2) DEFAULT 20.00,
    category_id UUID REFERENCES public.product_categories(id) ON DELETE SET NULL,
    has_multi_tax BOOLEAN DEFAULT false,
    tax_lines JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

CREATE INDEX products_company_id_idx ON public.products (company_id);
CREATE INDEX products_reference_idx ON public.products (company_id, reference);
CREATE INDEX idx_products_category_id ON public.products(category_id);

CREATE TRIGGER on_products_updated
    BEFORE UPDATE ON public.products
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- clients
CREATE TABLE public.clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
    type client_type NOT NULL DEFAULT 'individual',
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    company_name VARCHAR(255),
    siret VARCHAR(14),
    siren VARCHAR(9),
    vat_number VARCHAR(20),
    email VARCHAR(255),
    phone VARCHAR(20),
    address TEXT,
    city VARCHAR(100),
    postal_code VARCHAR(10),
    country VARCHAR(2) DEFAULT 'FR',
    notes TEXT,
    stripe_customer_id VARCHAR(255),
    chorus_pro_code_destinataire VARCHAR(50),
    chorus_pro_cadre_facturation VARCHAR(50) DEFAULT 'A1_FACTURE_FOURNISSEUR',
    chorus_pro_code_service_executant VARCHAR(50),
    chorus_pro_numero_engagement VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

CREATE INDEX clients_company_id_idx ON public.clients (company_id);
CREATE INDEX clients_email_idx ON public.clients (email);
CREATE INDEX clients_siren_idx ON public.clients (siren);
CREATE INDEX clients_siret_idx ON public.clients (siret);

CREATE TRIGGER on_clients_updated
    BEFORE UPDATE ON public.clients
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- document_sequences
CREATE TABLE public.document_sequences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
    type document_type NOT NULL,
    year INTEGER NOT NULL,
    last_number INTEGER NOT NULL DEFAULT 0,
    prefix VARCHAR(10) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    UNIQUE (company_id, type, year)
);

-- generate_document_number (avec credit_note)
CREATE OR REPLACE FUNCTION public.generate_document_number(
    p_company_id UUID,
    p_type document_type
)
RETURNS VARCHAR(50) AS $$
DECLARE
    v_year INTEGER;
    v_prefix VARCHAR(10);
    v_next_number INTEGER;
    v_result VARCHAR(50);
BEGIN
    v_year := EXTRACT(YEAR FROM CURRENT_DATE);

    IF p_type = 'quote' THEN
        v_prefix := 'DEV';
    ELSIF p_type = 'credit_note' THEN
        v_prefix := 'AV';
    ELSE
        v_prefix := 'FAC';
    END IF;

    INSERT INTO public.document_sequences (company_id, type, year, last_number, prefix)
    VALUES (p_company_id, p_type, v_year, 1, v_prefix)
    ON CONFLICT (company_id, type, year)
    DO UPDATE SET
        last_number = document_sequences.last_number + 1,
        updated_at = TIMEZONE('utc', NOW())
    RETURNING last_number INTO v_next_number;

    v_result := v_prefix || '-' || v_year || '-' || LPAD(v_next_number::TEXT, 4, '0');

    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- quotes
CREATE TABLE public.quotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES public.clients (id) ON DELETE RESTRICT,
    created_by UUID NOT NULL REFERENCES public.profiles (id),
    quote_number VARCHAR(50) NOT NULL,
    status quote_status NOT NULL DEFAULT 'draft',
    title VARCHAR(255),
    subject TEXT,
    introduction TEXT,
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    validity_date DATE NOT NULL,
    subtotal DECIMAL(12, 2) NOT NULL DEFAULT 0,
    total_vat DECIMAL(12, 2) NOT NULL DEFAULT 0,
    total DECIMAL(12, 2) NOT NULL DEFAULT 0,
    discount_type discount_type,
    discount_value DECIMAL(12, 2) DEFAULT 0,
    notes TEXT,
    terms TEXT,
    terms_and_conditions TEXT,
    pdf_url TEXT,
    signature_token UUID DEFAULT gen_random_uuid(),
    signature_token_expires_at TIMESTAMPTZ,
    signed_at TIMESTAMPTZ,
    signature_checkbox BOOLEAN DEFAULT false,
    signer_name VARCHAR(255),
    signer_ip INET,
    converted_to_invoice_id UUID,
    viewed_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    refused_at TIMESTAMPTZ,
    refusal_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    UNIQUE (company_id, quote_number)
);

CREATE INDEX quotes_company_id_idx ON public.quotes (company_id);
CREATE INDEX quotes_client_id_idx ON public.quotes (client_id);
CREATE INDEX quotes_status_idx ON public.quotes (status);
CREATE INDEX quotes_signature_token_idx ON public.quotes (signature_token);
CREATE INDEX quotes_converted_invoice_idx ON public.quotes(converted_to_invoice_id);

CREATE TRIGGER on_quotes_updated
    BEFORE UPDATE ON public.quotes
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- quote_items
CREATE TABLE public.quote_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_id UUID NOT NULL REFERENCES public.quotes (id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products (id) ON DELETE SET NULL,
    position INTEGER NOT NULL DEFAULT 0,
    reference VARCHAR(50),
    description TEXT NOT NULL,
    quantity DECIMAL(12, 3) NOT NULL DEFAULT 1,
    unit VARCHAR(50),
    unit_price DECIMAL(12, 2) NOT NULL DEFAULT 0,
    vat_rate DECIMAL(5, 2) NOT NULL DEFAULT 20.00,
    discount_type discount_type,
    discount_value DECIMAL(12, 2) DEFAULT 0,
    line_total DECIMAL(12, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

CREATE INDEX quote_items_quote_id_idx ON public.quote_items (quote_id);

-- quote_signatures (signature_image_url nullable)
CREATE TABLE public.quote_signatures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_id UUID NOT NULL REFERENCES public.quotes (id) ON DELETE CASCADE UNIQUE,
    signer_name VARCHAR(255) NOT NULL,
    signer_email VARCHAR(255) NOT NULL,
    signature_image_url TEXT,
    signed_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    ip_address INET NOT NULL,
    user_agent TEXT,
    document_hash VARCHAR(64) NOT NULL,
    consent_text TEXT NOT NULL,
    consent_accepted BOOLEAN NOT NULL DEFAULT true,
    certified_at TIMESTAMPTZ,
    certification_reference VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

CREATE INDEX quote_signatures_quote_id_idx ON public.quote_signatures (quote_id);

-- invoices
CREATE TABLE public.invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES public.clients (id) ON DELETE RESTRICT,
    quote_id UUID REFERENCES public.quotes (id) ON DELETE SET NULL,
    created_by UUID NOT NULL REFERENCES public.profiles (id),
    invoice_number VARCHAR(50) NOT NULL,
    status invoice_status NOT NULL DEFAULT 'draft',
    type invoice_type DEFAULT 'standard',
    parent_invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
    title VARCHAR(255),
    subject TEXT,
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE NOT NULL,
    subtotal DECIMAL(12, 2) NOT NULL DEFAULT 0,
    total_vat DECIMAL(12, 2) NOT NULL DEFAULT 0,
    total DECIMAL(12, 2) NOT NULL DEFAULT 0,
    discount_type discount_type,
    discount_value DECIMAL(12, 2) DEFAULT 0,
    amount_paid DECIMAL(12, 2) DEFAULT 0,
    notes TEXT,
    footer TEXT,
    terms_and_conditions TEXT,
    payment_method VARCHAR(50),
    pdf_url TEXT,
    stripe_payment_intent_id VARCHAR(255),
    stripe_payment_link_id VARCHAR(255),
    stripe_payment_link_url TEXT,
    paid_at TIMESTAMPTZ,
    signed_at TIMESTAMPTZ,
    signature_checkbox BOOLEAN DEFAULT false,
    signer_name VARCHAR(255),
    signer_ip INET,
    signature_token UUID DEFAULT gen_random_uuid(),
    signature_token_expires_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    viewed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    cancellation_reason TEXT,
    facturx_profile facturx_profile DEFAULT 'minimum',
    facturx_xml TEXT,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    UNIQUE (company_id, invoice_number)
);

CREATE INDEX invoices_company_id_idx ON public.invoices (company_id);
CREATE INDEX invoices_client_id_idx ON public.invoices (client_id);
CREATE INDEX invoices_quote_id_idx ON public.invoices (quote_id);
CREATE INDEX invoices_status_idx ON public.invoices (status);
CREATE INDEX invoices_parent_invoice_idx ON public.invoices(parent_invoice_id);
CREATE INDEX invoices_due_date_idx ON public.invoices(due_date);
CREATE INDEX invoices_signature_token_idx ON public.invoices(signature_token);
CREATE INDEX invoices_stripe_payment_intent_idx ON public.invoices(stripe_payment_intent_id);

CREATE TRIGGER on_invoices_updated
    BEFORE UPDATE ON public.invoices
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- invoice_items
CREATE TABLE public.invoice_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES public.invoices (id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products (id) ON DELETE SET NULL,
    position INTEGER NOT NULL DEFAULT 0,
    reference VARCHAR(50),
    description TEXT NOT NULL,
    quantity DECIMAL(12, 3) NOT NULL DEFAULT 1,
    unit VARCHAR(50),
    unit_price DECIMAL(12, 2) NOT NULL DEFAULT 0,
    vat_rate DECIMAL(5, 2) NOT NULL DEFAULT 20.00,
    discount_type discount_type,
    discount_value DECIMAL(12, 2) DEFAULT 0,
    line_total DECIMAL(12, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

CREATE INDEX invoice_items_invoice_id_idx ON public.invoice_items (invoice_id);

-- invoice_signatures
CREATE TABLE public.invoice_signatures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE UNIQUE,
    signer_name VARCHAR(255) NOT NULL,
    signer_email VARCHAR(255) NOT NULL,
    signed_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    ip_address INET NOT NULL,
    user_agent TEXT,
    document_hash VARCHAR(64) NOT NULL,
    consent_text TEXT NOT NULL DEFAULT 'Je reconnais avoir lu et accepte les conditions de cette facture et m''engage a proceder au paiement.',
    consent_accepted BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

CREATE INDEX invoice_signatures_invoice_id_idx ON public.invoice_signatures(invoice_id);

-- documents
CREATE TABLE public.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies (id) ON DELETE CASCADE,
    uploaded_by UUID NOT NULL REFERENCES public.profiles (id),
    type storage_document_type NOT NULL,
    related_type VARCHAR(50),
    related_id UUID,
    filename VARCHAR(255) NOT NULL,
    storage_path TEXT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    size_bytes BIGINT NOT NULL,
    expires_at TIMESTAMPTZ DEFAULT (TIMEZONE('utc', NOW()) + INTERVAL '10 years'),
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

CREATE INDEX documents_company_id_idx ON public.documents (company_id);
CREATE INDEX documents_uploaded_by_idx ON public.documents (uploaded_by);
CREATE INDEX documents_related_idx ON public.documents (related_type, related_id);

-- payments
CREATE TABLE public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    amount DECIMAL(12,2) NOT NULL,
    payment_method payment_method NOT NULL,
    stripe_payment_id VARCHAR(255),
    stripe_charge_id VARCHAR(255),
    reference VARCHAR(255),
    paid_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    notes TEXT,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

CREATE INDEX payments_invoice_id_idx ON public.payments(invoice_id);
CREATE INDEX payments_stripe_payment_id_idx ON public.payments(stripe_payment_id);
CREATE INDEX payments_paid_at_idx ON public.payments(paid_at);

-- document_settings
CREATE TABLE public.document_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE UNIQUE,
    quote_prefix VARCHAR(10) DEFAULT 'DEV',
    invoice_prefix VARCHAR(10) DEFAULT 'FAC',
    credit_note_prefix VARCHAR(10) DEFAULT 'AV',
    facturx_profile facturx_profile DEFAULT 'minimum',
    default_quote_validity_days INTEGER DEFAULT 30,
    default_payment_delay_days INTEGER DEFAULT 30,
    quote_terms TEXT,
    invoice_terms TEXT,
    quote_footer TEXT,
    invoice_footer TEXT,
    primary_color VARCHAR(7) DEFAULT '#000000',
    logo_position VARCHAR(20) DEFAULT 'left',
    show_payment_qr_code BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

CREATE INDEX document_settings_company_id_idx ON public.document_settings(company_id);

CREATE TRIGGER on_document_settings_updated
    BEFORE UPDATE ON public.document_settings
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- reminder_settings
CREATE TABLE public.reminder_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    enabled BOOLEAN DEFAULT true,
    invoice_rules JSONB DEFAULT '[
        {"days_offset": -7, "channel": "email"},
        {"days_offset": -3, "channel": "email"},
        {"days_offset": -1, "channel": "both"},
        {"days_offset": 1, "channel": "email"},
        {"days_offset": 7, "channel": "both"},
        {"days_offset": 14, "channel": "both"},
        {"days_offset": 30, "channel": "email"}
    ]'::jsonb,
    quote_rules JSONB DEFAULT '[
        {"days_offset": -3, "channel": "email"},
        {"days_offset": -1, "channel": "email"}
    ]'::jsonb,
    sender_email TEXT,
    sender_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id)
);

CREATE INDEX idx_reminder_settings_company ON public.reminder_settings(company_id);

CREATE OR REPLACE FUNCTION update_reminder_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_reminder_settings_updated_at
    BEFORE UPDATE ON public.reminder_settings
    FOR EACH ROW EXECUTE FUNCTION update_reminder_settings_updated_at();

-- email_templates
CREATE TABLE public.email_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    subject TEXT NOT NULL,
    body_html TEXT NOT NULL,
    body_text TEXT,
    type TEXT NOT NULL CHECK (type IN ('before_due', 'after_due', 'quote_expiring')),
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_email_templates_company ON public.email_templates(company_id);
CREATE INDEX idx_email_templates_type ON public.email_templates(type);

CREATE OR REPLACE FUNCTION update_email_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_email_templates_updated_at
    BEFORE UPDATE ON public.email_templates
    FOR EACH ROW EXECUTE FUNCTION update_email_templates_updated_at();

-- reminders
CREATE TABLE public.reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    invoice_id UUID REFERENCES public.invoices(id) ON DELETE CASCADE,
    quote_id UUID REFERENCES public.quotes(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('before_due', 'after_due', 'quote_expiring')),
    channel TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'both')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
    scheduled_at TIMESTAMPTZ NOT NULL,
    sent_at TIMESTAMPTZ,
    error_message TEXT,
    email_message_id TEXT,
    sms_message_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT reminder_document_check CHECK (
        (invoice_id IS NOT NULL AND quote_id IS NULL) OR
        (invoice_id IS NULL AND quote_id IS NOT NULL)
    )
);

CREATE INDEX idx_reminders_company ON public.reminders(company_id);
CREATE INDEX idx_reminders_invoice ON public.reminders(invoice_id);
CREATE INDEX idx_reminders_quote ON public.reminders(quote_id);
CREATE INDEX idx_reminders_client ON public.reminders(client_id);
CREATE INDEX idx_reminders_status ON public.reminders(status);
CREATE INDEX idx_reminders_scheduled ON public.reminders(scheduled_at);

-- company_invitations
CREATE TABLE public.company_invitations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role company_role NOT NULL,
    token TEXT NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
    invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
    accepted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_company_invitations_token ON public.company_invitations(token) WHERE accepted_at IS NULL;
CREATE INDEX idx_company_invitations_email ON public.company_invitations(email) WHERE accepted_at IS NULL;
CREATE UNIQUE INDEX uq_company_invitations_company_email_lower ON public.company_invitations (company_id, lower(email));
CREATE INDEX idx_company_invitations_email_lower_pending ON public.company_invitations (lower(email)) WHERE accepted_at IS NULL;

-- company_chorus_pro_settings (sans client_id/client_secret)
CREATE TABLE public.company_chorus_pro_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID UNIQUE NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    enabled BOOLEAN DEFAULT false,
    cpro_login TEXT,
    cpro_password TEXT,
    id_structure_cpp INTEGER,
    connection_status VARCHAR(20) DEFAULT 'not_configured',
    default_code_destinataire VARCHAR(50),
    default_code_service_executant VARCHAR(50),
    default_cadre_facturation VARCHAR(50) DEFAULT 'A1_FACTURE_FOURNISSEUR',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- chorus_pro_submissions
CREATE TABLE public.chorus_pro_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    identifiant_facture_cpp INTEGER,
    numero_facture_chorus VARCHAR(255),
    statut_chorus VARCHAR(50),
    submitted_at TIMESTAMPTZ DEFAULT now(),
    submitted_by UUID REFERENCES public.profiles(id),
    submission_response JSONB,
    last_status_check_at TIMESTAMPTZ,
    last_status_response JSONB,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_chorus_submissions_invoice ON public.chorus_pro_submissions(invoice_id);
CREATE INDEX idx_chorus_submissions_company ON public.chorus_pro_submissions(company_id);

-- chorus_pro_logs
CREATE TABLE public.chorus_pro_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    action VARCHAR(100) NOT NULL,
    endpoint VARCHAR(255) NOT NULL,
    request_summary JSONB,
    response_status INTEGER,
    response_summary JSONB,
    error_message TEXT,
    duration_ms INTEGER,
    invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_chorus_logs_company ON public.chorus_pro_logs(company_id);
CREATE INDEX idx_chorus_logs_created ON public.chorus_pro_logs(created_at DESC);

-- ============================================
-- D. ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminder_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_chorus_pro_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chorus_pro_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chorus_pro_logs ENABLE ROW LEVEL SECURITY;

-- ============================================
-- E. RLS POLICIES (avec les 4 roles)
-- ============================================

-- profiles
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- subscription_plans
CREATE POLICY "Anyone can view active plans" ON public.subscription_plans FOR SELECT USING (is_active = true);

-- subscriptions
CREATE POLICY "Users can view own subscription" ON public.subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own subscription" ON public.subscriptions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- companies
CREATE POLICY "Users can view their companies" ON public.companies FOR SELECT
    USING (EXISTS (SELECT 1 FROM public.user_companies uc WHERE uc.company_id = companies.id AND uc.user_id = auth.uid()));

CREATE POLICY "Admins can update their companies" ON public.companies FOR UPDATE
    USING (EXISTS (SELECT 1 FROM public.user_companies uc WHERE uc.company_id = companies.id AND uc.user_id = auth.uid() AND uc.role = 'merchant_admin'));

CREATE POLICY "Users can create companies" ON public.companies FOR INSERT WITH CHECK (true);

CREATE POLICY "Admins can delete their companies" ON public.companies FOR DELETE
    USING (EXISTS (SELECT 1 FROM public.user_companies uc WHERE uc.company_id = companies.id AND uc.user_id = auth.uid() AND uc.role = 'merchant_admin'));

-- user_companies
CREATE POLICY "Users can view their company memberships" ON public.user_companies FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all company members" ON public.user_companies FOR SELECT
    USING (EXISTS (SELECT 1 FROM public.user_companies uc WHERE uc.user_id = auth.uid() AND uc.company_id = user_companies.company_id AND uc.role IN ('merchant_admin', 'accountant')));

CREATE POLICY "Admins can manage company members" ON public.user_companies FOR ALL
    USING (EXISTS (SELECT 1 FROM public.user_companies uc WHERE uc.user_id = auth.uid() AND uc.company_id = user_companies.company_id AND uc.role IN ('merchant_admin', 'accountant')));

-- units
CREATE POLICY "Company members can view units" ON public.units FOR SELECT
    USING (EXISTS (SELECT 1 FROM public.user_companies uc WHERE uc.company_id = units.company_id AND uc.user_id = auth.uid()));

CREATE POLICY "Admins can manage units" ON public.units FOR ALL
    USING (EXISTS (SELECT 1 FROM public.user_companies uc WHERE uc.user_id = auth.uid() AND uc.company_id = units.company_id AND uc.role IN ('merchant_admin', 'accountant')));

-- product_categories
CREATE POLICY "Users can view their company categories" ON public.product_categories FOR SELECT
    USING (company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid()));

CREATE POLICY "Admins can create categories" ON public.product_categories FOR INSERT
    WITH CHECK (company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid() AND role IN ('merchant_admin', 'accountant')));

CREATE POLICY "Admins can update categories" ON public.product_categories FOR UPDATE
    USING (company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid() AND role IN ('merchant_admin', 'accountant')));

CREATE POLICY "Admins can delete categories" ON public.product_categories FOR DELETE
    USING (company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid() AND role IN ('merchant_admin', 'accountant')));

-- products
CREATE POLICY "Company members can view products" ON public.products FOR SELECT
    USING (EXISTS (SELECT 1 FROM public.user_companies uc WHERE uc.company_id = products.company_id AND uc.user_id = auth.uid()));

CREATE POLICY "Company members can manage products" ON public.products FOR ALL
    USING (EXISTS (SELECT 1 FROM public.user_companies uc WHERE uc.company_id = products.company_id AND uc.user_id = auth.uid()));

-- clients
CREATE POLICY "Company members can view clients" ON public.clients FOR SELECT
    USING (EXISTS (SELECT 1 FROM public.user_companies uc WHERE uc.company_id = clients.company_id AND uc.user_id = auth.uid()));

CREATE POLICY "Company members can manage clients" ON public.clients FOR ALL
    USING (EXISTS (SELECT 1 FROM public.user_companies uc WHERE uc.company_id = clients.company_id AND uc.user_id = auth.uid()));

-- document_sequences
CREATE POLICY "Company members can view sequences" ON public.document_sequences FOR SELECT
    USING (EXISTS (SELECT 1 FROM public.user_companies uc WHERE uc.company_id = document_sequences.company_id AND uc.user_id = auth.uid()));

-- quotes
CREATE POLICY "Company members can view quotes" ON public.quotes FOR SELECT
    USING (EXISTS (SELECT 1 FROM public.user_companies uc WHERE uc.company_id = quotes.company_id AND uc.user_id = auth.uid()));

CREATE POLICY "Company members can manage quotes" ON public.quotes FOR ALL
    USING (EXISTS (SELECT 1 FROM public.user_companies uc WHERE uc.company_id = quotes.company_id AND uc.user_id = auth.uid()));

-- quote_items
CREATE POLICY "Company members can view quote items" ON public.quote_items FOR SELECT
    USING (EXISTS (SELECT 1 FROM public.quotes q JOIN public.user_companies uc ON uc.company_id = q.company_id WHERE q.id = quote_items.quote_id AND uc.user_id = auth.uid()));

CREATE POLICY "Company members can manage quote items" ON public.quote_items FOR ALL
    USING (EXISTS (SELECT 1 FROM public.quotes q JOIN public.user_companies uc ON uc.company_id = q.company_id WHERE q.id = quote_items.quote_id AND uc.user_id = auth.uid()));

-- quote_signatures
CREATE POLICY "Anyone can view signature via token" ON public.quote_signatures FOR SELECT USING (true);

CREATE POLICY "Anyone can create signature via valid token" ON public.quote_signatures FOR INSERT
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.quotes q
        WHERE q.id = quote_signatures.quote_id
        AND q.signature_token IS NOT NULL
        AND (q.signature_token_expires_at IS NULL OR q.signature_token_expires_at > NOW())
        AND q.status = 'sent'
    ));

-- invoices
CREATE POLICY "Company members can view invoices" ON public.invoices FOR SELECT
    USING (EXISTS (SELECT 1 FROM public.user_companies uc WHERE uc.company_id = invoices.company_id AND uc.user_id = auth.uid()));

CREATE POLICY "Company members can manage invoices" ON public.invoices FOR ALL
    USING (EXISTS (SELECT 1 FROM public.user_companies uc WHERE uc.company_id = invoices.company_id AND uc.user_id = auth.uid()));

-- invoice_items
CREATE POLICY "Company members can view invoice items" ON public.invoice_items FOR SELECT
    USING (EXISTS (SELECT 1 FROM public.invoices i JOIN public.user_companies uc ON uc.company_id = i.company_id WHERE i.id = invoice_items.invoice_id AND uc.user_id = auth.uid()));

CREATE POLICY "Company members can manage invoice items" ON public.invoice_items FOR ALL
    USING (EXISTS (SELECT 1 FROM public.invoices i JOIN public.user_companies uc ON uc.company_id = i.company_id WHERE i.id = invoice_items.invoice_id AND uc.user_id = auth.uid()));

-- invoice_signatures
CREATE POLICY "Anyone can view invoice signature" ON public.invoice_signatures FOR SELECT USING (true);

CREATE POLICY "Anyone can create invoice signature via valid token" ON public.invoice_signatures FOR INSERT
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.invoices i
        WHERE i.id = invoice_signatures.invoice_id
        AND i.signature_token IS NOT NULL
        AND (i.signature_token_expires_at IS NULL OR i.signature_token_expires_at > NOW())
        AND i.status IN ('sent', 'overdue')
    ));

-- documents
CREATE POLICY "Users can view their documents" ON public.documents FOR SELECT
    USING (uploaded_by = auth.uid() OR EXISTS (SELECT 1 FROM public.user_companies uc WHERE uc.company_id = documents.company_id AND uc.user_id = auth.uid()));

CREATE POLICY "Users can upload documents" ON public.documents FOR INSERT WITH CHECK (uploaded_by = auth.uid());
CREATE POLICY "Users can delete their documents" ON public.documents FOR DELETE USING (uploaded_by = auth.uid());

-- payments
CREATE POLICY "Company members can view payments" ON public.payments FOR SELECT
    USING (EXISTS (SELECT 1 FROM public.invoices i JOIN public.user_companies uc ON uc.company_id = i.company_id WHERE i.id = payments.invoice_id AND uc.user_id = auth.uid()));

CREATE POLICY "Company members can manage payments" ON public.payments FOR ALL
    USING (EXISTS (SELECT 1 FROM public.invoices i JOIN public.user_companies uc ON uc.company_id = i.company_id WHERE i.id = payments.invoice_id AND uc.user_id = auth.uid()));

-- document_settings
CREATE POLICY "Company members can view document settings" ON public.document_settings FOR SELECT
    USING (EXISTS (SELECT 1 FROM public.user_companies uc WHERE uc.company_id = document_settings.company_id AND uc.user_id = auth.uid()));

CREATE POLICY "Company admins can manage document settings" ON public.document_settings FOR ALL
    USING (EXISTS (SELECT 1 FROM public.user_companies uc WHERE uc.company_id = document_settings.company_id AND uc.user_id = auth.uid() AND uc.role IN ('merchant_admin', 'accountant')));

-- reminder_settings
CREATE POLICY "Users can view their company reminder settings" ON public.reminder_settings FOR SELECT
    USING (company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid()));

CREATE POLICY "Admins can update reminder settings" ON public.reminder_settings FOR UPDATE
    USING (company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid() AND role IN ('merchant_admin', 'accountant')));

CREATE POLICY "Admins can insert reminder settings" ON public.reminder_settings FOR INSERT
    WITH CHECK (company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid() AND role IN ('merchant_admin', 'accountant')));

-- email_templates
CREATE POLICY "Users can view their company email templates" ON public.email_templates FOR SELECT
    USING (company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid()));

CREATE POLICY "Admins can manage email templates" ON public.email_templates FOR ALL
    USING (company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid() AND role IN ('merchant_admin', 'accountant')));

-- reminders
CREATE POLICY "Users can view their company reminders" ON public.reminders FOR SELECT
    USING (company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid()));

CREATE POLICY "Users can create reminders" ON public.reminders FOR INSERT
    WITH CHECK (company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid()));

-- company_invitations
CREATE POLICY "Users can view invitations for their companies" ON public.company_invitations FOR SELECT
    USING (EXISTS (SELECT 1 FROM public.user_companies uc WHERE uc.company_id = company_invitations.company_id AND uc.user_id = auth.uid() AND uc.role IN ('merchant_admin', 'accountant')));

CREATE POLICY "Admins can create invitations" ON public.company_invitations FOR INSERT
    WITH CHECK (EXISTS (SELECT 1 FROM public.user_companies uc WHERE uc.company_id = company_invitations.company_id AND uc.user_id = auth.uid() AND uc.role IN ('merchant_admin', 'accountant')));

CREATE POLICY "Admins can delete invitations" ON public.company_invitations FOR DELETE
    USING (EXISTS (SELECT 1 FROM public.user_companies uc WHERE uc.company_id = company_invitations.company_id AND uc.user_id = auth.uid() AND uc.role IN ('merchant_admin', 'accountant')));

-- ============================================
-- F. FUNCTIONS metier
-- ============================================

-- accept_pending_invitations (email normalise)
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

-- get_client_stats
CREATE OR REPLACE FUNCTION public.get_client_stats(
    p_client_id UUID,
    p_from_date DATE DEFAULT NULL,
    p_to_date DATE DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    v_result JSON;
    v_from_date DATE;
    v_to_date DATE;
BEGIN
    v_from_date := COALESCE(p_from_date, DATE_TRUNC('year', CURRENT_DATE)::DATE);
    v_to_date := COALESCE(p_to_date, CURRENT_DATE);

    SELECT json_build_object(
        'total_invoiced_all_time', COALESCE((
            SELECT SUM(total) FROM public.invoices
            WHERE client_id = p_client_id AND status IN ('sent', 'paid', 'partial', 'overdue', 'signed')
        ), 0),
        'total_invoiced_period', COALESCE((
            SELECT SUM(total) FROM public.invoices
            WHERE client_id = p_client_id AND status IN ('sent', 'paid', 'partial', 'overdue', 'signed')
            AND issue_date BETWEEN v_from_date AND v_to_date
        ), 0),
        'total_paid_all_time', COALESCE((
            SELECT SUM(amount) FROM public.payments p
            JOIN public.invoices i ON i.id = p.invoice_id
            WHERE i.client_id = p_client_id
        ), 0),
        'total_paid_period', COALESCE((
            SELECT SUM(amount) FROM public.payments p
            JOIN public.invoices i ON i.id = p.invoice_id
            WHERE i.client_id = p_client_id AND p.paid_at BETWEEN v_from_date AND v_to_date
        ), 0),
        'pending_amount', COALESCE((
            SELECT SUM(total - COALESCE(amount_paid, 0)) FROM public.invoices
            WHERE client_id = p_client_id AND status IN ('sent', 'signed', 'partial') AND due_date >= CURRENT_DATE
        ), 0),
        'overdue_amount', COALESCE((
            SELECT SUM(total - COALESCE(amount_paid, 0)) FROM public.invoices
            WHERE client_id = p_client_id AND status IN ('sent', 'signed', 'partial', 'overdue') AND due_date < CURRENT_DATE
        ), 0),
        'quotes_total', (SELECT COUNT(*) FROM public.quotes WHERE client_id = p_client_id),
        'quotes_signed', (SELECT COUNT(*) FROM public.quotes WHERE client_id = p_client_id AND status IN ('accepted', 'converted')),
        'quotes_period', (SELECT COUNT(*) FROM public.quotes WHERE client_id = p_client_id AND issue_date BETWEEN v_from_date AND v_to_date),
        'invoices_total', (SELECT COUNT(*) FROM public.invoices WHERE client_id = p_client_id),
        'invoices_paid', (SELECT COUNT(*) FROM public.invoices WHERE client_id = p_client_id AND status = 'paid'),
        'invoices_paid_period', (SELECT COUNT(*) FROM public.invoices WHERE client_id = p_client_id AND status = 'paid' AND paid_at BETWEEN v_from_date AND v_to_date),
        'invoices_period', (SELECT COUNT(*) FROM public.invoices WHERE client_id = p_client_id AND issue_date BETWEEN v_from_date AND v_to_date)
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- update_overdue_invoices
CREATE OR REPLACE FUNCTION public.update_overdue_invoices()
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    WITH updated AS (
        UPDATE public.invoices
        SET status = 'overdue', updated_at = TIMEZONE('utc', NOW())
        WHERE status IN ('sent', 'signed', 'partial')
        AND due_date < CURRENT_DATE
        RETURNING id
    )
    SELECT COUNT(*) INTO v_count FROM updated;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- update_expired_quotes
CREATE OR REPLACE FUNCTION public.update_expired_quotes()
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    WITH updated AS (
        UPDATE public.quotes
        SET status = 'expired', updated_at = TIMEZONE('utc', NOW())
        WHERE status = 'sent'
        AND validity_date < CURRENT_DATE
        RETURNING id
    )
    SELECT COUNT(*) INTO v_count FROM updated;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- convert_quote_to_invoice
CREATE OR REPLACE FUNCTION public.convert_quote_to_invoice(
    p_quote_id UUID,
    p_user_id UUID,
    p_due_date DATE DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_quote RECORD;
    v_invoice_id UUID;
    v_invoice_number VARCHAR(50);
    v_due_date DATE;
    v_settings RECORD;
BEGIN
    SELECT * INTO v_quote FROM public.quotes
    WHERE id = p_quote_id AND status IN ('accepted', 'sent');

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Devis non trouve ou non convertible';
    END IF;

    SELECT * INTO v_settings FROM public.document_settings
    WHERE company_id = v_quote.company_id;

    v_due_date := COALESCE(p_due_date, CURRENT_DATE + COALESCE(v_settings.default_payment_delay_days, 30));

    v_invoice_number := public.generate_document_number(v_quote.company_id, 'invoice');

    INSERT INTO public.invoices (
        company_id, client_id, quote_id, created_by, invoice_number,
        status, type, title, issue_date, due_date,
        subtotal, total_vat, total, discount_type, discount_value,
        notes, facturx_profile
    )
    VALUES (
        v_quote.company_id, v_quote.client_id, v_quote.id, p_user_id, v_invoice_number,
        'draft', 'standard', v_quote.title, CURRENT_DATE, v_due_date,
        v_quote.subtotal, v_quote.total_vat, v_quote.total, v_quote.discount_type, v_quote.discount_value,
        v_quote.notes, COALESCE(v_settings.facturx_profile, 'minimum')
    )
    RETURNING id INTO v_invoice_id;

    INSERT INTO public.invoice_items (
        invoice_id, product_id, position, reference, description,
        quantity, unit, unit_price, vat_rate, discount_type, discount_value, line_total
    )
    SELECT
        v_invoice_id, product_id, position, reference, description,
        quantity, unit, unit_price, vat_rate, discount_type, discount_value, line_total
    FROM public.quote_items
    WHERE quote_id = p_quote_id
    ORDER BY position;

    UPDATE public.quotes
    SET status = 'converted', converted_to_invoice_id = v_invoice_id, updated_at = TIMEZONE('utc', NOW())
    WHERE id = p_quote_id;

    RETURN v_invoice_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- record_payment
CREATE OR REPLACE FUNCTION public.record_payment(
    p_invoice_id UUID,
    p_amount DECIMAL(12,2),
    p_payment_method payment_method,
    p_stripe_payment_id VARCHAR(255) DEFAULT NULL,
    p_reference VARCHAR(255) DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_created_by UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_invoice RECORD;
    v_payment_id UUID;
    v_new_amount_paid DECIMAL(12,2);
    v_new_status invoice_status;
BEGIN
    SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Facture non trouvee';
    END IF;

    INSERT INTO public.payments (invoice_id, amount, payment_method, stripe_payment_id, reference, notes, created_by, paid_at)
    VALUES (p_invoice_id, p_amount, p_payment_method, p_stripe_payment_id, p_reference, p_notes, p_created_by, TIMEZONE('utc', NOW()))
    RETURNING id INTO v_payment_id;

    v_new_amount_paid := COALESCE(v_invoice.amount_paid, 0) + p_amount;

    IF v_new_amount_paid >= v_invoice.total THEN
        v_new_status := 'paid';
    ELSE
        v_new_status := 'partial';
    END IF;

    UPDATE public.invoices
    SET amount_paid = v_new_amount_paid,
        status = v_new_status,
        paid_at = CASE WHEN v_new_status = 'paid' THEN TIMEZONE('utc', NOW()) ELSE paid_at END,
        payment_method = p_payment_method::text,
        updated_at = TIMEZONE('utc', NOW())
    WHERE id = p_invoice_id;

    RETURN v_payment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- create_default_company_settings
CREATE OR REPLACE FUNCTION public.create_default_company_settings()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.document_settings (company_id) VALUES (NEW.id) ON CONFLICT (company_id) DO NOTHING;
    INSERT INTO public.reminder_settings (company_id) VALUES (NEW.id) ON CONFLICT (company_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_company_created_settings
    AFTER INSERT ON public.companies
    FOR EACH ROW EXECUTE FUNCTION public.create_default_company_settings();

-- get_invoices_needing_reminder
CREATE OR REPLACE FUNCTION public.get_invoices_needing_reminder(p_company_id UUID)
RETURNS TABLE (
    invoice_id UUID,
    invoice_number VARCHAR(50),
    client_id UUID,
    client_name VARCHAR(255),
    client_email VARCHAR(255),
    client_phone VARCHAR(20),
    total DECIMAL(12,2),
    amount_due DECIMAL(12,2),
    due_date DATE,
    days_overdue INTEGER,
    last_reminder_date TIMESTAMPTZ,
    reminder_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        i.id as invoice_id,
        i.invoice_number,
        c.id as client_id,
        COALESCE(c.company_name, CONCAT(c.first_name, ' ', c.last_name)) as client_name,
        c.email as client_email,
        c.phone as client_phone,
        i.total,
        (i.total - COALESCE(i.amount_paid, 0)) as amount_due,
        i.due_date,
        (CURRENT_DATE - i.due_date)::INTEGER as days_overdue,
        (SELECT MAX(sent_at) FROM public.reminders WHERE reminders.invoice_id = i.id AND status = 'sent') as last_reminder_date,
        (SELECT COUNT(*) FROM public.reminders WHERE reminders.invoice_id = i.id AND status = 'sent') as reminder_count
    FROM public.invoices i
    JOIN public.clients c ON c.id = i.client_id
    WHERE i.company_id = p_company_id
    AND i.status IN ('sent', 'signed', 'partial', 'overdue')
    AND i.due_date < CURRENT_DATE
    AND (i.total - COALESCE(i.amount_paid, 0)) > 0
    ORDER BY i.due_date ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- G. TRIGGER: handle_new_user (version finale)
-- ============================================

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

    v_siret := NEW.raw_user_meta_data->>'siret';
    v_siren := NEW.raw_user_meta_data->>'siren';
    v_company_name := NEW.raw_user_meta_data->>'company_name';
    v_address := NEW.raw_user_meta_data->>'address';
    v_postal_code := NEW.raw_user_meta_data->>'postal_code';
    v_city := NEW.raw_user_meta_data->>'city';
    v_country := COALESCE(NEW.raw_user_meta_data->>'country', 'FR');

    v_role_text := COALESCE(NEW.raw_user_meta_data->>'role', 'merchant_admin');
    IF v_role_text NOT IN ('merchant_admin', 'merchant_consultant', 'accountant', 'accountant_consultant', 'superadmin') THEN
        v_role_text := 'merchant_admin';
    END IF;
    v_role := v_role_text::public.company_role;

    IF v_role IN ('merchant_admin', 'accountant') AND v_company_name IS NOT NULL AND v_company_name != '' THEN
        INSERT INTO public.companies (name, siret, address, postal_code, city, country, owner_id)
        VALUES (v_company_name, COALESCE(v_siret, v_siren), v_address, v_postal_code, v_city, v_country, NEW.id)
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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- H. SEED DATA : Plans d'abonnement
-- ============================================

-- Anciens plans (inactifs)
INSERT INTO public.subscription_plans (name, slug, price_monthly, price_yearly, max_companies, max_quotes_per_month, max_storage_mb, features, is_active)
VALUES
    ('Free', 'free', 0, 0, 1, 10, 100, '{"pdf_export": true, "email_support": false}', false),
    ('Pro', 'pro', 19.99, 199.99, 3, 100, 1000, '{"pdf_export": true, "email_support": true, "priority_support": false}', false),
    ('Enterprise', 'enterprise', 49.99, 499.99, 10, NULL, 10000, '{"pdf_export": true, "email_support": true, "priority_support": true, "api_access": true}', false)
ON CONFLICT (slug) DO NOTHING;

-- Nouveaux plans actifs
INSERT INTO public.subscription_plans
    (name, slug, price_monthly, price_yearly, max_companies, max_quotes_per_month, max_invoices_per_month, max_members, max_storage_mb, price_per_additional_member, features, is_active, stripe_lookup_key_monthly, stripe_member_lookup_key)
VALUES
    ('Essentiel', 'essentiel', 9.90, 0, NULL, 50, 25, NULL, 1000, 1.50, '{"avoirs_illimites":true}', true, 'essentiel_monthly', 'member_addon'),
    ('Business', 'business', 12.90, 0, NULL, NULL, 100, NULL, 5000, 1.50, '{"avoirs_illimites":true}', true, 'business_monthly', 'member_addon'),
    ('Premium', 'premium', 24.90, 0, NULL, NULL, NULL, NULL, 10000, 1.50, '{"avoirs_illimites":true,"unlimited":true}', true, 'premium_monthly', 'member_addon')
ON CONFLICT (slug) DO NOTHING;

-- ============================================
-- FIN DE LA MIGRATION CONSOLIDEE
-- ============================================
