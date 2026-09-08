import { createFileRoute, Link } from "@tanstack/react-router";
import { BRAND, BRAND_DIVISION, COPYRIGHT_LINE, TERMS_SECTIONS, TERMS_VERSION } from "@/lib/legal";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — C.A.T.H.Y." },
      {
        name: "description",
        content:
          "C.A.T.H.Y. Terms of Service: licensed use, restrictions on scraping and reverse engineering, customer ownership of records, and limitation of liability for third-party audits.",
      },
      { property: "og:title", content: "Terms of Service — C.A.T.H.Y." },
      {
        property: "og:description",
        content: "Licensed use, restricted rights, data ownership and liability terms for C.A.T.H.Y.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-8">
      <div className="hazard-stripe mb-6 h-1 w-full opacity-70" />
      <p className="text-[11px] uppercase tracking-widest text-muted-foreground">{BRAND_DIVISION}</p>
      <h1 className="mt-1 text-3xl font-bold uppercase text-foreground">Terms of Service</h1>
      <p className="mt-2 text-xs uppercase tracking-widest text-muted-foreground">
        Version {TERMS_VERSION} · Effective 2026
      </p>

      <div className="mt-8 text-sm leading-relaxed text-muted-foreground">
        {TERMS_SECTIONS.map((s) => (
          <section key={s.heading} className="mb-7">
            <h2 className="mb-2 text-sm font-bold uppercase tracking-widest text-foreground">{s.heading}</h2>
            {s.body.map((p, i) => (
              <p key={i} className="mb-3">
                {p}
              </p>
            ))}
          </section>
        ))}
      </div>

      <footer className="mt-10 border-t border-border pt-5 text-xs text-muted-foreground">
        <p>{COPYRIGHT_LINE}</p>
        <p className="mt-2">
          Questions about these terms should be directed to your {BRAND} account representative.
        </p>
        <div className="mt-4 flex gap-3">
          <Link to="/" className="uppercase tracking-widest underline">
            Dashboard
          </Link>
          <Link to="/auth" className="uppercase tracking-widest underline">
            Sign in
          </Link>
        </div>
      </footer>
    </main>
  );
}
