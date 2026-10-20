import { useEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { limitCodeOf } from "@/lib/certvault-data";
import { installAudioUnlock, playCue } from "@/lib/audio-cues";

/** Max gap between keystrokes for them to count as one scanner burst. */
export const SCAN_KEY_GAP_MS = 50;
export const MIN_SCAN_LENGTH = 4; // buffer length must be > 3
export const DUPLICATE_WINDOW_MS = 2000;
export const UNDO_WINDOW_MS = 10_000;
/** Routes that own their own scanner handling. */
const DISABLED_PATHS = ["/scan-transfer"];

type Editable = HTMLInputElement | HTMLTextAreaElement;

function editableTarget(el: EventTarget | null): Editable | null {
  if (el instanceof HTMLTextAreaElement) return el;
  if (el instanceof HTMLInputElement) {
    const t = el.type;
    if (["text", "search", "email", "url", "tel", "password", "number", ""].includes(t)) return el;
  }
  return null;
}

/** Remove one leaked character just before the caret, firing React's onChange. */
function removeLeakedChar(el: Editable, ch: string) {
  try {
    const pos = el.selectionStart ?? el.value.length;
    if (pos < 1 || el.value[pos - 1] !== ch) return;
    const next = el.value.slice(0, pos - 1) + el.value.slice(pos);
    const proto =
      el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, next);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.setSelectionRange?.(pos - 1, pos - 1);
  } catch {
    /* number inputs etc. don't support selection — best effort */
  }
}

export function GlobalBarcodeScanner() {
  const { session, user } = useAuth();
  const { companyId } = useProfile();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const queryClient = useQueryClient();

  const disabled = !session || !companyId || DISABLED_PATHS.includes(pathname);

  const recent = useRef(new Map<string, number>());
  const ctx = useRef({ companyId, userId: user?.id });
  ctx.current = { companyId, userId: user?.id };

  useEffect(() => installAudioUnlock(), []);

  useEffect(() => {
    if (disabled) return;

    let buffer = "";
    let last = 0;
    let burst = false;
    let first: { ch: string; el: Editable | null } | null = null;

    const reset = () => {
      buffer = "";
      burst = false;
      first = null;
    };

    const handleScan = async (code: string) => {
      const now = Date.now();
      const seen = recent.current.get(code);
      if (seen && now - seen < DUPLICATE_WINDOW_MS) return;
      recent.current.set(code, now);

      const { companyId: cid, userId } = ctx.current;
      if (!cid || !userId) return;

      const { data: existing, error: lookupErr } = await supabase
        .from("assets")
        .select("id")
        .eq("company_id", cid)
        .eq("asset_tag", code)
        .maybeSingle();
      if (lookupErr) {
        playCue("error");
        toast.error(`Scan failed: ${lookupErr.message}`);
        return;
      }
      if (existing) {
        playCue("duplicate");
        toast.info(`Asset ${code} already exists`);
        return;
      }

      const { data: created, error } = await supabase
        .from("assets")
        .insert({ asset_tag: code, name: code, company_id: cid, owner_id: userId, status: "active" })
        .select("id")
        .single();

      if (error) {
        if (error.code === "23505") {
          playCue("duplicate");
          toast.info(`Asset ${code} already exists`);
        } else if (limitCodeOf(error)) {
          playCue("error");
          toast.error("Asset limit reached for your plan — upgrade to add more.");
        } else {
          playCue("error");
          toast.error(`Could not add ${code}: ${error.message}`);
        }
        return;
      }

      playCue("success");
      void queryClient.invalidateQueries({ queryKey: ["assets"] });
      const insertedAt = Date.now();
      const id = created.id;
      toast.success(`Asset ${code} added`, {
        duration: UNDO_WINDOW_MS,
        action: {
          label: "Undo",
          onClick: async () => {
            if (Date.now() - insertedAt > UNDO_WINDOW_MS) {
              toast.error("Undo window expired");
              return;
            }
            const { error: delErr } = await supabase.from("assets").delete().eq("id", id);
            if (delErr) {
              playCue("error");
              toast.error(`Undo failed: ${delErr.message}`);
              return;
            }
            recent.current.delete(code);
            void queryClient.invalidateQueries({ queryKey: ["assets"] });
            toast(`Removed ${code}`);
          },
        },
      });
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      const now = Date.now();
      const gap = now - last;

      if (e.key === "Enter") {
        const code = buffer.trim();
        const isScan = burst && gap < SCAN_KEY_GAP_MS && code.length >= MIN_SCAN_LENGTH;
        if (isScan) {
          e.preventDefault();
          e.stopPropagation();
          void handleScan(code);
        }
        reset();
        last = 0;
        return;
      }

      if (e.key.length !== 1) return; // Shift, Tab, CapsLock, arrows, etc.
      last = now;

      if (buffer && gap < SCAN_KEY_GAP_MS) {
        if (!burst) {
          burst = true;
          // First character already landed in the focused field — take it back.
          if (first?.el) removeLeakedChar(first.el, first.ch);
        }
        e.preventDefault();
        buffer += e.key;
      } else {
        buffer = e.key;
        burst = false;
        first = { ch: e.key, el: editableTarget(e.target) };
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [disabled, queryClient]);

  return null;
}
