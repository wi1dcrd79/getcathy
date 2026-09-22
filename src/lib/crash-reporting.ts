// Privacy-safe crash reporting helpers.
//
// Nothing here may carry user content: no emails, names, asset records, notes,
// photos, tokens or query strings. Only the app-generated failure detail, the
// screen it happened on, and coarse device facts are collected.

export interface DeviceFacts {
  device_kind: string;
  platform: string;
  viewport: string;
  app_build: string;
  was_offline: boolean;
}

const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]"],
  [/eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]+/g, "[token]"],
  [/\b(sb|sk|pk|pdl)_[A-Za-z0-9_-]{8,}/g, "[key]"],
  [/\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/g, "[phone]"],
  [/[?&][\w-]+=[^\s&]+/g, ""],
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "[id]"],
];

/** Strip anything that could identify a person or leak a credential. */
export function scrub(text: string, limit = 800): string {
  let out = text;
  for (const [pattern, replacement] of SECRET_PATTERNS) out = out.replace(pattern, replacement);
  return out.replace(/\s+/g, " ").trim().slice(0, limit);
}

const SCREEN_LABELS: Array<[string, string]> = [
  ["/scan-transfer", "Yard Scanner"],
  ["/risk-analysis", "AI Risk Review"],
  ["/audit-binder", "Audit Binder"],
  ["/company-portal", "Company Portal"],
  ["/company-admin", "Admin Console"],
  ["/crash-reports", "Crash Reports"],
  ["/admin-invoices", "Invoices"],
  ["/admin-login", "Owner Sign In"],
  ["/super-admin", "Owner Console"],
  ["/personnel", "Personnel"],
  ["/billing", "My Plan"],
  ["/account", "Account"],
  ["/import", "CSV Importer"],
  ["/terms", "Terms"],
  ["/auth", "Sign In"],
];

export function screenLabel(route: string): string {
  const match = SCREEN_LABELS.find(([path]) => route.startsWith(path));
  return match ? match[1] : route === "/" ? "Dashboard" : route;
}

export function deviceFacts(): DeviceFacts {
  if (typeof window === "undefined") {
    return {
      device_kind: "unknown",
      platform: "unknown",
      viewport: "unknown",
      app_build: "unknown",
      was_offline: false,
    };
  }
  const ua = navigator.userAgent;
  const kind = /iPad|Tablet/i.test(ua)
    ? "Tablet"
    : /Mobi|Android|iPhone/i.test(ua)
      ? "Phone"
      : "Desktop";
  const platform = /Android/i.test(ua)
    ? "Android"
    : /iPhone|iPad|iPod/i.test(ua)
      ? "iOS"
      : /Windows/i.test(ua)
        ? "Windows"
        : /Mac OS/i.test(ua)
          ? "macOS"
          : /Linux/i.test(ua)
            ? "Linux"
            : "Other";
  const browser = /CriOS|Chrome/i.test(ua)
    ? "Chrome"
    : /Firefox/i.test(ua)
      ? "Firefox"
      : /Safari/i.test(ua)
        ? "Safari"
        : "Other browser";
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as { standalone?: boolean }).standalone === true;
  return {
    device_kind: kind,
    platform,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    app_build: `${browser} · ${standalone ? "installed app" : "web"}`,
    was_offline: !navigator.onLine,
  };
}

/** Plain-language problem headline a safety manager can scan in a list. */
export function problemLabel(detail: string, offline: boolean): string {
  const text = detail.toLowerCase();
  if (offline || text.includes("failed to fetch") || text.includes("networkerror")) {
    return "Lost connection while saving work";
  }
  if (text.includes("401") || text.includes("unauthorized") || text.includes("jwt")) {
    return "Signed-out session blocked an action";
  }
  if (text.includes("403") || text.includes("permission") || text.includes("row-level")) {
    return "Permission denied for this action";
  }
  if (text.includes("402") || text.includes("credits")) return "AI credits unavailable";
  if (text.includes("429")) return "Service was too busy";
  if (text.includes("quota") || text.includes("storage")) return "Device storage limit reached";
  if (text.includes("chunk") || text.includes("dynamically imported module")) {
    return "App update failed to load";
  }
  if (text.includes("undefined") || text.includes("null")) return "A screen failed to draw";
  return "Unexpected app error";
}

/** Recoverable steps the crew (or the safety manager) can actually take. */
export function recoveryActions(problem: string): string[] {
  switch (problem) {
    case "Lost connection while saving work":
      return [
        "Work is queued on the device and syncs when signal returns",
        "Move to an area with coverage, then reopen the Yard Scanner",
        "Confirm the transfer landed in location history after syncing",
      ];
    case "Signed-out session blocked an action":
      return ["Sign in again", "Retry the action", "Re-enter anything not saved"];
    case "Permission denied for this action":
      return [
        "Check the crew member's role in the Admin Console",
        "Confirm the account is not past due (past-due accounts are read-only)",
      ];
    case "AI credits unavailable":
      return ["Add AI credits for the workspace", "Retry the risk review"];
    case "Service was too busy":
      return ["Wait a minute and try again"];
    case "Device storage limit reached":
      return ["Sync queued scans", "Close other apps or clear device storage"];
    case "App update failed to load":
      return ["Close and reopen the app to pick up the newest version", "Refresh the page"];
    default:
      return ["Reload the screen", "Retry the action", "Report to support if it repeats"];
  }
}
