import type { ComplianceStatus, WelderStatus } from "@/lib/compliance";

const STYLES: Record<string, string> = {
  Compliant: "bg-success/15 text-success border-success/40",
  Active: "bg-success/15 text-success border-success/40",
  "Expiring Soon": "bg-warning/15 text-warning border-warning/40",
  "Grace Period": "bg-warning/15 text-warning border-warning/40",
  "Out of Compliance": "bg-destructive/15 text-destructive border-destructive/50",
  Lapsed: "bg-destructive/15 text-destructive border-destructive/50",
};

export function StatusBadge({
  status,
  className = "",
}: {
  status: ComplianceStatus | WelderStatus;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${STYLES[status]} ${className}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}
