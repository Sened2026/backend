-- Fix: convert_quote_to_invoice échoue après signature car le statut 'signed'
-- n'était pas dans la liste des statuts autorisés pour la conversion.
-- Ajout de 'signed' et 'viewed' aux statuts acceptés.

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
    WHERE id = p_quote_id AND status IN ('accepted', 'sent', 'signed', 'viewed');

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
