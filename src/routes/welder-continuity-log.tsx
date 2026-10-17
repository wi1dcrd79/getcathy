import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Check, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BRAND, COPYRIGHT_LINE } from "@/lib/legal";

const URL = "https://getcathy.lovable.app/welder-continuity-log";
const TITLE = "Continuity Log for Welders — Free Template & Tracker | C.A.T.H.Y.";
const DESC =
  "Keep a welder continuity log that satisfies ASME IX QW-322 and AWS D1.1. Free continuity log template, plus automatic 120-day warnings and 150-day lapse blocking.";

export const Route = createFileRoute("/welder-continuity-log")({
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
  component: WelderContinuityLogPage,
});

const TEMPLATE_COLUMNS = [
  "Welder name and ID stamp",
  "Process (SMAW, GMAW, GTAW, FCAW…)",
  "Qualified standard (ASME IX, AWS D1.1, API 1104…)",
  "Date of last verified weld",
  "Days since last weld (interval, not just a card date)",
  "Supervisor sign-off",
];

const RULES = [
  {
    h: "ASME Section IX — QW-322",
    body: "A welder's qualification expires if they have not welded with the process for 6 months. C.A.T.H.Y. warns at 120 days and treats 150 days without a certified weld as a hard lapse, so nobody drifts past the 6-month mark unnoticed.",
  },
  {
    h: "AWS D1.1 continuity",
    body: "Structural welding continuity follows the same interval logic: log every weld by process and position, and the log itself becomes the evidence an auditor asks for.",
  },
  {
    h: "What auditors actually check",
    body: "Not the card in the welder's wallet — the dated, signed record that the welder kept welding. An interval-based continuity log with supervisor sign-off is the defensible artifact.",
  },
];

const WHY_NOT_SPREADSHEET = [
  "A spreadsheet can't warn a supervisor at 120 days — C.A.T.H.Y. emails the welder, the supervisor and an admin fallback automatically",
  "A spreadsheet can't stop a lapsed welder being dispatched — C.A.T.H.Y. blocks dispatch at 150 days",
  "A spreadsheet row can be edited silently — C.A.T.H.Y. keeps an immutable history with SHA-256 sealed audit binders",
  "A spreadsheet lives on one laptop — C.A.T.H.Y. works offline in the yard and syncs when signal returns",
];

function WelderContinuityLogPage() {
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
          Continuity log for welders: <span className="text-accent">free template + automatic tracking</span>
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-muted-foreground">{DESC}</p>
        <div className="mt-8 flex flex-wrap gap-4">
          <Link to="/auth">
            <Button size="lg" className="gap-2 bg-accent font-bold uppercase text-accent-foreground hover:bg-accent/90">
              Track continuity free <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>

        {/* Free template */}
        <section className="mt-14 rounded-lg border border-accent/50 bg-surface p-6">
          <h2 className="flex items-center gap-2 font-display text-2xl font-bold uppercase">
            <Download className="h-5 w-5 text-accent" /> Free welder continuity log template
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">
            The minimum columns a defensible continuity log needs. Copy these into a spreadsheet
            today — or let C.A.T.H.Y. track them for you with alerts and dispatch blocking.
          </p>
          <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            {TEMPLATE_COLUMNS.map((c) => (
              <li key={c} className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                <span>{c}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-muted-foreground">
            Already have a log? <Link to="/auth" className="text-accent hover:underline">Import it by CSV</Link> and
            C.A.T.H.Y. takes over the reminders from there.
          </p>
        </section>

        {/* Code rules */}
        <div className="mt-12 grid gap-8 md:grid-cols-3">
          {RULES.map((r) => (
            <section key={r.h} className="rounded-lg border border-border bg-surface p-6">
              <h2 className="font-display text-xl font-bold uppercase">{r.h}</h2>
              <p className="mt-3 text-sm text-muted-foreground">{r.body}</p>
            </section>
          ))}
        </div>

        {/* Spreadsheet comparison */}
        <section className="mt-12 rounded-lg border border-border bg-surface p-6">
          <h2 className="font-display text-2xl font-bold uppercase">Why a spreadsheet log isn't enough</h2>
          <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
            {WHY_NOT_SPREADSHEET.map((i) => (
              <li key={i} className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                <span>{i}</span>
              </li>
            ))}
          </ul>
        </section>

        <p className="mt-12 text-center text-sm text-muted-foreground">
          Part of our <Link to="/weld-tracking-software" className="text-accent hover:underline">weld tracking software</Link> —
          see plans on the <Link to="/" className="text-accent hover:underline">C.A.T.H.Y. home page</Link>.
        </p>
      </main>
      <footer className="border-t border-border/40 py-8 text-center text-sm text-muted-foreground">{COPYRIGHT_LINE}</footer>
    </div>
  );
}
