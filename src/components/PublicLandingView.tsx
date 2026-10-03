import { Link } from "@tanstack/react-router";
import { Check, ShieldCheck, QrCode, FileText, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PLANS, PAID_TIERS } from "@/lib/plans";
import { BRAND, BRAND_DIVISION, COPYRIGHT_LINE, SUPPORT_EMAIL } from "@/lib/legal";

export function PublicLandingView() {
  const planList = [PLANS.free, PLANS.pro, PLANS.enterprise];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Navigation */}
      <header className="border-b border-border/40 bg-background/95 backdrop-blur sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold tracking-tight">{BRAND}</span>
            <Badge variant="outline" className="hidden sm:inline-flex text-xs">Field-Ready</Badge>
          </div>
          <nav className="flex items-center gap-6 text-sm">
            <a href="#features" className="text-muted-foreground hover:text-foreground transition-colors">Features</a>
            <a href="#pricing" className="text-muted-foreground hover:text-foreground transition-colors">Pricing</a>
            <Link to="/terms" className="text-muted-foreground hover:text-foreground transition-colors">Terms</Link>
            <Link to="/auth">
              <Button size="sm">Sign In</Button>
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-20 text-center flex flex-col items-center max-w-4xl">
        <Badge variant="secondary" className="mb-4 px-3 py-1 text-sm font-medium">
          Industrial QA/QC Compliance Platform
        </Badge>
        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight mb-6">
          Compliance, Asset Tracking & Heavy Yards
        </h1>
        <p className="text-lg sm:text-xl text-muted-foreground mb-8 max-w-2xl">
          Field-first QA/QC dashboard tracking rigging inspections, equipment certifications, and welder continuity with OSHA-ready audit binders.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4">
          <Link to="/auth">
            <Button size="lg" className="gap-2">
              Get Started Free <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <a href="#pricing">
            <Button size="lg" variant="outline">
              View Plans & Pricing
            </Button>
          </a>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="container mx-auto px-4 py-16 border-t border-border/40">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold tracking-tight">Built for Rigging Yards & Field Crews</h2>
          <p className="text-muted-foreground mt-2">Everything required to stay compliant and pass third-party audits.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader>
              <QrCode className="h-8 w-8 text-primary mb-2" />
              <CardTitle className="text-lg">Mobile Barcode & QR</CardTitle>
              <CardDescription>Instant asset and pipe scanning in the yard with offline capture.</CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <FileText className="h-8 w-8 text-primary mb-2" />
              <CardTitle className="text-lg">OSHA Audit Binders</CardTitle>
              <CardDescription>Generate client-ready PDF inspection binders with one click.</CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <ShieldCheck className="h-8 w-8 text-primary mb-2" />
              <CardTitle className="text-lg">Welder Continuity</CardTitle>
              <CardDescription>Track certification expiration dates and standard compliance logs.</CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <Check className="h-8 w-8 text-primary mb-2" />
              <CardTitle className="text-lg">Offline Outbox</CardTitle>
              <CardDescription>Collect tamper-resistant digital sign-offs even without cellular service.</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="container mx-auto px-4 py-16 border-t border-border/40">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold tracking-tight">Transparent Plans for Every Yard Size</h2>
          <p className="text-muted-foreground mt-2">All plans include secure cloud backup and full mobile support.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {planList.map((plan) => {
            const isPopular = plan.tier === "pro";
            return (
              <Card key={plan.tier} className={`flex flex-col justify-between ${isPopular ? "border-primary shadow-lg ring-1 ring-primary" : ""}`}>
                <CardHeader>
                  {isPopular && <Badge className="w-fit mb-2">Most Popular</Badge>}
                  <CardTitle className="text-xl">{plan.name}</CardTitle>
                  <div className="mt-4">
                    <span className="text-4xl font-extrabold">{plan.priceLabel}</span>
                  </div>
                  <CardDescription className="mt-2">
                    {plan.seats === 1 ? "1 crew seat" : plan.seats > 100 ? "Unlimited crew seats" : `Up to ${plan.seats} crew seats`}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1">
                  <ul className="space-y-3 text-sm">
                    {plan.features.map((feature, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  <Link to="/auth" className="w-full">
                    <Button className="w-full" variant={isPopular ? "default" : "outline"}>
                      Get Started with {plan.name}
                    </Button>
                  </Link>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Footer (Paddle Compliance) */}
      <footer className="border-t border-border/40 bg-muted/20 mt-auto py-12">
        <div className="container mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-6 text-sm text-muted-foreground">
          <div>
            <p className="font-semibold text-foreground">{BRAND_DIVISION}</p>
            <p className="mt-1">{COPYRIGHT_LINE}</p>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <Link to="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link>
            <Link to="/terms" className="hover:text-foreground transition-colors">Privacy & Refund Policy</Link>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="hover:text-foreground transition-colors">Support: {SUPPORT_EMAIL}</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
