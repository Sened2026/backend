-- ============================================
-- SCRIPT À EXÉCUTER DANS SUPABASE SQL EDITOR
-- ============================================
-- Ce script contient toutes les modifications nécessaires
-- pour le système de devis, factures, paiements et relances
-- 
-- IMPORTANT: Exécutez ce script dans l'éditeur SQL de Supabase
-- Dashboard > SQL Editor > New Query > Coller ce script > Run
-- ============================================

-- ============================================
-- ÉTAPE 1: NOUVEAUX TYPES ENUM
-- ============================================

-- Type de facture
DO $$ BEGIN
    CREATE TYPE invoice_type AS ENUM ('standard', 'deposit', 'final', 'credit_note');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Type de relance
DO $$ BEGIN
    CREATE TYPE reminder_type AS ENUM ('email', 'sms');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Statut de relance
DO $$ BEGIN
    CREATE TYPE reminder_status AS ENUM ('pending', 'sent', 'failed', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Profil Factur-X
DO $$ BEGIN
    CREATE TYPE facturx_profile AS ENUM ('minimum', 'basic', 'en16931');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Méthode de paiement
DO $$ BEGIN
    CREATE TYPE payment_method AS ENUM ('stripe', 'bank_transfer', 'cash', 'check', 'other');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Ajout valeurs aux enums existants
DO $$ BEGIN
    ALTER TYPE quote_status ADD VALUE IF NOT EXISTS 'viewed';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TYPE quote_status ADD VALUE IF NOT EXISTS 'converted';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TYPE invoice_status ADD VALUE IF NOT EXISTS 'partial';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TYPE invoice_status ADD VALUE IF NOT EXISTS 'signed';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================
-- ÉTAPE 2: MODIFICATIONS DES TABLES EXISTANTES
-- ============================================

-- Table clients: Ajout colonnes Stripe et SIREN
ALTER TABLE public.clients 
    ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255),
    ADD COLUMN IF NOT EXISTS siren VARCHAR(9);

-- Table quotes: Ajout colonnes signature et conversion
ALTER TABLE public.quotes 
    ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS signature_checkbox BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS signer_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS signer_ip INET,
    ADD COLUMN IF NOT EXISTS converted_to_invoice_id UUID,
    ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS refused_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS refusal_reason TEXT;

-- Table invoices: Ajout colonnes paiement et signature
ALTER TABLE public.invoices 
    ADD COLUMN IF NOT EXISTS type invoice_type DEFAULT 'standard',
    ADD COLUMN IF NOT EXISTS parent_invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS signature_checkbox BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS signer_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS signer_ip INET,
    ADD COLUMN IF NOT EXISTS signature_token UUID DEFAULT gen_random_uuid(),
    ADD COLUMN IF NOT EXISTS signature_token_expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
    ADD COLUMN IF NOT EXISTS facturx_profile facturx_profile DEFAULT 'minimum',
    ADD COLUMN IF NOT EXISTS facturx_xml TEXT;

-- Nouveaux index
CREATE INDEX IF NOT EXISTS quotes_converted_invoice_idx ON public.quotes(converted_to_invoice_id);
CREATE INDEX IF NOT EXISTS invoices_parent_invoice_idx ON public.invoices(parent_invoice_id);
CREATE INDEX IF NOT EXISTS invoices_due_date_idx ON public.invoices(due_date);
CREATE INDEX IF NOT EXISTS invoices_signature_token_idx ON public.invoices(signature_token);
CREATE INDEX IF NOT EXISTS invoices_stripe_payment_intent_idx ON public.invoices(stripe_payment_intent_id);

-- ============================================
-- ÉTAPE 3: NOUVELLES TABLES
-- ============================================

-- TABLE: payments
CREATE TABLE IF NOT EXISTS public.payments (
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

CREATE INDEX IF NOT EXISTS payments_invoice_id_idx ON public.payments(invoice_id);
CREATE INDEX IF NOT EXISTS payments_stripe_payment_id_idx ON public.payments(stripe_payment_id);
CREATE INDEX IF NOT EXISTS payments_paid_at_idx ON public.payments(paid_at);

-- TABLE: reminders
CREATE TABLE IF NOT EXISTS public.reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    type reminder_type NOT NULL,
    recipient VARCHAR(255) NOT NULL,
    subject VARCHAR(500),
    body TEXT,
    status reminder_status NOT NULL DEFAULT 'pending',
    sent_at TIMESTAMPTZ,
    error_message TEXT,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS reminders_invoice_id_idx ON public.reminders(invoice_id);
CREATE INDEX IF NOT EXISTS reminders_status_idx ON public.reminders(status);
CREATE INDEX IF NOT EXISTS reminders_sent_at_idx ON public.reminders(sent_at);

-- TABLE: reminder_settings
CREATE TABLE IF NOT EXISTS public.reminder_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE UNIQUE,
    is_enabled BOOLEAN DEFAULT false,
    auto_send BOOLEAN DEFAULT false,
    delays_days JSONB DEFAULT '[7, 15, 30]'::jsonb,
    email_subject_template VARCHAR(500) DEFAULT 'Rappel : Facture {{invoice_number}} en attente de paiement',
    email_body_template TEXT DEFAULT E'Bonjour {{client_name}},\n\nNous vous rappelons que la facture {{invoice_number}} d''un montant de {{amount}} € est en attente de paiement.\n\nDate d''échéance : {{due_date}}\n\nMerci de procéder au règlement dans les meilleurs délais.\n\nCordialement,\n{{company_name}}',
    sms_enabled BOOLEAN DEFAULT false,
    sms_body_template VARCHAR(500) DEFAULT 'Rappel: Facture {{invoice_number}} de {{amount}}€ en attente. Échéance: {{due_date}}. {{company_name}}',
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS reminder_settings_company_id_idx ON public.reminder_settings(company_id);

-- TABLE: document_settings
CREATE TABLE IF NOT EXISTS public.document_settings (
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

CREATE INDEX IF NOT EXISTS document_settings_company_id_idx ON public.document_settings(company_id);

-- TABLE: invoice_signatures
CREATE TABLE IF NOT EXISTS public.invoice_signatures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE UNIQUE,
    signer_name VARCHAR(255) NOT NULL,
    signer_email VARCHAR(255) NOT NULL,
    signed_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    ip_address INET NOT NULL,
    user_agent TEXT,
    document_hash VARCHAR(64) NOT NULL,
    consent_text TEXT NOT NULL DEFAULT 'Je reconnais avoir lu et accepté les conditions de cette facture et m''engage à procéder au paiement.',
    consent_accepted BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS invoice_signatures_invoice_id_idx ON public.invoice_signatures(invoice_id);

-- ============================================
-- ÉTAPE 4: TRIGGERS
-- ============================================

DROP TRIGGER IF EXISTS on_reminder_settings_updated ON public.reminder_settings;
CREATE TRIGGER on_reminder_settings_updated
    BEFORE UPDATE ON public.reminder_settings
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS on_document_settings_updated ON public.document_settings;
CREATE TRIGGER on_document_settings_updated
    BEFORE UPDATE ON public.document_settings
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- ============================================
-- ÉTAPE 5: ROW LEVEL SECURITY
-- ============================================

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminder_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_signatures ENABLE ROW LEVEL SECURITY;

-- Policies payments
DROP POLICY IF EXISTS "Company members can view payments" ON public.payments;
CREATE POLICY "Company members can view payments"
    ON public.payments FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.invoices i
            JOIN public.user_companies uc ON uc.company_id = i.company_id
            WHERE i.id = payments.invoice_id
            AND uc.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Company members can manage payments" ON public.payments;
CREATE POLICY "Company members can manage payments"
    ON public.payments FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.invoices i
            JOIN public.user_companies uc ON uc.company_id = i.company_id
            WHERE i.id = payments.invoice_id
            AND uc.user_id = auth.uid()
        )
    );

-- Policies reminders
DROP POLICY IF EXISTS "Company members can view reminders" ON public.reminders;
CREATE POLICY "Company members can view reminders"
    ON public.reminders FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.invoices i
            JOIN public.user_companies uc ON uc.company_id = i.company_id
            WHERE i.id = reminders.invoice_id
            AND uc.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Company members can manage reminders" ON public.reminders;
CREATE POLICY "Company members can manage reminders"
    ON public.reminders FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.invoices i
            JOIN public.user_companies uc ON uc.company_id = i.company_id
            WHERE i.id = reminders.invoice_id
            AND uc.user_id = auth.uid()
        )
    );

-- Policies reminder_settings
DROP POLICY IF EXISTS "Company admins can manage reminder settings" ON public.reminder_settings;
CREATE POLICY "Company admins can manage reminder settings"
    ON public.reminder_settings FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.user_companies uc
            WHERE uc.company_id = reminder_settings.company_id
            AND uc.user_id = auth.uid()
            AND uc.role = 'admin'
        )
    );

DROP POLICY IF EXISTS "Company members can view reminder settings" ON public.reminder_settings;
CREATE POLICY "Company members can view reminder settings"
    ON public.reminder_settings FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.user_companies uc
            WHERE uc.company_id = reminder_settings.company_id
            AND uc.user_id = auth.uid()
        )
    );

-- Policies document_settings
DROP POLICY IF EXISTS "Company admins can manage document settings" ON public.document_settings;
CREATE POLICY "Company admins can manage document settings"
    ON public.document_settings FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.user_companies uc
            WHERE uc.company_id = document_settings.company_id
            AND uc.user_id = auth.uid()
            AND uc.role = 'admin'
        )
    );

DROP POLICY IF EXISTS "Company members can view document settings" ON public.document_settings;
CREATE POLICY "Company members can view document settings"
    ON public.document_settings FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.user_companies uc
            WHERE uc.company_id = document_settings.company_id
            AND uc.user_id = auth.uid()
        )
    );

-- Policies invoice_signatures
DROP POLICY IF EXISTS "Anyone can view invoice signature" ON public.invoice_signatures;
CREATE POLICY "Anyone can view invoice signature"
    ON public.invoice_signatures FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Anyone can create invoice signature via valid token" ON public.invoice_signatures;
CREATE POLICY "Anyone can create invoice signature via valid token"
    ON public.invoice_signatures FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.invoices i
            WHERE i.id = invoice_signatures.invoice_id
            AND i.signature_token IS NOT NULL
            AND (i.signature_token_expires_at IS NULL OR i.signature_token_expires_at > NOW())
            AND i.status IN ('sent', 'overdue')
        )
    );

-- ============================================
-- ÉTAPE 6: FONCTIONS
-- ============================================

-- Fonction: Statistiques client
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
            WHERE client_id = p_client_id AND status IN ('sent', 'signed', 'partial')
            AND due_date >= CURRENT_DATE
        ), 0),
        'overdue_amount', COALESCE((
            SELECT SUM(total - COALESCE(amount_paid, 0)) FROM public.invoices
            WHERE client_id = p_client_id AND status IN ('sent', 'signed', 'partial', 'overdue')
            AND due_date < CURRENT_DATE
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

-- Fonction: Mettre à jour les factures en retard
CREATE OR REPLACE FUNCTION public.update_overdue_invoices()
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    WITH updated AS (
        UPDATE public.invoices
        SET status = 'overdue', updated_at = TIMEZONE('utc', NOW())
        WHERE status IN ('sent', 'signed', 'partial') AND due_date < CURRENT_DATE
        RETURNING id
    )
    SELECT COUNT(*) INTO v_count FROM updated;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fonction: Mettre à jour les devis expirés
CREATE OR REPLACE FUNCTION public.update_expired_quotes()
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    WITH updated AS (
        UPDATE public.quotes
        SET status = 'expired', updated_at = TIMEZONE('utc', NOW())
        WHERE status = 'sent' AND validity_date < CURRENT_DATE
        RETURNING id
    )
    SELECT COUNT(*) INTO v_count FROM updated;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fonction: Convertir un devis en facture
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
    SELECT * INTO v_quote FROM public.quotes WHERE id = p_quote_id AND status IN ('accepted', 'sent');
    IF NOT FOUND THEN RAISE EXCEPTION 'Devis non trouvé ou non convertible'; END IF;
    
    SELECT * INTO v_settings FROM public.document_settings WHERE company_id = v_quote.company_id;
    v_due_date := COALESCE(p_due_date, CURRENT_DATE + COALESCE(v_settings.default_payment_delay_days, 30));
    v_invoice_number := public.generate_document_number(v_quote.company_id, 'invoice');
    
    INSERT INTO public.invoices (
        company_id, client_id, quote_id, created_by, invoice_number, status, type, title,
        issue_date, due_date, subtotal, total_vat, total, discount_type, discount_value, notes, facturx_profile
    ) VALUES (
        v_quote.company_id, v_quote.client_id, v_quote.id, p_user_id, v_invoice_number, 'draft', 'standard',
        v_quote.title, CURRENT_DATE, v_due_date, v_quote.subtotal, v_quote.total_vat, v_quote.total,
        v_quote.discount_type, v_quote.discount_value, v_quote.notes, COALESCE(v_settings.facturx_profile, 'minimum')
    ) RETURNING id INTO v_invoice_id;
    
    INSERT INTO public.invoice_items (invoice_id, product_id, position, reference, description, quantity, unit, unit_price, vat_rate, discount_type, discount_value, line_total)
    SELECT v_invoice_id, product_id, position, reference, description, quantity, unit, unit_price, vat_rate, discount_type, discount_value, line_total
    FROM public.quote_items WHERE quote_id = p_quote_id ORDER BY position;
    
    UPDATE public.quotes SET status = 'converted', converted_to_invoice_id = v_invoice_id, updated_at = TIMEZONE('utc', NOW()) WHERE id = p_quote_id;
    
    RETURN v_invoice_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fonction: Enregistrer un paiement
CREATE OR REPLACE FUNCTION public.create_credit_note_from_invoice(
    p_invoice_id UUID,
    p_company_id UUID,
    p_user_id UUID,
    p_reason TEXT,
    p_amount DECIMAL(12,2) DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_original_invoice public.invoices%ROWTYPE;
    v_credit_note_id UUID;
    v_credit_note_number VARCHAR(50);
    v_issue_date DATE := CURRENT_DATE;
    v_credit_amount DECIMAL(12,2);
    v_ratio DECIMAL(12,6);
    v_is_partial BOOLEAN;
    v_credit_subtotal DECIMAL(12,2);
    v_credit_vat DECIMAL(12,2);
    v_credit_total DECIMAL(12,2);
    v_first_vat_rate DECIMAL(5,2);
BEGIN
    SELECT *
    INTO v_original_invoice
    FROM public.invoices
    WHERE id = p_invoice_id
      AND company_id = p_company_id
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'Facture non trouvée'; END IF;
    IF v_original_invoice.type = 'credit_note' THEN RAISE EXCEPTION 'Impossible de créer un avoir sur un avoir'; END IF;
    IF v_original_invoice.status NOT IN ('sent', 'paid', 'overdue') THEN
        RAISE EXCEPTION 'Un avoir ne peut être créé que sur une facture non-brouillon et non-annulée';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM public.invoices
        WHERE parent_invoice_id = p_invoice_id
          AND type = 'credit_note'
    ) THEN
        RAISE EXCEPTION 'Un avoir existe déjà pour cette facture';
    END IF;
    IF p_amount IS NOT NULL AND p_amount <= 0 THEN RAISE EXCEPTION 'Le montant de l''avoir doit être supérieur à 0'; END IF;
    IF p_amount IS NOT NULL AND p_amount > ABS(v_original_invoice.total) THEN
        RAISE EXCEPTION 'Le montant de l''avoir ne peut pas dépasser le montant total de la facture';
    END IF;

    v_credit_amount := COALESCE(p_amount, ABS(v_original_invoice.total));
    v_is_partial := v_credit_amount < ABS(v_original_invoice.total);
    v_ratio := CASE WHEN ABS(v_original_invoice.total) > 0 THEN v_credit_amount / ABS(v_original_invoice.total) ELSE 1 END;
    v_credit_subtotal := -ABS(ROUND(v_original_invoice.subtotal * v_ratio * 100) / 100);
    v_credit_vat := -ABS(ROUND(v_original_invoice.total_vat * v_ratio * 100) / 100);
    v_credit_total := -ABS(v_credit_amount);
    v_credit_note_number := public.generate_document_number(p_company_id, 'credit_note');

    INSERT INTO public.invoices (
        company_id, client_id, created_by, invoice_number, status, type,
        parent_invoice_id, title, subject, issue_date, due_date, subtotal,
        total_vat, total, discount_type, discount_value, amount_paid, notes,
        footer, terms_and_conditions, facturx_profile
    )
    VALUES (
        p_company_id,
        v_original_invoice.client_id,
        p_user_id,
        v_credit_note_number,
        'sent',
        'credit_note',
        p_invoice_id,
        CONCAT('Avoir', CASE WHEN v_is_partial THEN ' partiel' ELSE '' END, ' - ', COALESCE(v_original_invoice.title, v_original_invoice.invoice_number)),
        p_reason,
        v_issue_date,
        v_issue_date,
        v_credit_subtotal,
        v_credit_vat,
        v_credit_total,
        CASE WHEN v_is_partial THEN NULL ELSE v_original_invoice.discount_type END,
        CASE WHEN v_is_partial THEN NULL ELSE v_original_invoice.discount_value END,
        0,
        CONCAT('Avoir', CASE WHEN v_is_partial THEN ' partiel' ELSE '' END, ' créé pour la facture ', v_original_invoice.invoice_number, '. Raison: ', p_reason),
        v_original_invoice.footer,
        v_original_invoice.terms_and_conditions,
        v_original_invoice.facturx_profile
    )
    RETURNING id INTO v_credit_note_id;

    IF v_is_partial THEN
        SELECT COALESCE((
            SELECT vat_rate
            FROM public.invoice_items
            WHERE invoice_id = v_original_invoice.id
            ORDER BY position ASC, created_at ASC
            LIMIT 1
        ), 20)
        INTO v_first_vat_rate;

        INSERT INTO public.invoice_items (
            invoice_id, position, description, quantity, unit_price, vat_rate, line_total
        )
        VALUES (
            v_credit_note_id,
            0,
            CONCAT('Avoir partiel sur facture ', v_original_invoice.invoice_number),
            1,
            ABS(v_credit_total),
            v_first_vat_rate,
            v_credit_total
        );
    ELSE
        INSERT INTO public.invoice_items (
            invoice_id, product_id, position, reference, description, quantity,
            unit, unit_price, vat_rate, discount_type, discount_value, line_total
        )
        SELECT
            v_credit_note_id,
            product_id,
            COALESCE(position, 0),
            reference,
            description,
            quantity,
            unit,
            unit_price,
            vat_rate,
            discount_type,
            COALESCE(discount_value, 0),
            -ABS(line_total)
        FROM public.invoice_items
        WHERE invoice_id = v_original_invoice.id
        ORDER BY position ASC, created_at ASC;
    END IF;

    RETURN v_credit_note_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.cancel_invoice_with_optional_credit_note(
    p_invoice_id UUID,
    p_company_id UUID,
    p_reason TEXT,
    p_create_credit_note BOOLEAN DEFAULT FALSE,
    p_credit_note_amount DECIMAL(12,2) DEFAULT NULL,
    p_user_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_invoice public.invoices%ROWTYPE;
    v_credit_note_id UUID := NULL;
BEGIN
    SELECT *
    INTO v_invoice
    FROM public.invoices
    WHERE id = p_invoice_id
      AND company_id = p_company_id
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'Facture non trouvée'; END IF;

    IF v_invoice.status NOT IN ('sent', 'overdue') THEN
        IF v_invoice.status = 'paid' THEN
            RAISE EXCEPTION 'Une facture payée ne peut pas être annulée. Veuillez créer un avoir.';
        END IF;
        RAISE EXCEPTION 'Cette facture ne peut pas être annulée';
    END IF;

    IF p_create_credit_note THEN
        v_credit_note_id := public.create_credit_note_from_invoice(
            p_invoice_id,
            p_company_id,
            p_user_id,
            p_reason,
            p_credit_note_amount
        );
    END IF;

    UPDATE public.invoices SET
        status = 'cancelled',
        cancelled_at = TIMEZONE('utc', NOW()),
        cancellation_reason = p_reason,
        updated_at = TIMEZONE('utc', NOW())
    WHERE id = p_invoice_id;

    RETURN jsonb_build_object('invoice_id', p_invoice_id, 'credit_note_id', v_credit_note_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
    SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Facture non trouvée'; END IF;
    IF v_invoice.status IN ('draft', 'cancelled', 'paid') THEN
        RAISE EXCEPTION 'Impossible d''enregistrer un paiement sur cette facture';
    END IF;
    
    INSERT INTO public.payments (invoice_id, amount, payment_method, stripe_payment_id, reference, notes, created_by, paid_at)
    VALUES (p_invoice_id, p_amount, p_payment_method, p_stripe_payment_id, p_reference, p_notes, p_created_by, TIMEZONE('utc', NOW()))
    RETURNING id INTO v_payment_id;
    
    v_new_amount_paid := COALESCE(v_invoice.amount_paid, 0) + p_amount;
    v_new_status := CASE
        WHEN v_new_amount_paid >= v_invoice.total THEN 'paid'::invoice_status
        WHEN v_invoice.due_date < CURRENT_DATE THEN 'overdue'::invoice_status
        ELSE 'sent'::invoice_status
    END;
    
    UPDATE public.invoices SET 
        amount_paid = v_new_amount_paid, status = v_new_status,
        paid_at = CASE WHEN v_new_status = 'paid' THEN TIMEZONE('utc', NOW()) ELSE paid_at END,
        payment_method = p_payment_method::text, updated_at = TIMEZONE('utc', NOW())
    WHERE id = p_invoice_id;
    
    RETURN v_payment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fonction: Créer paramètres par défaut pour nouvelle entreprise
CREATE OR REPLACE FUNCTION public.create_default_company_settings()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.document_settings (company_id) VALUES (NEW.id) ON CONFLICT (company_id) DO NOTHING;
    INSERT INTO public.reminder_settings (company_id) VALUES (NEW.id) ON CONFLICT (company_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_company_created_settings ON public.companies;
CREATE TRIGGER on_company_created_settings
    AFTER INSERT ON public.companies FOR EACH ROW EXECUTE FUNCTION public.create_default_company_settings();

-- Fonction: Obtenir les factures nécessitant une relance
CREATE OR REPLACE FUNCTION public.get_invoices_needing_reminder(p_company_id UUID)
RETURNS TABLE (
    invoice_id UUID, invoice_number VARCHAR(50), client_id UUID, client_name VARCHAR(255),
    client_email VARCHAR(255), client_phone VARCHAR(20), total DECIMAL(12,2),
    amount_due DECIMAL(12,2), due_date DATE, days_overdue INTEGER,
    last_reminder_date TIMESTAMPTZ, reminder_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        i.id, i.invoice_number, c.id, COALESCE(c.company_name, CONCAT(c.first_name, ' ', c.last_name)),
        c.email, c.phone, i.total, (i.total - COALESCE(i.amount_paid, 0)),
        i.due_date, (CURRENT_DATE - i.due_date)::INTEGER,
        (SELECT MAX(sent_at) FROM public.reminders WHERE reminders.invoice_id = i.id AND status = 'sent'),
        (SELECT COUNT(*) FROM public.reminders WHERE reminders.invoice_id = i.id AND status = 'sent')
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
-- ÉTAPE 7: INITIALISATION DES DONNÉES
-- ============================================

-- Créer les paramètres pour les entreprises existantes
INSERT INTO public.document_settings (company_id)
SELECT id FROM public.companies
WHERE NOT EXISTS (SELECT 1 FROM public.document_settings ds WHERE ds.company_id = companies.id)
ON CONFLICT (company_id) DO NOTHING;

INSERT INTO public.reminder_settings (company_id)
SELECT id FROM public.companies
WHERE NOT EXISTS (SELECT 1 FROM public.reminder_settings rs WHERE rs.company_id = companies.id)
ON CONFLICT (company_id) DO NOTHING;

-- ============================================
-- FIN DU SCRIPT
-- ============================================
-- Vérification: Exécutez ces requêtes pour confirmer
-- SELECT * FROM public.document_settings;
-- SELECT * FROM public.reminder_settings;
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'invoices';
-- ============================================
