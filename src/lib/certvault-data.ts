import { supabase } from "@/integrations/supabase/client";
import type { AssetRow, InspectionRow, WelderRow } from "./compliance";

export interface AssetRecord extends AssetRow {
  inspection: InspectionRow | null;
}

export async function fetchAssets(): Promise<AssetRecord[]> {
  const [{ data: assets, error: aErr }, { data: inspections, error: iErr }] = await Promise.all([
    supabase.from("assets").select("*").order("asset_tag"),
    supabase.from("inspections").select("*").order("inspection_date", { ascending: false }),
  ]);
  if (aErr) throw aErr;
  if (iErr) throw iErr;
  const latest = new Map<string, InspectionRow>();
  for (const insp of (inspections ?? []) as unknown as InspectionRow[]) {
    if (!latest.has(insp.asset_id)) latest.set(insp.asset_id, insp);
  }
  return ((assets ?? []) as unknown as AssetRow[]).map((a) => ({
    ...a,
    inspection: latest.get(a.id) ?? null,
  }));
}

export async function fetchWelders(): Promise<WelderRow[]> {
  const { data, error } = await supabase
    .from("welder_qualifications")
    .select("*")
    .order("welder_id_stamp");
  if (error) throw error;
  return (data ?? []) as unknown as WelderRow[];
}

export interface NewInspectionInput {
  asset_tag: string;
  name: string;
  category: "rigging" | "welder_cert" | "heavy_equipment" | "ppe";
  location: string;
  inspector_name: string;
  expiration_date: string;
  result: "Pass" | "Fail" | "Needs Service";
  notes: string;
}

export async function logInspection(input: NewInspectionInput) {
  const { data: existing } = await supabase
    .from("assets")
    .select("id")
    .eq("asset_tag", input.asset_tag)
    .maybeSingle();

  let assetId = (existing as { id: string } | null)?.id;

  if (!assetId) {
    const { data: created, error } = await supabase
      .from("assets")
      .insert({
        asset_tag: input.asset_tag,
        name: input.name,
        category: input.category,
        location: input.location,
      } as never)
      .select("id")
      .single();
    if (error) throw error;
    assetId = (created as { id: string }).id;
  }

  const { error: inspErr } = await supabase.from("inspections").insert({
    asset_id: assetId,
    inspector_name: input.inspector_name,
    inspection_date: new Date().toISOString().slice(0, 10),
    expiration_date: input.expiration_date,
    result: input.result,
    notes: input.notes,
  } as never);
  if (inspErr) throw inspErr;
}

/** Simulated OCR extraction from a captured serial-plate / stamp photo. */
const OCR_SAMPLES: Array<Partial<NewInspectionInput> & { confidence: number }> = [
  {
    asset_tag: "SHK-8T-114",
    name: "8-Ton Crosby G-209A Alloy Shackle",
    category: "rigging",
    location: "Bay 3 - Rack B",
    notes: "OCR: CROSBY G-209A / WLL 8T / USA / Batch 4471",
    confidence: 0.94,
  },
  {
    asset_tag: "SLG-CH-231",
    name: '1/2" Grade 100 Chain Sling - 4 Leg',
    category: "rigging",
    location: "Rig 14",
    notes: "OCR: GR100 1/2IN 4-LEG / WLL 15,000 LB / TAG 231",
    confidence: 0.91,
  },
  {
    asset_tag: "WLD-STMP-W-88",
    name: "Welder Stamp W-88 — GMAW Qualification Plate",
    category: "welder_cert",
    location: "Fab Shop - Booth 2",
    notes: "OCR: STAMP W-88 / GMAW / AWS D1.1 / 3G",
    confidence: 0.88,
  },
  {
    asset_tag: "HRN-PPE-140",
    name: "Full-Body Harness — Class E",
    category: "ppe",
    location: "Tool Crib",
    notes: "OCR: MFG 2024-03 / ANSI Z359.11 / SN 140",
    confidence: 0.86,
  },
];

export function mockOcrExtract() {
  const pick = OCR_SAMPLES[Math.floor(Math.random() * OCR_SAMPLES.length)]!;
  const exp = new Date();
  exp.setFullYear(exp.getFullYear() + 1);
  return { ...pick, expiration_date: exp.toISOString().slice(0, 10) };
}
