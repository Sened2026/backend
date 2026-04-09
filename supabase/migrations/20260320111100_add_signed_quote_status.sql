DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_type
        WHERE typname = 'quote_status'
    ) AND NOT EXISTS (
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'quote_status'
          AND e.enumlabel = 'signed'
    ) THEN
        ALTER TYPE quote_status ADD VALUE 'signed' AFTER 'accepted';
    END IF;
END $$;
