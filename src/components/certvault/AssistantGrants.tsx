import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Grant = { id: string; client_id: string; client_name: string | null; granted_at: string };

// Lists the signed-in user's active "write_drafts" grants with a Revoke button.
export function AssistantGrants() {
  const [grants, setGrants] = useState<Grant[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase
      .from("assistant_grants" as never)
      .select("id, client_id, client_name, granted_at")
      .is("revoked_at" as never, null)
      .order("granted_at" as never, { ascending: false });
    setGrants((data ?? []) as unknown as Grant[]);
  }
  useEffect(() => {
    void load();
  }, []);

  async function revoke(id: string) {
    setBusy(id);
    await supabase
      .from("assistant_grants" as never)
      .update({ revoked_at: new Date().toISOString() } as never)
      .eq("id" as never, id as never);
    setBusy(null);
    void load();
  }

  if (!grants.length)
    return (
      <p className="text-sm text-muted-foreground">No assistants can create drafts for you.</p>
    );
  return (
    <ul className="flex flex-col gap-2">
      {grants.map((g) => (
        <li
          key={g.id}
          className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
        >
          <div className="text-sm">
            <div className="font-semibold">{g.client_name ?? g.client_id}</div>
            <div className="text-muted-foreground">
              Can create drafts · since {new Date(g.granted_at).toLocaleDateString()}
            </div>
          </div>
          <button
            disabled={busy === g.id}
            onClick={() => revoke(g.id)}
            className="min-h-12 rounded-md border border-border px-4 font-semibold disabled:opacity-50"
          >
            Revoke
          </button>
        </li>
      ))}
    </ul>
  );
}
