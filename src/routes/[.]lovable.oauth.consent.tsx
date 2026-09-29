import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type OAuthResult = { data: any; error: { message: string } | null };
type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<OAuthResult>;
  approveAuthorization: (id: string) => Promise<OAuthResult>;
  denyAuthorization: (id: string) => Promise<OAuthResult>;
};
const oauth = () => (supabase.auth as unknown as { oauth: OAuthApi }).oauth;

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Connect an assistant — C.A.T.H.Y." },
      { name: "description", content: "Approve or deny an AI assistant's access to your C.A.T.H.Y. account." },
      { property: "og:title", content: "Connect an assistant — C.A.T.H.Y." },
      { property: "og:description", content: "Approve AI assistant access to your compliance records." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s["authorization_id"] === "string" ? (s["authorization_id"] as string) : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    const next = location.pathname + location.searchStr;
    if (!data.session) throw redirect({ to: "/auth", search: { next } });
  },
  loader: async ({ location }) => {
    const id = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauth().getAuthorizationDetails(id);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="mx-auto max-w-md p-6 text-foreground">
      <h1 className="text-xl font-bold">Could not load this request</h1>
      <p className="mt-2 text-sm text-muted-foreground">{String((error as Error)?.message ?? error)}</p>
    </main>
  ),
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [writeDrafts, setWriteDrafts] = useState(false);
  const name = details?.client?.name ?? "An assistant";
  const clientId: string | undefined = details?.client?.id ?? details?.client?.client_id;

  async function decide(approve: boolean) {
    setBusy(true);
    if (approve && clientId) {
      // write_drafts is an app-level grant keyed on the OAuth client; unchecked = read-only.
      const { data: u } = await supabase.auth.getUser();
      const now = new Date().toISOString();
      await supabase.from("assistant_grants" as never).update({ revoked_at: now } as never)
        .eq("client_id" as never, clientId as never).is("revoked_at" as never, null);
      if (writeDrafts && u.user) {
        const { error: gErr } = await supabase.from("assistant_grants" as never)
          .insert({ user_id: u.user.id, client_id: clientId, client_name: name, scope: "write_drafts" } as never);
        if (gErr) { setBusy(false); setError(gErr.message); return; }
      }
    }
    const { data, error } = approve
      ? await oauth().approveAuthorization(authorization_id)
      : await oauth().denyAuthorization(authorization_id);
    if (error) { setBusy(false); setError(error.message); return; }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) { setBusy(false); setError("No redirect returned."); return; }
    window.location.href = target;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6 text-foreground">
      <h1 className="text-2xl font-bold">Connect {name} to C.A.T.H.Y.</h1>
      <p className="text-sm text-muted-foreground">
        {name} will be able to read your company's assets, inspections and certification expirations as you. It can never sign, approve binders, change roles or delete anything.
      </p>
      <label className="flex min-h-12 items-start gap-3 rounded-md border border-border p-3 text-sm">
        <input type="checkbox" className="mt-1 h-5 w-5" checked={writeDrafts} onChange={(e) => setWriteDrafts(e.target.checked)} disabled={!clientId} />
        <span><span className="font-semibold">Also allow drafts (write_drafts)</span><br />
          <span className="text-muted-foreground">Create draft inspections and re-inspection tasks, and move tasks to in progress or ready for review. Leave unchecked for read-only.</span></span>
      </label>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-3">
        <button disabled={busy} onClick={() => decide(true)} className="min-h-12 flex-1 rounded-md bg-primary px-4 font-semibold text-primary-foreground disabled:opacity-50">Approve</button>
        <button disabled={busy} onClick={() => decide(false)} className="min-h-12 flex-1 rounded-md border border-border px-4 font-semibold disabled:opacity-50">Deny</button>
      </div>
      <section className="mt-4 flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Assistants that can create drafts</h2>
        <AssistantGrants />
      </section>
    </main>
  );
}
