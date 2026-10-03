import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/ledger-conflicts")({
  head: () => ({
    meta: [
      { title: "Ledger Conflicts — Manager Review | C.A.T.H.Y." },
      {
        name: "description",
        content:
          "Review and resolve offline sync conflicts: competing asset actions filed by the append-only ledger.",
      },
      { property: "og:title", content: "Ledger Conflicts — Manager Review | C.A.T.H.Y." },
      {
        property: "og:description",
        content: "Manager review queue for offline asset-tracking conflicts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LedgerConflicts,
});

interface ConflictRow {
  id: string;
  asset_id: string;
  status: "PENDING_REVIEW" | "RESOLVED";
  created_at: string;
  resolved_at: string | null;
  competing_actor_id: string | null;
  assets: { asset_tag: string; name: string } | null;
  asset_ledger: {
    action_type: string;
    created_at: string;
    metadata: Record<string, unknown>;
    actor_id: string | null;
  } | null;
}

const REVIEWER_ROLES = ["company_admin", "safety_director"];

function LedgerConflicts() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { companyId, role, isSuperAdmin } = useProfile();
  const [resolving, setResolving] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth" });
  }, [loading, session, navigate]);

  const canReview = isSuperAdmin || REVIEWER_ROLES.includes(role ?? "");

  const conflictsQ = useQuery({
    queryKey: ["ledger-conflicts", companyId],
    enabled: !!session && !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ledger_conflicts")
        .select(
          "id, asset_id, status, created_at, resolved_at, competing_actor_id, assets(asset_tag, name), asset_ledger:conflicting_event_id(action_type, created_at, metadata, actor_id)",
        )
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ConflictRow[];
    },
  });

  const conflicts = conflictsQ.data ?? [];
  const pending = conflicts.filter((c) => c.status === "PENDING_REVIEW");

  const resolve = async (id: string) => {
    setResolving(id);
    const { error } = await supabase
      .from("ledger_conflicts")
      .update({
        status: "RESOLVED",
        resolved_by: session!.user.id,
        resolved_at: new Date().toISOString(),
      } as never)
      .eq("id", id);
    setResolving(null);
    if (error) {
      toast.error("Could not resolve this conflict.");
      return;
    }
    toast.success("Conflict marked resolved.");
    queryClient.invalidateQueries({ queryKey: ["ledger-conflicts", companyId] });
  };

  return (
    <div className="min-h-screen pb-10">
      <header className="safe-top sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="hazard-stripe h-1 w-full opacity-70" />
        <div className="mx-auto grid max-w-3xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold uppercase leading-none">Ledger Conflicts</h1>
            <p className="truncate text-[11px] uppercase tracking-widest text-muted-foreground">
              Offline sync exceptions · Manager review
            </p>
          </div>
          <Link
            to="/"
            className="touch-target inline-flex shrink-0 items-center rounded-md border border-border px-3 py-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground hover:border-primary"
          >
            Back
          </Link>
        </div>
      </header>

      <main className="safe-bottom mx-auto max-w-3xl space-y-4 px-4 py-5">
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-widest">
          <span
            className={`rounded-full border px-3 py-1 ${pending.length > 0 ? "border-warning text-warning" : "border-success text-success"}`}
          >
            {pending.length} pending review
          </span>
          <span className="rounded-full border border-border px-3 py-1 text-muted-foreground">
            {conflicts.length} total
          </span>
        </div>

        {conflictsQ.isLoading && (
          <p className="text-sm text-muted-foreground">Loading conflicts…</p>
        )}

        {!conflictsQ.isLoading && conflicts.length === 0 && (
          <div className="panel p-6 text-center">
            <p className="text-sm font-semibold">No conflicts on file</p>
            <p className="mt-1 text-xs text-muted-foreground">
              When two workers' offline actions collide, the exception lands here for review.
            </p>
          </div>
        )}

        {conflicts.map((c) => {
          const meta = (c.asset_ledger?.metadata ?? {}) as Record<string, unknown>;
          const attemptedTo = typeof meta["to"] === "string" ? (meta["to"] as string) : null;
          const attemptedFrom = typeof meta["from"] === "string" ? (meta["from"] as string) : null;
          return (
            <section key={c.id} className="panel space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">
                    {c.assets?.asset_tag ?? "Unknown asset"}
                    <span className="ml-2 font-normal text-muted-foreground">{c.assets?.name}</span>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {c.asset_ledger?.action_type ?? "ACTION"} attempted{" "}
                    {new Date(c.asset_ledger?.created_at ?? c.created_at).toLocaleString()}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-widest ${
                    c.status === "PENDING_REVIEW"
                      ? "border-warning text-warning"
                      : "border-success text-success"
                  }`}
                >
                  {c.status === "PENDING_REVIEW" ? "Pending" : "Resolved"}
                </span>
              </div>

              {(attemptedFrom || attemptedTo) && (
                <p className="text-xs text-muted-foreground">
                  Attempted move: {attemptedFrom ?? "?"} → {attemptedTo ?? "?"}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                The asset's state had already changed when this action synced. The attempt is
                preserved in the append-only ledger; the asset's current location was left
                untouched.
              </p>

              {c.status === "PENDING_REVIEW" && canReview && (
                <button
                  disabled={resolving === c.id}
                  onClick={() => resolve(c.id)}
                  className="touch-target w-full rounded-lg bg-accent px-4 py-3 text-xs font-bold uppercase tracking-widest text-accent-foreground disabled:opacity-40"
                >
                  {resolving === c.id ? "Resolving…" : "Mark Resolved"}
                </button>
              )}
              {c.status === "RESOLVED" && c.resolved_at && (
                <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
                  Resolved {new Date(c.resolved_at).toLocaleString()}
                </p>
              )}
            </section>
          );
        })}

        {!canReview && conflicts.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Only company admins and safety directors can resolve conflicts.
          </p>
        )}
      </main>
    </div>
  );
}
