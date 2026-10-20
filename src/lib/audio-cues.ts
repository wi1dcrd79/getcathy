/** Tiny Web Audio cue synthesizer. Browser-only; call from effects/handlers. */
let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

/** Mobile browsers start AudioContext suspended; resume on the first user gesture. */
export function installAudioUnlock(): () => void {
  const events = ["pointerdown", "touchstart", "keydown"] as const;
  const unlock = () => {
    const c = getCtx();
    if (c && c.state === "suspended") void c.resume().catch(() => {});
    if (c && c.state === "running") remove();
  };
  const remove = () => events.forEach((e) => window.removeEventListener(e, unlock, true));
  events.forEach((e) => window.addEventListener(e, unlock, true));
  return remove;
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = "sine") {
  const c = getCtx();
  if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t = c.currentTime + start;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.2, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

export type CueKind = "success" | "duplicate" | "error";

export function playCue(kind: CueKind) {
  try {
    const c = getCtx();
    if (c?.state === "suspended") void c.resume().catch(() => {});
    if (kind === "success") {
      tone(880, 0, 0.09);
      tone(1760, 0.11, 0.12);
    } else if (kind === "duplicate") {
      tone(330, 0, 0.12);
      tone(220, 0.15, 0.16);
    } else {
      tone(180, 0, 0.35, "sawtooth");
    }
  } catch {
    /* audio is best-effort */
  }
}
