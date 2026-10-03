import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Check,
  FileLock2,
  Layers,
  Monitor,
  Smartphone,
  UserCheck,
  WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { PLANS } from "@/lib/plans";
import { BRAND, BRAND_DIVISION, COPYRIGHT_LINE, SUPPORT_EMAIL } from "@/lib/legal";

/**
 * Set to a path under /public (e.g. "/images/hero-field-scan.jpg") to replace the
 * drawn hero illustration with a real photo.
 */
const HERO_IMAGE_SRC: string | null = null;
const HERO_IMAGE_ALT =
  "Gloved hand holding a rugged scanner to a stamped barcode tag on a structural steel beam";

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

// 9x9 pattern for the illustrative tag (1 = dark module)
const TAG_PATTERN = [
  "111010111",
  "100110001",
  "101011101",
  "101100101",
  "001010010",
  "110101101",
  "101110101",
  "100010001",
  "111011101",
];

function HeroIllustration() {
  const cell = 9;
  return (
    <svg
      viewBox="0 0 480 400"
      role="img"
      aria-label="Illustration of a barcode tag on a steel beam being scanned"
      className="h-full w-full"
    >
      <defs>
        <linearGradient id="beam" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#475569" />
          <stop offset="0.5" stopColor="#334155" />
          <stop offset="1" stopColor="#1E293B" />
        </linearGradient>
        <linearGradient id="scan" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#F59E0B" stopOpacity="0" />
          <stop offset="0.5" stopColor="#F59E0B" stopOpacity="0.9" />
          <stop offset="1" stopColor="#F59E0B" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="480" height="400" fill="#0B1222" />
      {/* structural steel web + flanges */}
      <rect x="-10" y="70" width="500" height="34" fill="url(#beam)" />
      <rect x="-10" y="296" width="500" height="34" fill="url(#beam)" />
      <rect x="-10" y="104" width="500" height="192" fill="#2B3A52" />
      {[130, 190, 250, 310, 370].map((y) => (
        <line key={y} x1="-10" x2="490" y1={y} y2={y} stroke="#1E293B" strokeWidth="1" opacity="0.6" />
      ))}
      {/* stenciled heat number */}
      <text x="40" y="150" fill="#94A3B8" fontSize="20" fontFamily="monospace" opacity="0.75">
        HT# 4471-B  ASTM A992
      </text>
      {/* tag */}
      <g transform="translate(150 170)">
        <rect width="180" height="112" rx="8" fill="#E2E8F0" />
        <rect x="6" y="6" width="168" height="100" rx="5" fill="none" stroke="#0F172A" strokeWidth="1.5" />
        <g transform="translate(16 16)">
          {TAG_PATTERN.map((row, r) =>
            row.split("").map((c, i) =>
              c === "1" ? (
                <rect key={`${r}-${i}`} x={i * cell} y={r * cell} width={cell} height={cell} fill="#0F172A" />
              ) : null,
            ),
          )}
        </g>
        <text x="108" y="38" fill="#0F172A" fontSize="12" fontFamily="monospace" fontWeight="700">
          DY-CRN-202
        </text>
        <text x="108" y="56" fill="#334155" fontSize="9" fontFamily="monospace">
          SWL 12 TON
        </text>
        <text x="108" y="70" fill="#334155" fontSize="9" fontFamily="monospace">
          INSP 10/2026
        </text>
      </g>
      {/* scan reticle */}
      <g stroke="#F59E0B" strokeWidth="4" fill="none" strokeLinecap="round">
        <path d="M130 190 V160 H160" />
        <path d="M350 160 H380 V190" />
        <path d="M130 262 V292 H160" />
        <path d="M350 292 H380 V262" />
      </g>
      <rect x="120" y="224" width="270" height="4" fill="url(#scan)" />
    </svg>
  );
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
            {HERO_IMAGE_SRC ? (
              <img src={HERO_IMAGE_SRC} alt={HERO_IMAGE_ALT} className="h-full w-full object-cover" />
            ) : (
              <HeroIllustration />
            )}
          </div>
          <div className="absolute -bottom-4 left-4 right-4 flex items-center justify-between gap-3 rounded-lg border border-white/15 bg-background/70 px-4 py-3 backdrop-blur-md sm:left-auto sm:right-6 sm:w-auto">
            <span className="tag-mono text-xs sm:text-sm">Asset: DY-CRN-202</span>
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
