import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BRAND, COPYRIGHT_LINE } from "@/lib/legal";

const URL = "https://getcathy.lovable.app/weld-tracking-software";
const TITLE = "Weld Tracking Software for Fabricators | C.A.T.H.Y.";
const DESC =
  "Track welder continuity, WPQ certifications and weld inspections in one audit-ready system. 150-day continuity alerts and dispatch blocking for lapsed welders.";

export const Route = createFileRoute("/weld-tracking-software")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "article" },
      { property: "og:url", content: URL },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: URL }],
  }),
  component: WeldTrackingPage,
});

const SECTIONS = [
  {
    h: "Welder continuity tracking",
    items: [
      "Continuity measured by interval since last verified weld, not just a card date",
      "Warning at 120 days, hard lapse at 150 days",
      "Covers welders and medical-gas brazers",
    ],
  },
  {
    h: "Welder certification and WPQ records",
    items: [
      "Every certification stored per person with approval status",
      "30 / 14 / 7-day expiration alerts to the welder and supervisor",
      "Bulk CSV import for existing crews",
    ],
  },
  {
    h: "Dispatch blocking for lapsed welders",
    items: [
      "Lapsed welders are blocked from dispatch automatically",
      "Lapse emails go to the welder, the supervisor and an admin fallback",
      "Continuity dashboard shows who needs retraining by trade",
    ],
  },
  {
    h: "Audit-ready weld inspection records",
    items: [
      "Immutable inspection and signature history",
      "SHA-256 sealed audit binders for clients and auditors",
      "Works offline in the yard and syncs when signal returns",
    ],
  },
];

function WeldTrackingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/40">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
          <Link to="/" className="font-display text-2xl font-bold uppercase">{BRAND}</Link>
          <Link to="/auth"><Button size="sm">Sign In</Button></Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-14">
        <h1 className="font-display text-5xl font-extrabold uppercase leading-tight">
          Weld tracking software <span className="text-accent">for fabricators &amp; pipe yards</span>
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-muted-foreground">{DESC}</p>
        <div className="mt-8">
          <Link to="/auth">
            <Button size="lg" className="gap-2 bg-accent font-bold uppercase text-accent-foreground hover:bg-accent/90">
              Start tracking welds free <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
        <div className="mt-14 grid gap-8 md:grid-cols-2">
          {SECTIONS.map((s) => (
            <section key={s.h} className="rounded-lg border border-border bg-surface p-6">
              <h2 className="font-display text-2xl font-bold uppercase">{s.h}</h2>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                {s.items.map((i) => (
                  <li key={i} className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                    <span>{i}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <p className="mt-12 text-center text-sm text-muted-foreground">
          See plans and pricing on the <Link to="/" className="text-accent hover:underline">C.A.T.H.Y. home page</Link>.
        </p>
      </main>
      <footer className="border-t border-border/40 py-8 text-center text-sm text-muted-foreground">{COPYRIGHT_LINE}</footer>
    </div>
  );
}
