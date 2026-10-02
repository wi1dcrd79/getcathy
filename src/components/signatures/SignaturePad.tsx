import { useEffect, useRef, useState } from "react";

interface Props {
  busy?: boolean;
  confirmLabel?: string;
  onConfirm: (pngBase64: string) => void;
  onCancel: () => void;
}

type Pt = { x: number; y: number };

/**
 * Glove-friendly canvas pad. Pointer events cover finger, stylus, glove and mouse;
 * strokes are smoothed with quadratic curves through segment midpoints.
 * Images are NOT uploaded from the client — the PNG goes to submitSignature,
 * which writes it to the private `signatures` bucket only after verification.
 */
export function SignaturePad({ busy, confirmLabel = "Sign", onConfirm, onCancel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pts = useRef<Pt[]>([]);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ratio = window.devicePixelRatio || 1;
    const r = c.getBoundingClientRect();
    c.width = r.width * ratio;
    c.height = r.height * ratio;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 3.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111111"; // ink colour baked into the PNG, independent of theme
  }, []);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>): Pt => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const p = pos(e);
    pts.current = [p];
    const ctx = e.currentTarget.getContext("2d");
    if (ctx) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.4, 0, Math.PI * 2);
      ctx.fillStyle = "#111111";
      ctx.fill();
    }
    setHasInk(true);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    const p = pos(e);
    const arr = pts.current;
    arr.push(p);
    if (arr.length < 3) return;
    const [a, b, c] = arr.slice(-3) as [Pt, Pt, Pt];
    const m1 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const m2 = { x: (b.x + c.x) / 2, y: (b.y + c.y) / 2 };
    ctx.beginPath();
    ctx.moveTo(m1.x, m1.y);
    ctx.quadraticCurveTo(b.x, b.y, m2.x, m2.y);
    ctx.stroke();
  }

  function up() {
    drawing.current = false;
    pts.current = [];
  }

  function clear() {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    setHasInk(false);
  }

  function confirm() {
    const c = canvasRef.current;
    if (!c || !hasInk) return;
    onConfirm(c.toDataURL("image/png").split(",")[1] ?? "");
  }

  return (
    <div>
      <div className="relative mt-3">
        <canvas
          ref={canvasRef}
          aria-label="Signature area — sign with your finger, glove or stylus"
          className="h-52 w-full touch-none rounded-md border-2 border-dashed border-primary bg-foreground"
          style={{ touchAction: "none" }}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerLeave={up}
          onPointerCancel={up}
        />
        <div className="pointer-events-none absolute inset-x-6 bottom-10 flex items-end gap-2">
          <span className="text-lg font-bold text-background/60">×</span>
          <span className="mb-1 flex-1 border-b-2 border-background/40" />
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <button type="button" onClick={onCancel} disabled={busy} className="h-12 rounded-md border border-border text-xs font-semibold uppercase tracking-widest">
          Cancel
        </button>
        <button type="button" onClick={clear} disabled={busy || !hasInk} className="h-12 rounded-md border border-border text-xs font-semibold uppercase tracking-widest disabled:opacity-40">
          Clear
        </button>
        <button type="button" onClick={confirm} disabled={busy || !hasInk} className="h-12 rounded-md bg-accent text-xs font-bold uppercase tracking-widest text-accent-foreground disabled:opacity-40">
          {busy ? "Signing…" : confirmLabel}
        </button>
      </div>
    </div>
  );
}
