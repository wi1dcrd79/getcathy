import { createFileRoute, Link } from "@tanstack/react-router";
import { PersonalContinuityLog } from "@/components/PersonalContinuityLog";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/my-continuity")({
  head: () => ({ meta: [
    { title: "My Welder Continuity Log | C.A.T.H.Y." },
    { name: "description", content: "Record your welding work and track supervisor-approved continuity evidence in C.A.T.H.Y." },
    { property: "og:title", content: "My Welder Continuity Log | C.A.T.H.Y." },
    { property: "og:description", content: "Personal welding work submissions and verified continuity history." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex" },
  ] }),
  component: MyContinuity,
});
function MyContinuity() {
  return <main className="safe-x safe-bottom mx-auto max-w-5xl px-4 py-8 text-base">
    <header className="mb-6 flex flex-wrap items-center justify-between gap-3"><div><p className="text-muted-foreground">C.A.T.H.Y.</p><h1 className="text-3xl font-bold">My continuity log</h1></div><Link to="/"><Button variant="outline" className="touch-target">Home</Button></Link></header>
    <PersonalContinuityLog />
  </main>;
}