ALTER TABLE public.location_history
  ADD COLUMN IF NOT EXISTS captured_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS local_sequence_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS expected_from text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS sync_status text NOT NULL DEFAULT 'synced';

ALTER TABLE public.location_history
  ADD CONSTRAINT location_history_sync_status_chk
  CHECK (sync_status IN ('synced', 'offline_sync', 'conflict'));

CREATE INDEX IF NOT EXISTS location_history_asset_captured_idx
  ON public.location_history (asset_id, captured_at DESC);