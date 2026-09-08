import { breadcrumbParts } from "@/lib/compliance";

export function BreadcrumbChips({ value }: { value: string }) {
  const parts = breadcrumbParts(value);
  if (parts.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {parts.map((p, i) => (
        <span key={`${p}-${i}`} className="flex items-center gap-1">
          {i > 0 && <span className="text-[10px] text-muted-foreground">›</span>}
          <span className="rounded-full border border-border bg-input px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {p}
          </span>
        </span>
      ))}
    </div>
  );
}
