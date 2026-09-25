const RESEND_URL = "https://api.resend.com/emails";
const DEFAULT_FROM = "C.A.T.H.Y. Certs <certs@notifications.getcathy.app>";

export async function sendCertEmail(input: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ id: string }> {
  const apiKey = process.env["RESEND_API_KEY"];
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured");
  const from = process.env["RESEND_FROM_EMAIL"] || DEFAULT_FROM;

  const res = await fetch(RESEND_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [input.to], subject: input.subject, html: input.html }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend request failed [${res.status}]: ${body}`);
  }
  const data = (await res.json()) as { id?: string };
  if (!data.id) throw new Error("Resend response missing id");
  return { id: data.id };
}
