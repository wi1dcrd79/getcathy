CREATE TYPE public.asset_category AS ENUM ('rigging','welder_cert','heavy_equipment','ppe');
CREATE TYPE public.inspection_result AS ENUM ('Pass','Fail','Needs Service');
CREATE TYPE public.weld_process AS ENUM ('SMAW','GTAW','GMAW','FCAW');

CREATE TABLE public.assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_tag text NOT NULL UNIQUE,
  name text NOT NULL,
  category public.asset_category NOT NULL DEFAULT 'rigging',
  location text NOT NULL DEFAULT '',
  assigned_to text,
  image_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assets TO anon, authenticated;
GRANT ALL ON public.assets TO service_role;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "assets_public_all" ON public.assets FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  inspector_name text NOT NULL,
  inspection_date date NOT NULL DEFAULT current_date,
  expiration_date date NOT NULL,
  result public.inspection_result NOT NULL DEFAULT 'Pass',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inspections TO anon, authenticated;
GRANT ALL ON public.inspections TO service_role;
ALTER TABLE public.inspections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inspections_public_all" ON public.inspections FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.welder_qualifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  welder_name text NOT NULL,
  welder_id_stamp text NOT NULL,
  process public.weld_process NOT NULL DEFAULT 'SMAW',
  standard text NOT NULL,
  continuity_date date NOT NULL,
  expiration_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.welder_qualifications TO anon, authenticated;
GRANT ALL ON public.welder_qualifications TO service_role;
ALTER TABLE public.welder_qualifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "welders_public_all" ON public.welder_qualifications FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

INSERT INTO public.assets (id, asset_tag, name, category, location, assigned_to) VALUES
 ('11111111-1111-4111-8111-111111111111','SHK-5T-092','5-Ton Crosby Screw-Pin Anchor Shackle','rigging','Bay 3 - Rack B','Ramon Ortiz'),
 ('22222222-2222-4222-8222-222222222222','SLG-CH-118','3/8" Grade 100 Chain Sling - 2 Leg','rigging','Rig 14','Dale Whitcomb'),
 ('33333333-3333-4333-8333-333333333333','SLG-SY-204','2" Synthetic Round Sling - 10ft','rigging','Bay 1 - Rack A',NULL),
 ('44444444-4444-4444-8444-444444444444','WLD-MIL-350','Miller Dimension 652 Welding Machine','heavy_equipment','Fab Shop - Booth 4','Travis Kane'),
 ('55555555-5555-4555-8555-555555555555','HRN-PPE-061','Miller Revolution Full-Body Harness','ppe','Tool Crib','Jesse Marín'),
 ('66666666-6666-4666-8666-666666666666','HKB-2T-077','2-Ton Swivel Hoist Ring','rigging','Bay 3 - Rack C',NULL);

INSERT INTO public.inspections (asset_id, inspector_name, inspection_date, expiration_date, result, notes) VALUES
 ('11111111-1111-4111-8111-111111111111','M. Delgado', current_date - 40, current_date + 320, 'Pass','Pin threads clean, no elongation. Load rating legible.'),
 ('22222222-2222-4222-8222-222222222222','M. Delgado', current_date - 350, current_date + 12, 'Pass','Minor surface wear on master link. Re-inspect at 12 days.'),
 ('33333333-3333-4333-8333-333333333333','K. Boone', current_date - 400, current_date - 22, 'Fail','Cut through outer jacket, core exposed. Removed from service.'),
 ('44444444-4444-4444-8444-444444444444','T. Reyes', current_date - 90, current_date + 275, 'Pass','Calibration verified, ground clamp replaced.'),
 ('55555555-5555-4555-8555-555555555555','K. Boone', current_date - 160, current_date + 25, 'Needs Service','Leg strap stitching fraying - schedule replacement.'),
 ('66666666-6666-4666-8666-666666666666','T. Reyes', current_date - 15, current_date + 350, 'Pass','Proof tested at 2x WLL. No deformation.');

INSERT INTO public.welder_qualifications (welder_name, welder_id_stamp, process, standard, continuity_date, expiration_date) VALUES
 ('Ramon Ortiz','W-79','GTAW','ASME Sec IX / 6G', current_date - 45, current_date + 280),
 ('Dale Whitcomb','W-112','FCAW','AWS D1.1 / 3G-4G', current_date - 168, current_date + 60);