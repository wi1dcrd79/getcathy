import { useRef, useState } from "react";
import { logInspection, mockOcrExtract, type NewInspectionInput } from "@/lib/certvault-data";
import { CATEGORY_LABEL, type AssetCategory } from "@/lib/compliance";

const EMPTY: NewInspectionInput = {
  asset_tag: "",
  name: "",
  category: "rigging",
  location: "",
  inspector_name: "",
  expiration_date: "",
  result: "Pass",
  notes: "",
};

const field =
  "w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary";
const label = "mb-1 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground";

export function ScanSheet({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<NewInspectionInput>(EMPTY);
  const [photo, setPhoto] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const set = (k: keyof NewInspectionInput, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleFile = (file: File) => {
    setPhoto(URL.createObjectURL(file));
    setScanning(true);
    setConfidence(null);
    window.setTimeout(() => {
      const ocr = mockOcrExtract();
      setForm((f) => ({
        ...f,
        asset_tag: ocr.asset_tag ?? f.asset_tag,
        name: ocr.name ?? f.name,
        category: (ocr.category as AssetCategory) ?? f.category,
        location: ocr.location ?? f.location,
        notes: ocr.notes ?? f.notes,
        expiration_date: ocr.expiration_date ?? f.expiration_date,
      }));
      setConfidence(ocr.confidence);
      setScanning(false);
    }, 1400);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await logInspection(form);
      setForm(EMPTY);
      setPhoto(null);
      setConfidence(null);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this inspection.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="no-print fixed inset-0 z-50 flex items-end justify-center bg-background/80 backdrop-blur-sm sm:items-center">
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-border bg-surface p-5 sm:max-w-lg sm:rounded-2xl">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold uppercase">Quick Scan</h2>
            <p className="text-xs text-muted-foreground">
              Capture the serial plate, load tag, or welder stamp.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md border border-border px-2 py-1 text-xs uppercase text-muted-foreground"
          >
            Close
          </button>
        </div>

        <div className="mb-4">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary/50 bg-primary/5 px-4 py-8 text-primary"
          >
            {photo ? (
              <img
                src={photo}
                alt="Captured asset plate"
                className="max-h-40 rounded-md border border-border object-contain"
              />
            ) : (
              <>
                <span className="text-3xl">▣</span>
                <span className="text-sm font-semibold uppercase tracking-widest">
                  Open camera / upload photo
                </span>
              </>
            )}
          </button>
          {scanning && (
            <p className="mt-2 animate-pulse text-center text-xs uppercase tracking-widest text-accent">
              Reading plate data…
            </p>
          )}
          {confidence !== null && !scanning && (
            <p className="mt-2 text-center text-xs uppercase tracking-widest text-success">
              Data extracted · {(confidence * 100).toFixed(0)}% confidence
            </p>
          )}
        </div>

        <form onSubmit={submit} className="grid grid-cols-2 gap-3">
          <div className="col-span-1">
            <label className={label}>Asset Tag</label>
            <input
              required
              className={`${field} tag-mono`}
              value={form.asset_tag}
              onChange={(e) => set("asset_tag", e.target.value.toUpperCase())}
              placeholder="SHK-5T-092"
            />
          </div>
          <div className="col-span-1">
            <label className={label}>Category</label>
            <select
              className={field}
              value={form.category}
              onChange={(e) => set("category", e.target.value)}
            >
              {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label className={label}>Description</label>
            <input required className={field} value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div className="col-span-1">
            <label className={label}>Location</label>
            <input className={field} value={form.location} onChange={(e) => set("location", e.target.value)} />
          </div>
          <div className="col-span-1">
            <label className={label}>Inspector</label>
            <input
              required
              className={field}
              value={form.inspector_name}
              onChange={(e) => set("inspector_name", e.target.value)}
            />
          </div>
          <div className="col-span-1">
            <label className={label}>Expires</label>
            <input
              required
              type="date"
              className={field}
              value={form.expiration_date}
              onChange={(e) => set("expiration_date", e.target.value)}
            />
          </div>
          <div className="col-span-1">
            <label className={label}>Result</label>
            <select className={field} value={form.result} onChange={(e) => set("result", e.target.value)}>
              <option>Pass</option>
              <option>Fail</option>
              <option>Needs Service</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className={label}>Notes</label>
            <textarea
              rows={2}
              className={field}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </div>
          {error && <p className="col-span-2 text-sm text-destructive">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            className="col-span-2 rounded-lg bg-primary px-4 py-3 text-sm font-bold uppercase tracking-widest text-primary-foreground disabled:opacity-60"
          >
            {saving ? "Saving…" : "Log Inspection"}
          </button>
        </form>
      </div>
    </div>
  );
}
