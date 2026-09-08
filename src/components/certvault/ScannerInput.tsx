import { useEffect, useRef, type KeyboardEvent } from "react";

/**
 * Hardware-scanner friendly input.
 *
 * In gun mode the field is taken out of the tab order and the virtual keyboard is
 * suppressed (inputMode="none"), and a window-level keydown listener collects the
 * burst instead — keystrokes land in a ref buffer, never React state, so a rapid
 * laser burst cannot lose characters to a mid-burst re-render. Inter-character
 * latency under 50ms marks the burst as machine-fired; the buffer commits on
 * Enter or Tab, which every scanner gun sends as its terminator.
 */
export function ScannerInput({
  gunMode,
  placeholder,
  value,
  onChange,
  onScan,
  autoFocus,
  captureWindow,
}: {
  gunMode: boolean;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  onScan: (code: string) => void;
  autoFocus?: boolean;
  /** When true this input owns the window-level burst capture in gun mode. */
  captureWindow?: boolean;
}) {
  const buffer = useRef("");
  const lastKey = useRef(0);

  const feed = (key: string): string | null => {
    const now = Date.now();
    const fast = now - lastKey.current < 50;
    lastKey.current = now;

    if (key === "Enter" || key === "Tab") {
      const code = buffer.current.trim();
      buffer.current = "";
      return code || null;
    }
    if (key === "Backspace") {
      buffer.current = buffer.current.slice(0, -1);
      return null;
    }
    if (key.length === 1) {
      // A pause longer than 50ms means a human typed it — restart the burst.
      buffer.current = fast ? buffer.current + key : key;
    }
    return null;
  };

  // Window-level capture: the gun can fire even with nothing focused.
  useEffect(() => {
    if (!gunMode || !captureWindow) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typingElsewhere =
        el && (el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
      if (typingElsewhere) return;
      if (e.key === "Enter" || e.key === "Tab") {
        const code = feed(e.key);
        if (code) {
          e.preventDefault();
          onChange(code);
          onScan(code);
        }
        return;
      }
      feed(e.key);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [gunMode, captureWindow, onScan, onChange]);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (gunMode && captureWindow) return; // window listener owns it
    const code = feed(e.key);
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      const final = code || (e.currentTarget.value ?? "").trim();
      if (final) onScan(final);
    }
  };

  return (
    <input
      autoFocus={autoFocus}
      value={value}
      inputMode={gunMode ? "none" : "text"}
      tabIndex={gunMode ? -1 : 0}
      readOnly={gunMode && captureWindow}
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      className="tag-mono w-full rounded-md border border-border bg-input px-3 py-3 text-base outline-none placeholder:text-muted-foreground focus:border-primary"
    />
  );
}
