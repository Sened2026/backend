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

    IF EXISTS (
        SELECT 1
        FROM public.invoices
        WHERE parent_invoice_id = p_invoice_id
          AND type = 'credit_note'
    ) THEN
        RAISE EXCEPTION 'Un avoir existe déjà pour cette facture';
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
