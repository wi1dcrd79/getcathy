import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BRAND,
  BRAND_DIVISION,
  COPYRIGHT_LINE,
  PLAN_DISCLOSURES,
  SUPPORT_EMAIL,
  TERMS_SECTIONS,
  TERMS_VERSION,
} from "@/lib/legal";

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

      <section className="mt-8 rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-bold uppercase tracking-widest text-foreground">Pricing &amp; Refunds</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {PLAN_DISCLOSURES.map((p) => (
            <div key={p.name} className="rounded-lg border border-border p-4">
              <p className="text-xs font-bold uppercase tracking-widest text-primary">{p.name}</p>
              <p className="mt-1 font-display text-2xl font-bold text-foreground">{p.price}</p>
              <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                {p.features.map((f) => (
                  <li key={f}>• {f}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-4 space-y-2 text-xs leading-relaxed text-muted-foreground">
          <p>
            Free tier: 3 tracked assets and 1 seat, at no charge. Paid plans are billed monthly in
            advance in USD and renew automatically until canceled.
          </p>
          <p>
            <strong className="text-foreground">Cancellation &amp; refunds:</strong> cancel any time from
            your account settings or the Paddle customer portal — access continues to the end of the
            period you already paid for. 30-day money-back guarantee; mid-term cancellations and
            downgrades are refunded on a prorated basis for the unused portion. Refunds are processed by
            Paddle.com, our reseller and Merchant of Record.
          </p>
          <p>
            <strong className="text-foreground">Payment lapse:</strong> accounts enter a 30-day read-only
            compliance grace period — all records and audit binders stay viewable and printable.
          </p>
          <p>
            <strong className="text-foreground">Support &amp; operator contact:</strong>{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="underline">
              {SUPPORT_EMAIL}
            </a>
          </p>
        </div>
      </section>

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
