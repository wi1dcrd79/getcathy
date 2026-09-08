import { useEffect, useRef, useState } from "react";
import { BRAND_DIVISION, TERMS_SECTIONS, TERMS_VERSION } from "@/lib/legal";

interface Props {
  open: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

export function TermsModal({ open, onAccept, onDecline }: Props) {
  const [scrolledToEnd, setScrolledToEnd] = useState(false);
  const [checked, setChecked] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setScrolledToEnd(false);
      setChecked(false);
    }
  }, [open]);

  if (!open) return null;

  const onScroll = () => {
    const el = bodyRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) setScrolledToEnd(true);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Terms of Service"
      className="fixed inset-0 z-50 flex items-end justify-center bg-background/85 p-0 backdrop-blur sm:items-center sm:p-4"
    >
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-border bg-surface sm:rounded-2xl">
        <div className="border-b border-border px-5 py-4">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground">{BRAND_DIVISION}</p>
          <h2 className="text-lg font-bold uppercase text-foreground">Terms of Service</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Version {TERMS_VERSION} · You must review and accept before creating an account.
          </p>
        </div>

        <div ref={bodyRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-5 py-4 text-sm text-muted-foreground">
          {TERMS_SECTIONS.map((s) => (
            <section key={s.heading} className="mb-5">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-foreground">{s.heading}</h3>
              {s.body.map((p, i) => (
                <p key={i} className="mb-2 leading-relaxed">
                  {p}
                </p>
              ))}
            </section>
          ))}
        </div>

        <div className="border-t border-border px-5 py-4">
          <label className="flex items-start gap-3 text-xs text-foreground">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-[var(--color-primary)]"
              checked={checked}
              disabled={!scrolledToEnd}
              onChange={(e) => setChecked(e.target.checked)}
            />
            <span>
              I have read and agree to the Terms of Service, including the restrictions on scraping, reverse
              engineering and cloning, and the limitation of liability for third-party regulatory audits.
              {!scrolledToEnd && (
                <span className="block text-muted-foreground"> Scroll to the end of the terms to enable.</span>
              )}
            </span>
          </label>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={onDecline}
              className="flex-1 rounded-lg border border-border px-4 py-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground hover:border-primary"
            >
              Decline
            </button>
            <button
              type="button"
              disabled={!checked}
              onClick={onAccept}
              className="flex-1 rounded-lg bg-primary px-4 py-3 text-xs font-bold uppercase tracking-widest text-primary-foreground disabled:opacity-50"
            >
              Accept &amp; Continue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
