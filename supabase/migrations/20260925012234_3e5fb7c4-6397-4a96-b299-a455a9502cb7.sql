DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'personnel_certs_verified_by_fkey'
  ) THEN
    ALTER TABLE public.personnel_certs
      ADD CONSTRAINT personnel_certs_verified_by_fkey
        FOREIGN KEY (verified_by) REFERENCES public.profiles(id)
        ON DELETE SET NULL
        NOT VALID;
  END IF;
END $$;