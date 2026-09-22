import { useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import { askAssistant, type AssistantMessage } from "@/lib/assistant.functions";

const MAX_TRACKED_ERRORS = 6;

function describe(value: unknown): string {
  if (value instanceof Error) {
    return `${value.name}: ${value.message}${value.stack ? `\n${value.stack.split("\n").slice(1, 4).join("\n")}` : ""}`;
  }
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [alerts, setAlerts] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [messages, setMessages] = useState<AssistantMessage[]>([
    {
      role: "assistant",
      content:
        "CATHY Assist here. Ask me how to scan, transfer, import a crew list or pull an audit binder — and I'll flag anything that breaks while you work.",
    },
  ]);
  const scroller = useRef<HTMLDivElement>(null);
  const routePath = useRouterState({ select: (s) => s.location.pathname });

  // Watch for crashes, failed work and lost signal while the crew is in the field.
  useEffect(() => {
    const push = (detail: string, warn: string) => {
      setErrors((prev) => [...prev, detail].slice(-MAX_TRACKED_ERRORS));
      setAlerts((n) => n + 1);
      toast.error(warn, {
        description: "Tap Assist for help with this.",
        action: { label: "Assist", onClick: () => setOpen(true) },
      });
    };

    const onError = (event: ErrorEvent) => {
      push(describe(event.error ?? event.message), "Something on this screen stopped working");
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      push(describe(event.reason), "An action didn't finish");
    };
    const onOffline = () => {
      push("Device went offline", "You're offline — scans will be saved and synced later");
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    if (open) setAlerts(0);
  }, [open]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages, busy]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    const next: AssistantMessage[] = [...messages, { role: "user", content: question }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const { reply } = await askAssistant({
        data: {
          messages: next.slice(-12).map((m) => ({ role: m.role, content: m.content })),
          route: routePath ?? null,
          errors,
          online: typeof navigator === "undefined" ? true : navigator.onLine,
        },
      });
      setMessages([...next, { role: "assistant", content: reply }]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The assistant is unavailable.";
      setMessages([...next, { role: "assistant", content: message }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close CATHY Assist" : "Open CATHY Assist"}
        className="fixed bottom-4 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full border-2 border-primary bg-card text-xs font-bold uppercase tracking-widest text-primary shadow-lg"
        style={{ marginBottom: "env(safe-area-inset-bottom)" }}
      >
        {open ? "×" : "AI"}
        {!open && alerts > 0 && (
          <span className="absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-bold text-destructive-foreground">
            {alerts}
          </span>
        )}
      </button>

      {open && (
        <div
          className="fixed bottom-20 right-2 z-50 flex max-h-[70vh] w-[min(24rem,calc(100vw-1rem))] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-2xl"
          style={{ marginBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="flex items-center justify-between border-b border-border px-3 py-3">
            <div>
              <p className="text-sm font-bold uppercase tracking-widest text-foreground">CATHY Assist</p>
              <p className="text-[11px] text-muted-foreground">
                {errors.length ? `${errors.length} recent issue(s) detected` : "Help, troubleshooting & alerts"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close assistant"
              className="flex h-12 w-12 items-center justify-center rounded-md border border-border text-lg text-muted-foreground"
            >
              ×
            </button>
          </div>

          <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
            {messages.map((m, i) => (
              <div
                key={i}
                className={
                  m.role === "user"
                    ? "ml-auto max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
                    : "max-w-[90%] whitespace-pre-wrap rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                }
              >
                {m.content}
              </div>
            ))}
            {busy && <p className="text-xs uppercase tracking-widest text-muted-foreground">Thinking…</p>}
          </div>

          {errors.length > 0 && (
            <div className="border-t border-border px-3 py-2">
              <button
                type="button"
                onClick={() => void send("Something just went wrong on this screen. What do I do?")}
                className="min-h-12 w-full rounded-md border border-destructive px-3 text-xs font-semibold uppercase tracking-widest text-destructive"
              >
                Troubleshoot the last problem
              </button>
            </div>
          )}

          <form
            className="flex gap-2 border-t border-border p-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask CATHY Assist…"
              className="h-12 flex-1 rounded-md border border-border bg-input px-3 text-sm outline-none focus:border-primary"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="h-12 rounded-md bg-primary px-4 text-xs font-bold uppercase tracking-widest text-primary-foreground disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </div>
      )}
    </>
  );
}
