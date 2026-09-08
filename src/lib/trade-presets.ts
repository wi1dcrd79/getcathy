export interface TradeCert {
  name: string;
  /** Months until the certificate/continuity clock lapses. */
  months: number;
  note?: string;
}

export interface TradePreset {
  key: string;
  title: string;
  blurb: string;
  certs: TradeCert[];
}

export const TRADE_PRESETS: TradePreset[] = [
  {
    key: "combo-welder",
    title: "Combo Welder & Pipefitter",
    blurb: "ASME Section IX rolling 6-month continuity clock with stamped processes.",
    certs: [
      { name: "ASME Section IX — GTAW continuity", months: 6, note: "Rolling 6-month clock" },
      { name: "ASME Section IX — SMAW continuity", months: 6, note: "Rolling 6-month clock" },
      { name: "ASME Section IX — GMAW continuity", months: 6, note: "Rolling 6-month clock" },
      { name: "ASME Section IX — FCAW continuity", months: 6, note: "Rolling 6-month clock" },
      { name: "AWS D1.1 Structural Qualification", months: 6 },
      { name: "API 1104 Pipeline Qualification", months: 6 },
    ],
  },
  {
    key: "boilermaker",
    title: "Boilermaker",
    blurb: "Pressure vessel and power boiler work under National Board stamps.",
    certs: [
      { name: "ASME Section I — Power Boilers", months: 12 },
      { name: "ASME Section VIII — Pressure Vessels", months: 12 },
      { name: "National Board 'R' Stamp", months: 36 },
      { name: "National Board 'S' Stamp", months: 36 },
      { name: "Confined Space Entry", months: 12 },
    ],
  },
  {
    key: "commercial-plumber",
    title: "Commercial Plumber",
    blurb: "Licensing, backflow and medical gas qualifications.",
    certs: [
      { name: "Master Plumber License", months: 24 },
      { name: "Journeyman Plumber License", months: 24 },
      { name: "ASSE 5110 Backflow Tester", months: 12 },
      { name: "NFPA 99 Medical Gas (ASSE 6010)", months: 36 },
      { name: "Medical Gas Brazing (ASME Sec IX)", months: 6 },
    ],
  },
  {
    key: "crane-heavy-iron",
    title: "Crane & Heavy Iron",
    blurb: "NCCCO cards, DOT medicals and 3-year equipment re-evaluations.",
    certs: [
      { name: "NCCCO Mobile Crane Operator", months: 60 },
      { name: "DOT / NCCCO Medical Card", months: 24 },
      { name: "Forklift Re-Evaluation", months: 36 },
      { name: "Telehandler Re-Evaluation", months: 36 },
      { name: "Skid Steer Re-Evaluation", months: 36 },
      { name: "Backhoe Re-Evaluation", months: 36 },
      { name: "Excavator Re-Evaluation", months: 36 },
    ],
  },
  {
    key: "rigging-safety",
    title: "Rigging & Safety",
    blurb: "Site access, competent-person and coatings qualifications.",
    certs: [
      { name: "Scaffold Competent Person", months: 24 },
      { name: "Qualified Rigger / Signalperson", months: 36 },
      { name: "Blaster / Painter (AMPP / NACE)", months: 36 },
      { name: "General Labor Orientation", months: 12 },
      { name: "OSHA 10", months: 60 },
      { name: "OSHA 30", months: 60 },
      { name: "TWIC Card", months: 60 },
      { name: "Safety Council — Basic Orientation Plus", months: 12 },
    ],
  },
];

export function addMonths(iso: string, months: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}
