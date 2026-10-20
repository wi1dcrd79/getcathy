CREATE UNIQUE INDEX IF NOT EXISTS idx_assets_company_asset_tag ON public.assets (company_id, asset_tag);
ALTER TABLE public.assets DROP CONSTRAINT IF EXISTS assets_asset_tag_key;
CREATE INDEX IF NOT EXISTS assets_asset_tag_idx ON public.assets (asset_tag);