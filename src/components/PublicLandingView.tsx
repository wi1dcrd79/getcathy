import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Check,
  FileLock2,
  Layers,
  Monitor,
  ShieldCheck,
  Smartphone,
  UserCheck,
  WifiOff,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PLANS } from "@/lib/plans";
import { BRAND, BRAND_DIVISION, COPYRIGHT_LINE, SUPPORT_EMAIL } from "@/lib/legal";
import heroFieldScan from "@/assets/hero-field-scan.jpg";
import yardDusk from "@/assets/yard-dusk.jpg";

const TRADES = ["Structural Steel", "Pipe Yards", "Heavy Rigging & Cranes", "Pressure Piping"];

const PILLARS = [
  {
    icon: Layers,
    title: "Field-First Scanning",
    points: ["Site → Zone → Bin tracking", "Offline sync queue for dead-signal yards"],
  },
  {
    icon: UserCheck,
    title: "Welder Continuity",
    points: ["Continuity tracked by interval, not just date", "Expiration alerts escalate to supervisors"],
  },
  {
    icon: FileLock2,
    title: "Defensible Binders",
    points: ["Point-in-time PDF audit binders", "SHA-256 sealed once approved"],
  },
];

const HERO_BULLETS = [
  "Offline scanning that syncs when signal returns",
  "Three-level Site → Zone → Bin hierarchy",
  "Tamper-evident audit binders",
];

const PAIN_POINTS = [
  {
    pain: "A lapsed welder cert stops a pick mid-shift.",
    fix: "30/14/7-day escalation alerts reach the supervisor before the lapse — never after.",
  },
  {
    pain: "Auditors want proof, and the binder takes a week to compile.",
    fix: "One click compiles a signed, SHA-256-sealed audit binder from live records.",
  },
  {
    pain: "Rigging inspections live on paper in a truck cab.",
    fix: "Glove-friendly mobile capture, offline queue, immutable history the moment signal returns.",
  },
];

const COMPARISON_ROWS: { label: string; free: boolean | string; pro: boolean | string; enterprise: boolean | string }[] = [
  { label: "Tracked assets", free: "3", pro: "15", enterprise: "Unlimited" },
  { label: "Crew seats", free: "1", pro: "3", enterprise: "Unlimited" },
  { label: "Yard transfers & scan logging", free: true, pro: true, enterprise: true },
  { label: "Offline capture & sync", free: true, pro: true, enterprise: true },
  { label: "Site → Zone → Bin hierarchy", free: true, pro: true, enterprise: true },
  { label: "Welder continuity alerts", free: false, pro: true, enterprise: true },
  { label: "OSHA / client audit binder (PDF)", free: false, pro: true, enterprise: true },
  { label: "Immutable location + inspection history", free: false, pro: true, enterprise: true },
  { label: "Multi-yard / multi-site switching", free: false, pro: false, enterprise: true },
  { label: "Priority binder export queue", free: false, pro: false, enterprise: true },
  { label: "Dedicated compliance support", free: false, pro: false, enterprise: true },
];

function CompareCell({ value }: { value: boolean | string }) {
  if (value === true) return <Check className="mx-auto h-4 w-4 text-accent" />;
  if (value === false) return <X className="mx-auto h-4 w-4 text-muted-foreground/40" />;
  return <span className="text-sm font-semibold">{value}</span>;
}

export function PublicLandingView() {
  const planList = [PLANS.free, PLANS.pro, PLANS.enterprise];

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Navigation */}
      <header className="sticky top-0 z-50 border-b border-border/40 bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <span className="font-display text-2xl font-bold uppercase tracking-wide">{BRAND}</span>
            <Badge variant="outline" className="hidden border-accent/60 text-xs text-accent sm:inline-flex">
              Field-Ready
            </Badge>
          </div>
          <nav className="flex items-center gap-4 text-sm sm:gap-6">
            <a href="#features" className="hidden text-muted-foreground transition-colors hover:text-foreground md:inline">
              Features
            </a>
            <a href="#trades" className="hidden text-muted-foreground transition-colors hover:text-foreground md:inline">
              Trades
            </a>
            <a href="#pricing" className="text-muted-foreground transition-colors hover:text-foreground">
              Pricing
            </a>
            <Link to="/terms" className="hidden text-muted-foreground transition-colors hover:text-foreground sm:inline">
              Terms
            </Link>
            <Link to="/auth">
              <Button size="sm">Sign In</Button>
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero (50/50 split) */}
      <section className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-14 lg:grid-cols-2 lg:py-20">
        <div>
          <span className="inline-block rounded-full border border-accent bg-accent/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-accent">
            QA/QC for heavy fabrication &amp; yards
          </span>
          <h1 className="mt-5 font-display text-5xl font-extrabold uppercase leading-[0.95] sm:text-6xl lg:text-7xl">
            Audit-ready yards.
            <br />
            <span className="text-accent">Zero lapsed certs.</span>
            <br />
            In real time.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted-foreground">
            From pipe yards to crane picks, C.A.T.H.Y. tracks rigging inspections, equipment
            certifications and welder continuity, and compiles the OSHA-ready paperwork for you.
          </p>
          <ul className="mt-6 space-y-2 text-sm">
            {HERO_BULLETS.map((b) => (
              <li key={b} className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link to="/auth">
              <Button size="lg" className="gap-2 bg-accent font-bold uppercase tracking-wider text-accent-foreground hover:bg-accent/90">
                Get Started Free <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <a href="#pricing">
              <Button size="lg" variant="outline">
                Pricing
              </Button>
            </a>
          </div>
        </div>

        <div className="relative">
          <div className="aspect-[6/5] overflow-hidden rounded-xl border-2 border-accent/70 shadow-[0_0_40px_-8px] shadow-accent/40">
            <img
              src={heroFieldScan}
              alt="Gloved hand holding a rugged scanner to a stamped barcode asset tag on a structural steel beam in a fabrication yard at dusk"
              className="h-full w-full object-cover"
              width={1536}
              height={1280}
            />
          </div>
          <div className="absolute -bottom-4 left-4 right-4 flex items-center justify-between gap-3 rounded-lg border border-white/15 bg-background/70 px-4 py-3 backdrop-blur-md sm:left-auto sm:right-6 sm:w-auto">
            <span className="tag-mono text-xs sm:text-sm">Asset: ST-78432</span>
            <span className="rounded-full border border-accent px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-accent">
              Audit Ready
            </span>
          </div>
        </div>
      </section>

      {/* Trade focus strip */}
      <section id="trades" className="border-y border-border/40 bg-surface/60">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-3 px-4 py-5">
          {TRADES.map((t) => (
            <span
              key={t}
              className="rounded-md border border-border bg-background px-4 py-2 font-display text-sm font-semibold uppercase tracking-widest"
            >
              {t}
            </span>
          ))}
        </div>
      </section>

      {/* Why you need it — pain points */}
      <section className="mx-auto max-w-7xl px-4 py-16">
        <div className="mb-10 text-center">
          <h2 className="font-display text-4xl font-bold uppercase tracking-tight">
            Paper trails fail audits. Memory fails worse.
          </h2>
          <p className="mt-2 text-muted-foreground">
            The three failures that cost fabricators contracts — and how C.A.T.H.Y. closes each one.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {PAIN_POINTS.map((p) => (
            <Card key={p.pain} className="border-border bg-surface">
              <CardHeader>
                <CardTitle className="text-base font-semibold leading-snug">{p.pain}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="flex items-start gap-2 text-sm text-muted-foreground">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                  <span>{p.fix}</span>
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Full-bleed yard photo band */}
      <section className="relative overflow-hidden border-y border-border/40">
        <img
          src={yardDusk}
          alt="Pipe laydown yard at dusk with a mobile crane lifting steel pipe under amber work lights"
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
          width={1920}
          height={1088}
        />
        <div className="absolute inset-0 bg-background/70" />
        <div className="relative mx-auto max-w-7xl px-4 py-24 text-center">
          <h2 className="mx-auto max-w-3xl font-display text-4xl font-extrabold uppercase leading-tight sm:text-5xl">
            Every tag. Every weld. <span className="text-accent">Every signature.</span> On record.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            Built for crews in gloves and the auditors who come after them.
          </p>
        </div>
      </section>

      {/* Three pillars */}
      <section id="features" className="mx-auto max-w-7xl px-4 py-16">
        <div className="mb-10 text-center">
          <h2 className="font-display text-4xl font-bold uppercase tracking-tight">Why C.A.T.H.Y.</h2>
          <p className="mt-2 text-muted-foreground">
            Everything required to stay compliant and pass third-party audits.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {PILLARS.map(({ icon: Icon, title, points }, i) => (
            <Card key={title} className="border-border bg-surface">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-md border border-accent/60 bg-accent/10">
                    <Icon className="h-5 w-5 text-accent" />
                  </span>
                  <span className="tag-mono text-xs text-muted-foreground">0{i + 1}</span>
                </div>
                <CardTitle className="mt-3 font-display text-2xl uppercase">{title}</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {points.map((p) => (
                    <li key={p} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Field vs desktop */}
      <section className="border-t border-border/40 bg-surface/40">
        <div className="mx-auto max-w-7xl px-4 py-16">
          <div className="mb-10 text-center">
            <h2 className="font-display text-4xl font-bold uppercase tracking-tight">
              Built for the yard. Built for the office.
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <Card className="border-accent/40 bg-background">
              <CardHeader>
                <Smartphone className="h-7 w-7 text-accent" />
                <CardTitle className="font-display text-2xl uppercase">Rugged Mobile</CardTitle>
                <CardDescription>For crews in gloves, sun and dead zones.</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />Large 48px+ touch targets, glove-friendly scanner</li>
                  <li className="flex gap-2"><WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-accent" />Offline capture and sign-offs with automatic sync</li>
                  <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />Quick scan from any screen</li>
                </ul>
              </CardContent>
            </Card>
            <Card className="border-border bg-background">
              <CardHeader>
                <Monitor className="h-7 w-7 text-primary" />
                <CardTitle className="font-display text-2xl uppercase">Desktop QC Suite</CardTitle>
                <CardDescription>For safety directors, QC and office admins.</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />Compliance dashboard with sortable, exportable records</li>
                  <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />Yard safety scorecards and AI risk review</li>
                  <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />Role-based admin console and audit binders</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto max-w-7xl border-t border-border/40 px-4 py-16">
        <div className="mb-10 text-center">
          <h2 className="font-display text-4xl font-bold uppercase tracking-tight">
            Transparent plans for every yard size
          </h2>
          <p className="mt-2 text-muted-foreground">
            All plans include secure cloud backup and full mobile support.
          </p>
        </div>
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-8 md:grid-cols-3">
          {planList.map((plan) => {
            const isPopular = plan.tier === "pro";
            return (
              <Card
                key={plan.tier}
                className={`flex flex-col justify-between bg-surface ${
                  isPopular ? "border-accent shadow-lg ring-2 ring-accent" : ""
                }`}
              >
                <CardHeader>
                  {isPopular && (
                    <Badge className="mb-2 w-fit bg-accent text-accent-foreground">Most Popular</Badge>
                  )}
                  <CardTitle className="font-display text-2xl uppercase">{plan.name}</CardTitle>
                  <div className="mt-4">
                    <span className="text-4xl font-extrabold">{plan.priceLabel}</span>
                  </div>
                  <CardDescription className="mt-2">
                    {plan.seats === 1
                      ? "1 crew seat"
                      : plan.seats > 100
                        ? "Unlimited crew seats"
                        : `Up to ${plan.seats} crew seats`}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1">
                  <ul className="space-y-3 text-sm">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  <Link to="/auth" className="w-full">
                    <Button
                      className={`w-full ${isPopular ? "bg-accent font-bold text-accent-foreground hover:bg-accent/90" : ""}`}
                      variant={isPopular ? "default" : "outline"}
                    >
                      Get Started with {plan.name}
                    </Button>
                  </Link>
                </CardFooter>
              </Card>
            );
          })}
        </div>

        {/* Full feature comparison */}
        <div className="mx-auto mt-14 max-w-4xl overflow-x-auto">
          <h3 className="mb-4 text-center font-display text-2xl font-bold uppercase tracking-tight">
            Full plan breakdown
          </h3>
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-border text-sm">
                <th className="py-3 pr-4 font-semibold">Feature</th>
                <th className="px-2 py-3 text-center font-display uppercase">Free</th>
                <th className="px-2 py-3 text-center font-display uppercase text-accent">Field Yard Pro</th>
                <th className="px-2 py-3 text-center font-display uppercase">Enterprise</th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON_ROWS.map((row) => (
                <tr key={row.label} className="border-b border-border/50 text-sm">
                  <td className="py-3 pr-4 text-muted-foreground">{row.label}</td>
                  <td className="px-2 py-3 text-center"><CompareCell value={row.free} /></td>
                  <td className="px-2 py-3 text-center"><CompareCell value={row.pro} /></td>
                  <td className="px-2 py-3 text-center"><CompareCell value={row.enterprise} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Footer (Paddle compliance) */}
      <footer className="mt-auto border-t border-border/40 bg-muted/20 py-12">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-4 text-sm text-muted-foreground md:flex-row">
          <div>
            <p className="font-semibold text-foreground">{BRAND_DIVISION}</p>
            <p className="mt-1">{COPYRIGHT_LINE}</p>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <Link to="/terms" className="transition-colors hover:text-foreground">
              Terms of Service
            </Link>
            <Link to="/terms" className="transition-colors hover:text-foreground">
              Privacy &amp; Refund Policy
            </Link>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="transition-colors hover:text-foreground">
              Support: {SUPPORT_EMAIL}
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
