import { useProfile } from "@/hooks/useProfile";

/**
 * Read-Only Compliance Grace Period banner.
 * Shown whenever billing has lapsed — records stay fully readable, writes are blocked.
 */
export function PastDueBanner() {
  const { isPastDue, graceDaysLeft } = useProfile();
  if (!isPastDue) return null;

  return (
    <div className="no-print w-full border-b border-warning bg-warning/15 px-4 py-2 text-center text-xs font-semibold uppercase tracking-widest text-warning">
      Account Past Due — Compliance &amp; Audit Records Kept Safe in Read-Only Mode. Update payment to
      resume moves.
      {graceDaysLeft !== null && graceDaysLeft > 0 && (
        <span className="ml-2 normal-case tracking-normal opacity-90">
          ({graceDaysLeft} day{graceDaysLeft === 1 ? "" : "s"} of grace remaining)
        </span>
      )}
    </div>
  );
}
