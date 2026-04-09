ALTER TABLE public.reminders
ADD COLUMN IF NOT EXISTS level SMALLINT
CHECK (level IN (1, 2, 3));
