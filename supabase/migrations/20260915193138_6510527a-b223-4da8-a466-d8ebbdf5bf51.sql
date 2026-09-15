CREATE TABLE IF NOT EXISTS public.user_sessions (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    current_session_token TEXT,
    updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.user_sessions (user_id, current_session_token)
SELECT id, current_session_token
FROM public.profiles
WHERE current_session_token IS NOT NULL
ON CONFLICT (user_id) DO UPDATE
SET current_session_token = EXCLUDED.current_session_token;

ALTER TABLE public.profiles DROP COLUMN IF EXISTS current_session_token;

GRANT SELECT, INSERT, UPDATE ON public.user_sessions TO authenticated;
GRANT ALL ON public.user_sessions TO service_role;

ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_sessions_owner_only"
ON public.user_sessions
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.rotate_session_token(_token text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public'
AS $$
  INSERT INTO public.user_sessions (user_id, current_session_token)
  VALUES (auth.uid(), _token)
  ON CONFLICT (user_id) DO UPDATE
    SET current_session_token = EXCLUDED.current_session_token,
        updated_at = now();
$$;