import { supabase } from "@/integrations/supabase/client";
import type { AssetRow, InspectionRow, LocationMove, WelderRow } from "./compliance";
import { buildBreadcrumb } from "./compliance";

export const FREE_ASSET_LIMIT = 3;
export const PRO_PRICE_LABEL = "$279/mo";

export class PlanLimitError extends Error {
  constructor(message = "FREE_PLAN_LIMIT") {
    super(message);
    this.name = "PlanLimitError";
  }
}

function isLimitError(err: unknown): boolean {
  const msg =
    err instanceof Error ? err.message : String((err as { message?: string })?.message ?? "");
  return msg.includes("FREE_PLAN_LIMIT");
}

export interface AssetRecord extends AssetRow {
  inspection: InspectionRow | null;
}

export async function fetchAssets(): Promise<AssetRecord[]> {
  const [{ data: assets, error: aErr }, { data: inspections, error: iErr }] = await Promise.all([
    supabase.from("assets").select("*").order("asset_tag"),
    supabase
      .from("inspections")
      .select("*")
      .eq("status" as never, "final" as never)
      .order("inspection_date", { ascending: false }),
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

export async function fetchLocationHistory(): Promise<LocationMove[]> {
  const { data, error } = await supabase
    .from("location_history")
    .select("id, asset_id, moved_from, moved_to, created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as unknown as LocationMove[];
}

export interface NewInspectionInput {
  asset_tag: string;
  name: string;
  category: "rigging" | "welder_cert" | "heavy_equipment" | "ppe";
  make_model: string;
  serial_or_vin: string;
  site: string;
  zone: string;
  bin: string;
  inspector_name: string;
  expiration_date: string;
  result: "Pass" | "Fail" | "Needs Service";
  notes: string;
}

export async function logInspection(input: NewInspectionInput, companyId: string) {
  const { data: auth } = await supabase.auth.getUser();
  const ownerId = auth.user?.id;
  if (!ownerId) throw new Error("You must be signed in to log an inspection.");
  if (!companyId) throw new Error("No company found for this account.");

  const breadcrumb = buildBreadcrumb(input.site, input.zone, input.bin);

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
        location: breadcrumb,
        current_location: breadcrumb,
        site: input.site,
        zone: input.zone,
        bin: input.bin,
        make_model: input.make_model,
        serial_or_vin: input.serial_or_vin,
        owner_id: ownerId,
        company_id: companyId,
      } as never)
      .select("id")
      .single();
    if (error) {
      if (isLimitError(error)) throw new PlanLimitError();
      throw error;
    }
    assetId = (created as { id: string }).id;
  }

  const { error: inspErr } = await supabase.from("inspections").insert({
    asset_id: assetId,
    inspector_name: input.inspector_name,
    inspection_date: new Date().toISOString().slice(0, 10),
    expiration_date: input.expiration_date,
    result: input.result,
    notes: input.notes,
    owner_id: ownerId,
    company_id: companyId,
    inspection_type: "field",
    inspected_by: ownerId,
  } as never);
  if (inspErr) throw inspErr;
}

/** Telxon-style scan-to-transfer: move an asset to a new Site > Zone > Bin. */
export async function transferAsset(params: {
  asset: AssetRow;
  site: string;
  zone: string;
  bin: string;
  companyId: string;
}) {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("You must be signed in to move an asset.");

  const to = buildBreadcrumb(params.site, params.zone, params.bin);
  const from = params.asset.current_location || params.asset.location || "Unassigned";

  const { error: updErr } = await supabase
    .from("assets")
    .update({
      site: params.site,
      zone: params.zone,
      bin: params.bin,
      current_location: to,
      location: to,
    } as never)
    .eq("id", params.asset.id);
  if (updErr) throw updErr;

  const { error: histErr } = await supabase.from("location_history").insert({
    asset_id: params.asset.id,
    asset_tag: params.asset.asset_tag,
    moved_from: from,
    moved_to: to,
    moved_by: uid,
    company_id: params.companyId,
  } as never);
  if (histErr) throw histErr;

  return { from, to };
}

/** Simulated OCR extraction from a captured serial-plate / stamp photo. */
const OCR_SAMPLES: Array<Partial<NewInspectionInput> & { confidence: number }> = [
  {
    asset_tag: "SHK-8T-114",
    name: "8-Ton Crosby G-209A Alloy Shackle",
    category: "rigging",
    make_model: "Crosby G-209A",
    serial_or_vin: "CB4471-8T-114",
    site: "Main Fabrication Yard",
    zone: "Consumables Crib",
    bin: "Bin 4B",
    notes: "OCR: CROSBY G-209A / WLL 8T / USA / Batch 4471",
    confidence: 0.94,
  },
  {
    asset_tag: "EXC-320-07",
    name: "Tracked Excavator — Annual Inspection",
    category: "heavy_equipment",
    make_model: "Caterpillar 320 Excavator",
    serial_or_vin: "CAT0320LKZM07741",
    site: "Rig Site 14",
    zone: "Heavy Equipment Row",
    bin: "Pad 03",
    notes: "OCR: CAT 320 / SN KZM07741 / HRS 4,182",
    confidence: 0.92,
  },
  {
    asset_tag: "WLD-PW400-22",
    name: "Miller PipeWorx 400 — Calibration Stamp",
    category: "welder_cert",
    make_model: "Miller PipeWorx 400",
    serial_or_vin: "MB220398G",
    site: "Main Fabrication Yard",
    zone: "Welding Machine Bay",
    bin: "Rack 12",
    notes: "OCR: PIPEWORX 400 / SN MB220398G / CAL STAMP 09-25",
    confidence: 0.89,
  },
  {
    asset_tag: "HRN-PPE-140",
    name: "Full-Body Harness — Class E",
    category: "ppe",
    make_model: "MSA V-Series Class E",
    serial_or_vin: "MSA-140-2024",
    site: "Vocational Lab Room 102",
    zone: "Consumables Crib",
    bin: "Bin 7A",
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

/** Simulated barcode read of an asset tag or bin QR label. */
export function mockScanTag(tags: string[]): string {
  if (tags.length === 0) return "";
  return tags[Math.floor(Math.random() * tags.length)]!;
}
