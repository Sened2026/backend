DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_type
        WHERE typname = 'invoice_status'
    ) THEN
        -- Drop RLS policy that references invoices.status
        DROP POLICY IF EXISTS "Anyone can create invoice signature via valid token" ON public.invoice_signatures;

        -- Drop the default before changing the type to avoid cast error
        ALTER TABLE invoices ALTER COLUMN status DROP DEFAULT;

        ALTER TYPE invoice_status RENAME TO invoice_status_old;

        CREATE TYPE invoice_status AS ENUM ('draft', 'sent', 'paid', 'overdue', 'cancelled');

        ALTER TABLE invoices
            ALTER COLUMN status TYPE invoice_status
            USING (
                CASE status::text
                    WHEN 'signed' THEN 'sent'
                    WHEN 'partial' THEN 'sent'
                    WHEN 'rejected' THEN 'cancelled'
                    WHEN 'suspended' THEN 'sent'
                    ELSE status::text
                END
            )::invoice_status;

        ALTER TABLE invoices ALTER COLUMN status SET DEFAULT 'draft'::invoice_status;

        DROP TYPE invoice_status_old;

        -- Recreate the RLS policy with the simplified statuses
        CREATE POLICY "Anyone can create invoice signature via valid token"
            ON public.invoice_signatures FOR INSERT
            WITH CHECK (EXISTS (
                SELECT 1 FROM public.invoices i
                WHERE i.id = invoice_signatures.invoice_id
                AND i.signature_token IS NOT NULL
                AND (i.signature_token_expires_at IS NULL OR i.signature_token_expires_at > NOW())
                AND i.status IN ('sent', 'overdue')
            ));
    END IF;
END $$;
