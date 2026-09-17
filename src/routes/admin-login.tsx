import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { SUPER_ADMIN_EMAIL } from "@/lib/legal";

export const Route = createFileRoute("/admin-login")({
  head: () => ({
    meta: [
      { title: "Platform Owner Sign In — C.A.T.H.Y." },
      {
        name: "description",
        content:
          "Restricted platform owner sign in for the C.A.T.H.Y. company control console. Customer crews use the standard sign in page.",
      },
      { property: "og:title", content: "Platform Owner Sign In — C.A.T.H.Y." },
      {
        property: "og:description",
        content: "Restricted access to the C.A.T.H.Y. platform owner console.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminLogin,
});

const field =
  "w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary";
const label = "mb-1 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground";

function AdminLogin() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const { isSuperAdmin, isLoading: profileLoading } = useProfile();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ownerEmail = (session?.user?.email ?? "").trim().toLowerCase() === SUPER_ADMIN_EMAIL;

  // An already-signed-in owner goes straight through; anyone else is told to use
  // the normal crew sign in instead of silently landing on a locked screen.
  useEffect(() => {
    if (loading || profileLoading || !session) return;
    if (isSuperAdmin && ownerEmail) navigate({ to: "/super-admin" });
  }, [loading, profileLoading, session, isSuperAdmin, ownerEmail, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const entered = email.trim().toLowerCase();
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: entered,
        password,
      });
      if (signInError) throw signInError;

      const uid = data.user?.id;
      const { data: profile } = await supabase
        .from("profiles")
        .select("is_super_admin")
        .eq("id", uid ?? "")
        .maybeSingle();

      const allowed =
        entered === SUPER_ADMIN_EMAIL &&
        Boolean((profile as { is_super_admin?: boolean } | null)?.is_super_admin);

      if (!allowed) {
        await supabase.auth.signOut();
        setError("This account is not a platform owner. Use the standard sign in page.");
        return;
      }
      navigate({ to: "/super-admin" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed.");
    } finally {
      setBusy(false);
    }
  };

  const signedInAsOther = !!session && !(isSuperAdmin && ownerEmail) && !profileLoading;

  return (
    <main className="safe-top safe-bottom flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-2xl border border-warning/50 bg-surface p-6">
        <div className="flex items-center gap-2 text-warning">
          <ShieldCheck size={18} />
          <span className="text-[11px] font-bold uppercase tracking-widest">Restricted Console</span>
        </div>
        <h1 className="mt-2 text-2xl font-bold uppercase tracking-wide text-foreground">
          Platform Owner
        </h1>
        <p className="mt-1 mb-5 text-xs uppercase tracking-widest text-muted-foreground">
          C.A.T.H.Y. company control
        </p>

        {signedInAsOther && (
          <div className="mb-4 rounded-md border border-border bg-background/60 p-3 text-xs text-muted-foreground">
            You are signed in with a crew account. Sign out first to use owner access.
            <button
              type="button"
              onClick={async () => {
                await supabase.auth.signOut();
              }}
              className="mt-2 block w-full rounded-md border border-border px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-foreground"
            >
              Sign out
            </button>
          </div>
        )}

        <form onSubmit={submit} className="grid gap-3">
          <div>
            <label className={label}>Owner email</label>
            <input
              required
              type="email"
              autoComplete="email"
              className={field}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className={label}>Password</label>
            <div className="relative">
              <input
                required
                type={showPassword ? "text" : "password"}
                minLength={6}
                autoComplete="current-password"
                className={`${field} pr-14`}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-0 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground"
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="min-h-[48px] rounded-lg bg-warning px-4 py-3 text-sm font-bold uppercase tracking-widest text-warning-foreground disabled:opacity-60"
          >
            {busy ? "Verifying…" : "Enter Owner Console"}
          </button>
        </form>

        <p className="mt-4 text-center text-[11px] uppercase tracking-widest text-muted-foreground">
          <Link to="/auth" className="underline">
            Crew sign in
          </Link>
        </p>
        <p className="mt-3 text-center text-[10px] uppercase tracking-widest text-muted-foreground">
          Access attempts are restricted to the registered platform owner account.
        </p>
      </div>
    </main>
  );
}
