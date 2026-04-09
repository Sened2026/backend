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

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Facture non trouvée';
    END IF;

    IF v_original_invoice.type = 'credit_note' THEN
        RAISE EXCEPTION 'Impossible de créer un avoir sur un avoir';
    END IF;

    IF v_original_invoice.status NOT IN ('sent', 'paid', 'overdue') THEN
        RAISE EXCEPTION 'Un avoir ne peut être créé que sur une facture non-brouillon et non-annulée';
    END IF;

    IF p_amount IS NOT NULL AND p_amount <= 0 THEN
        RAISE EXCEPTION 'Le montant de l''avoir doit être supérieur à 0';
    END IF;

    IF p_amount IS NOT NULL AND p_amount > ABS(v_original_invoice.total) THEN
        RAISE EXCEPTION 'Le montant de l''avoir ne peut pas dépasser le montant total de la facture';
    END IF;

    v_credit_amount := COALESCE(p_amount, ABS(v_original_invoice.total));
    v_is_partial := v_credit_amount < ABS(v_original_invoice.total);
    v_ratio := CASE
        WHEN ABS(v_original_invoice.total) > 0
            THEN v_credit_amount / ABS(v_original_invoice.total)
        ELSE 1
    END;

    v_credit_subtotal := -ABS(ROUND(v_original_invoice.subtotal * v_ratio * 100) / 100);
    v_credit_vat := -ABS(ROUND(v_original_invoice.total_vat * v_ratio * 100) / 100);
    v_credit_total := -ABS(v_credit_amount);
    v_credit_note_number := public.generate_document_number(p_company_id, 'credit_note');

    INSERT INTO public.invoices (
        company_id,
        client_id,
        created_by,
        invoice_number,
        status,
        type,
        parent_invoice_id,
        title,
        subject,
        issue_date,
        due_date,
        subtotal,
        total_vat,
        total,
        discount_type,
        discount_value,
        amount_paid,
        notes,
        footer,
        terms_and_conditions,
        facturx_profile
    )
    VALUES (
        p_company_id,
        v_original_invoice.client_id,
        p_user_id,
        v_credit_note_number,
        'sent',
        'credit_note',
        p_invoice_id,
        CONCAT(
            'Avoir',
            CASE WHEN v_is_partial THEN ' partiel' ELSE '' END,
            ' - ',
            COALESCE(v_original_invoice.title, v_original_invoice.invoice_number)
        ),
        p_reason,
        v_issue_date,
        v_issue_date,
        v_credit_subtotal,
        v_credit_vat,
        v_credit_total,
        CASE WHEN v_is_partial THEN NULL ELSE v_original_invoice.discount_type END,
        CASE WHEN v_is_partial THEN NULL ELSE v_original_invoice.discount_value END,
        0,
        CONCAT(
            'Avoir',
            CASE WHEN v_is_partial THEN ' partiel' ELSE '' END,
            ' créé pour la facture ',
            v_original_invoice.invoice_number,
            '. Raison: ',
            p_reason
        ),
        v_original_invoice.footer,
        v_original_invoice.terms_and_conditions,
        v_original_invoice.facturx_profile
    )
    RETURNING id INTO v_credit_note_id;

    IF v_is_partial THEN
        SELECT COALESCE(
            (
                SELECT vat_rate
                FROM public.invoice_items
                WHERE invoice_id = v_original_invoice.id
                ORDER BY position ASC, created_at ASC
                LIMIT 1
            ),
            20
        )
        INTO v_first_vat_rate;

        INSERT INTO public.invoice_items (
            invoice_id,
            position,
            description,
            quantity,
            unit_price,
            vat_rate,
            line_total
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
            invoice_id,
            product_id,
            position,
            reference,
            description,
            quantity,
            unit,
            unit_price,
            vat_rate,
            discount_type,
            discount_value,
            line_total
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

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Facture non trouvée';
    END IF;

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

    UPDATE public.invoices
    SET
        status = 'cancelled',
        cancelled_at = TIMEZONE('utc', NOW()),
        cancellation_reason = p_reason,
        updated_at = TIMEZONE('utc', NOW())
    WHERE id = p_invoice_id;

    RETURN jsonb_build_object(
        'invoice_id', p_invoice_id,
        'credit_note_id', v_credit_note_id
    );
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
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Facture non trouvée';
    END IF;

    IF v_invoice.status IN ('draft', 'cancelled', 'paid') THEN
        RAISE EXCEPTION 'Impossible d''enregistrer un paiement sur cette facture';
    END IF;

    INSERT INTO public.payments (
        invoice_id,
        amount,
        payment_method,
        stripe_payment_id,
        reference,
        notes,
        created_by,
        paid_at
    )
    VALUES (
        p_invoice_id,
        p_amount,
        p_payment_method,
        p_stripe_payment_id,
        p_reference,
        p_notes,
        p_created_by,
        TIMEZONE('utc', NOW())
    )
    RETURNING id INTO v_payment_id;

    v_new_amount_paid := COALESCE(v_invoice.amount_paid, 0) + p_amount;
    v_new_status := CASE
        WHEN v_new_amount_paid >= v_invoice.total THEN 'paid'::invoice_status
        WHEN v_invoice.due_date < CURRENT_DATE THEN 'overdue'::invoice_status
        ELSE 'sent'::invoice_status
    END;

    UPDATE public.invoices
    SET
        amount_paid = v_new_amount_paid,
        status = v_new_status,
        paid_at = CASE
            WHEN v_new_status = 'paid' THEN TIMEZONE('utc', NOW())
            ELSE paid_at
        END,
        payment_method = p_payment_method::text,
        updated_at = TIMEZONE('utc', NOW())
    WHERE id = p_invoice_id;

    RETURN v_payment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
