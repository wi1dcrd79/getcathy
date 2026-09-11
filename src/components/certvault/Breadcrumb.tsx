import { breadcrumbParts } from "@/lib/compliance";

export function BreadcrumbChips({ value }: { value: string }) {
  const parts = breadcrumbParts(value);
  if (parts.length === 0) return null;
  return (
    <div className="flex w-full min-w-0 flex-wrap items-center gap-1" title={value}>
      {parts.map((p, i) => (
        <span key={`${p}-${i}`} className="flex min-w-0 items-center gap-1">
          {i > 0 && <span className="shrink-0 text-[10px] text-muted-foreground">›</span>}
          <span className="max-w-[46vw] truncate rounded-full border border-border bg-input px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:max-w-[16rem]">
            {p}
          </span>
        </span>
      ))}
    </div>
  );
}
