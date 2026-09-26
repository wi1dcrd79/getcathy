-- Append-only asset ledger (multi-tenant, offline-first outbox target)
CREATE TABLE public.asset_ledger (
  id uuid PRIMARY KEY, -- generated client-side at capture time
  company_id uuid NOT NULL REFERENCES public.companies(id),
  asset_id uuid NOT NULL REFERENCES public.assets(id),
  actor_id uuid REFERENCES public.profiles(id),
  action_type text NOT NULL CHECK (action_type IN ('CHECKOUT', 'CHECKIN', 'TRANSFER')),
  expected_prior_event_id uuid REFERENCES public.asset_ledger(id),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX asset_ledger_company_asset_idx ON public.asset_ledger (company_id, asset_id, created_at);

GRANT SELECT, INSERT ON public.asset_ledger TO authenticated;
GRANT ALL ON public.asset_ledger TO service_role;

ALTER TABLE public.asset_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members read own ledger" ON public.asset_ledger
  FOR SELECT TO authenticated
  USING (company_id = app_internal.get_current_company_id() OR app_internal.is_super_admin());

CREATE POLICY "Company members append own ledger" ON public.asset_ledger
  FOR INSERT TO authenticated
  WITH CHECK (company_id = app_internal.get_current_company_id() AND actor_id = auth.uid());

-- Asset state pointer for optimistic concurrency
ALTER TABLE public.assets ADD COLUMN current_ledger_event_id uuid REFERENCES public.asset_ledger(id);

-- Conflict exception queue (manager review)
CREATE TABLE public.ledger_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  asset_id uuid NOT NULL REFERENCES public.assets(id),
  conflicting_event_id uuid REFERENCES public.asset_ledger(id),
  competing_actor_id uuid REFERENCES public.profiles(id),
  status text NOT NULL DEFAULT 'PENDING_REVIEW' CHECK (status IN ('PENDING_REVIEW', 'RESOLVED')),
  resolved_by uuid REFERENCES public.profiles(id),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ledger_conflicts_company_status_idx ON public.ledger_conflicts (company_id, status);

GRANT SELECT ON public.ledger_conflicts TO authenticated;
GRANT UPDATE ON public.ledger_conflicts TO authenticated;
GRANT ALL ON public.ledger_conflicts TO service_role;

ALTER TABLE public.ledger_conflicts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members read own conflicts" ON public.ledger_conflicts
  FOR SELECT TO authenticated
  USING (company_id = app_internal.get_current_company_id() OR app_internal.is_super_admin());

CREATE POLICY "Admins and safety directors resolve conflicts" ON public.ledger_conflicts
  FOR UPDATE TO authenticated
  USING (
    company_id = app_internal.get_current_company_id()
    AND app_internal.current_user_role() IN ('company_admin', 'safety_director')
  )
  WITH CHECK (
    company_id = app_internal.get_current_company_id()
    AND app_internal.current_user_role() IN ('company_admin', 'safety_director')
  );