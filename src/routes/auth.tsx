import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { TermsModal } from "@/components/certvault/TermsModal";
import { TERMS_VERSION } from "@/lib/legal";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign In — C.A.T.H.Y. Compliance Tracking" },
      {
        name: "description",
        content:
          "Secure sign in for C.A.T.H.Y.: rigging, equipment and welder certification compliance records for authorized crews only.",
      },
      { property: "og:title", content: "Sign In — C.A.T.H.Y." },
      {
        property: "og:description",
        content: "Authorized access to rigging and welder compliance records.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

const field =
  "w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary";
const label = "mb-1 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground";

function AuthPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

  useEffect(() => {
    if (!loading && session) navigate({ to: "/" });
  }, [loading, session, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "signup" && !termsAccepted) {
      setError(null);
      setShowTerms(true);
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/" });
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: { terms_version: TERMS_VERSION, terms_accepted_at: new Date().toISOString() },
          },
        });
        if (error) throw error;
        setTermsAccepted(false);
        setNotice("Account created. Check your email if confirmation is required, then sign in.");
        setMode("signin");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="safe-top safe-bottom flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6">
        <h1 className="text-2xl font-bold uppercase tracking-wide text-foreground">C.A.T.H.Y.</h1>
        <p className="mt-1 mb-5 text-xs uppercase tracking-widest text-muted-foreground">
          Authorized personnel only
        </p>
        <form onSubmit={submit} className="grid gap-3">
          <div>
            <label className={label}>Work email</label>
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
            <input
              required
              type="password"
              minLength={6}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              className={field}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {mode === "signup" && (
            <div className="rounded-md border border-border bg-background/60 p-3 text-xs text-muted-foreground">
              {termsAccepted ? (
                <p className="text-success">
                  Terms of Service accepted (v{TERMS_VERSION}).{" "}
                  <button type="button" className="underline" onClick={() => setShowTerms(true)}>
                    Review again
                  </button>
                </p>
              ) : (
                <p>
                  Creating an account requires accepting the{" "}
                  <button type="button" className="underline text-foreground" onClick={() => setShowTerms(true)}>
                    Terms of Service
                  </button>
                  .
                </p>
              )}
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {notice && <p className="text-sm text-success">{notice}</p>}
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-primary px-4 py-3 text-sm font-bold uppercase tracking-widest text-primary-foreground disabled:opacity-60"
          >
            {busy ? "Working…" : mode === "signin" ? "Sign In" : "Create Account"}
          </button>
        </form>
        <button
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="mt-4 w-full text-xs uppercase tracking-widest text-muted-foreground underline"
        >
          {mode === "signin" ? "Need an account? Sign up" : "Have an account? Sign in"}
        </button>
        <p className="mt-3 flex flex-wrap items-center justify-center gap-3 text-center text-[11px] uppercase tracking-widest text-muted-foreground">
          <Link to="/terms" className="underline">
            Terms of Service
          </Link>
          <a href="/terms#privacy" className="underline">
            Privacy Policy
          </a>
        </p>
        <p className="mt-3 text-center text-[10px] uppercase tracking-widest text-muted-foreground">
          C.A.T.H.Y. — Compliance, Asset Tracking &amp; Heavy Yards
        </p>
      </div>
      <TermsModal
        open={showTerms}
        onAccept={() => {
          setTermsAccepted(true);
          setShowTerms(false);
        }}
        onDecline={() => {
          setTermsAccepted(false);
          setShowTerms(false);
          setError("You must accept the Terms of Service to create an account.");
        }}
      />
    </main>
  );
}
