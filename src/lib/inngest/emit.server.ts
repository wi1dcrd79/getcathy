import { eventSchemas, type CathyEventData, type CathyEventName } from "./client";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/inngest";

/**
 * Sends a typed event to Inngest through the Lovable connector gateway.
 * Server-side only: both keys are secrets.
 */
export async function emitEvent<T extends CathyEventName>(
  name: T,
  data: CathyEventData<T>,
): Promise<void> {
  // Validate before it leaves the app so malformed payloads never reach a job.
  eventSchemas[name].parse(data);

  const lovableKey = process.env["LOVABLE_API_KEY"];
  const connectionKey = process.env["INNGEST_API_KEY"];
  if (!lovableKey) throw new Error("LOVABLE_API_KEY is not configured");
  if (!connectionKey) throw new Error("INNGEST_API_KEY is not configured");

  const response = await fetch(`${GATEWAY_URL}/e/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": connectionKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name, data }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error(`[inngest] emit ${name} failed [${response.status}]: ${body}`);
    throw new Error(`Failed to queue background job [${response.status}]: ${body}`);
  }
}

/** Sends several typed events in one gateway round trip. */
export async function emitEvents(
  events: Array<{ [K in CathyEventName]: { name: K; data: CathyEventData<K> } }[CathyEventName]>,
): Promise<void> {
  if (events.length === 0) return;
  for (const event of events) eventSchemas[event.name].parse(event.data);

  const lovableKey = process.env["LOVABLE_API_KEY"];
  const connectionKey = process.env["INNGEST_API_KEY"];
  if (!lovableKey || !connectionKey) throw new Error("Inngest is not configured");

  const response = await fetch(`${GATEWAY_URL}/e/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": connectionKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(events),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error(`[inngest] batch emit failed [${response.status}]: ${body}`);
    throw new Error(`Failed to queue background jobs [${response.status}]: ${body}`);
  }
}
