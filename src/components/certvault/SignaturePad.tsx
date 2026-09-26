import { useEffect, useRef, useState } from "react";

interface Props {
  title: string;
  subtitle?: string;
  busy?: boolean;
  onConfirm: (pngBase64: string) => void;
  onCancel: () => void;
}

/**
 * Full-width signature capture pad. Pointer events cover finger, stylus and
 * gloved touch; every control is >=48px tall for field use.
 */
export function SignaturePad({ title, subtitle, busy, onConfirm, onCancel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111111";
  }, []);

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = point(e);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || !last.current) return;
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    if (!hasInk) setHasInk(true);
  }

  function up() {
    drawing.current = false;
    last.current = null;
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
  }

  function confirm() {
    const canvas = canvasRef.current;
    if (!canvas || !hasInk) return;
    const dataUrl = canvas.toDataURL("image/png");
    onConfirm(dataUrl.split(",")[1] ?? "");
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 backdrop-blur sm:items-center"
    >
      <div className="safe-bottom w-full max-w-xl rounded-t-xl border border-border bg-card p-4 sm:rounded-xl">
        <h2 className="text-base font-bold uppercase tracking-wide">{title}</h2>
        {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
        <canvas
          ref={canvasRef}
          aria-label="Signature area — sign with your finger or stylus"
          className="mt-3 h-48 w-full touch-none rounded-md border-2 border-dashed border-primary bg-foreground"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerLeave={up}
          onPointerCancel={up}
        />
        <p className="mt-2 text-[11px] text-muted-foreground">
          By signing you attest this record is accurate. Once signed it is frozen and cannot be edited.
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="h-12 rounded-md border border-border text-xs font-semibold uppercase tracking-widest"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={clear}
            disabled={busy || !hasInk}
            className="h-12 rounded-md border border-border text-xs font-semibold uppercase tracking-widest disabled:opacity-40"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={busy || !hasInk}
            className="h-12 rounded-md bg-accent text-xs font-bold uppercase tracking-widest text-accent-foreground disabled:opacity-40"
          >
            {busy ? "Signing…" : "Sign"}
          </button>
        </div>
      </div>
    </div>
  );
}
