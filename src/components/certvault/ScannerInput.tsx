import { useRef, type KeyboardEvent } from "react";

/**
 * Hardware-scanner friendly input.
 * In gun mode the virtual keyboard is suppressed (inputMode="none") and
 * keystrokes are collected in a ref buffer — never React state — so a rapid
 * laser burst cannot lose characters to a mid-burst re-render. The buffer is
 * committed on Enter, which every scanner gun fires as its terminator.
 */
export function ScannerInput({
  gunMode,
  placeholder,
  value,
  onChange,
  onScan,
  autoFocus,
}: {
  gunMode: boolean;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  onScan: (code: string) => void;
  autoFocus?: boolean;
}) {
  const buffer = useRef("");
  const lastKey = useRef(0);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const now = Date.now();
    // A pause longer than 120ms means a human typed it — restart the burst.
    if (now - lastKey.current > 120) buffer.current = "";
    lastKey.current = now;

    if (e.key === "Enter") {
      e.preventDefault();
      const code = (buffer.current || (e.currentTarget.value ?? "")).trim();
      buffer.current = "";
      if (code) onScan(code);
      return;
    }
    if (e.key === "Backspace") {
      buffer.current = buffer.current.slice(0, -1);
      return;
    }
    if (e.key.length === 1) buffer.current += e.key;
  };

  return (
    <input
      autoFocus={autoFocus}
      value={value}
      inputMode={gunMode ? "none" : "text"}
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
