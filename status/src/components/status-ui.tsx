import { STATUS_LABEL_FR, type Status } from "@/lib/types";

const TEXT: Record<Status, string> = {
  operational: "text-ok",
  degraded: "text-warn",
  partial_outage: "text-orange",
  major_outage: "text-bad",
  maintenance: "text-maint",
  unknown: "text-muted",
};

const DOT: Record<Status, string> = {
  operational: "bg-[var(--ok-fill)]",
  degraded: "bg-[var(--warn-fill)]",
  partial_outage: "bg-[var(--orange-fill)]",
  major_outage: "bg-[var(--bad-fill)]",
  maintenance: "bg-[var(--maint-fill)]",
  unknown: "bg-nodata ring-1 ring-inset ring-line",
};

export function StatusDot({ status, className = "" }: { status: Status; className?: string }) {
  return <span aria-hidden className={`inline-block size-2.5 shrink-0 rounded-full ${DOT[status]} ${className}`} />;
}

/** Status as text first (never colour alone). */
export function StatusLabel({ status }: { status: Status }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${TEXT[status]}`}>
      <StatusDot status={status} />
      {STATUS_LABEL_FR[status]}
    </span>
  );
}

const BANNER: Record<Status, string> = {
  operational: "border-ok/40 bg-ok/10",
  degraded: "border-warn/50 bg-warn/10",
  partial_outage: "border-orange/50 bg-orange/10",
  major_outage: "border-bad/50 bg-bad/10",
  maintenance: "border-maint/50 bg-maint/10",
  unknown: "border-line bg-subtle",
};

/** The global banner. `aria-live` so a screen reader hears the change when the page refreshes. */
export function GlobalBanner({ status, text, detail }: { status: Status; text: string; detail?: string }) {
  return (
    <div role="status" aria-live="polite" data-testid="global-banner" data-status={status} className={`rounded-2xl border px-5 py-4 ${BANNER[status]}`}>
      <p className={`flex items-center gap-2.5 text-lg font-semibold ${TEXT[status]}`}>
        <StatusDot status={status} className="size-3" />
        <span className="text-fg">{text}</span>
      </p>
      {detail ? <p className="mt-1 pl-[1.375rem] text-sm text-muted">{detail}</p> : null}
    </div>
  );
}
