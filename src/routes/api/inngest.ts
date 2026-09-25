import { createFileRoute } from "@tanstack/react-router";
import { serve } from "inngest/edge";
import { inngest } from "@/lib/inngest/client";
import { telemetrySync } from "@/lib/inngest/functions/telemetry-sync";
import { certExpirationDispatcher } from "@/lib/inngest/functions/cert-expiration-dispatcher";

// Inngest serve endpoint. The SDK verifies every request with INNGEST_SIGNING_KEY.
const handler = serve({ client: inngest, functions: [telemetrySync, certExpirationDispatcher] });

export const Route = createFileRoute("/api/inngest")({
  server: {
    handlers: {
      GET: ({ request }) => handler(request),
      POST: ({ request }) => handler(request),
      PUT: ({ request }) => handler(request),
    },
  },
});
