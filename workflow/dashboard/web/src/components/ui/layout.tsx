import * as React from "react";
import { cn } from "@/lib/utils";
import NumberFlow, { type Format } from "@number-flow/react";
import { InfoTip } from "./tooltip";

/** Page title row: title (+ status), one line of context, actions on the right. Long explanations go in `info`. */
export function PageHeader({ title, eyebrow, badges, sub, info, actions, className }: {
  title: React.ReactNode; eyebrow?: React.ReactNode; badges?: React.ReactNode; sub?: React.ReactNode; info?: React.ReactNode; actions?: React.ReactNode; className?: string;
}) {
  return (
    <header className={cn("flex flex-wrap items-start gap-x-6 gap-y-3", className)}>
      <div className="min-w-0 flex-1 basis-72">
        {eyebrow && <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-subtle-foreground">{eyebrow}</div>}
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="m-0 text-[20px] font-semibold leading-tight tracking-[-0.02em]">{title}</h1>
          {info && <InfoTip>{info}</InfoTip>}
          {badges}
        </div>
        {sub && <p className="m-0 mt-1.5 max-w-3xl text-[13px] text-muted-foreground">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** A labelled group inside a page. */
export function Section({ title, info, meta, actions, children, className }: { title: React.ReactNode; info?: React.ReactNode; meta?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("grid gap-3", className)}>
      <div className="flex min-h-7 flex-wrap items-center gap-x-2 gap-y-1">
        <h2 className="m-0 text-[13px] font-semibold tracking-[-0.01em]">{title}</h2>
        {info && <InfoTip>{info}</InfoTip>}
        {meta && <span className="text-xs text-muted-foreground">{meta}</span>}
        {actions && <div className="ml-auto flex items-center gap-1.5">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

/** A value that is a plain number rolls to its new value (NumberFlow) instead of swapping; text is shown as is. */
export function Value({ value, format, suffix }: { value: React.ReactNode; format?: Format; suffix?: string }) {
  if (typeof value !== "number" || !Number.isFinite(value)) return <>{value}</>;
  return <NumberFlow value={value} format={format} suffix={suffix} willChange />;
}

/** A number with its label; `hint` is a quieter third line. A numeric `value` animates (see Value). */
export function Stat({ label, value, hint, className, align = "left", format, suffix, icon, tone }: {
  label: React.ReactNode; value: React.ReactNode; hint?: React.ReactNode; className?: string; align?: "left" | "right";
  format?: Format; suffix?: string;
  /** a small glyph in the theme's colour beside the label */
  icon?: React.ReactNode; tone?: "brand" | "success" | "info" | "warning" | "destructive";
}) {
  return (
    <div className={cn("min-w-0", align === "right" && "text-right", className)}>
      <div className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        {icon && <span className={cn("flex size-4 shrink-0 items-center justify-center [&_svg]:size-3.5", TONE_TEXT[tone ?? "brand"])}>{icon}</span>}
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1 text-[20px] font-semibold leading-tight tracking-[-0.02em] tabular-nums"><Value value={value} format={format} suffix={suffix} /></div>
      {hint && <div className="mt-0.5 truncate text-[11.5px] text-subtle-foreground">{hint}</div>}
    </div>
  );
}

const TONE_TEXT = { brand: "text-brand", success: "text-success", info: "text-info", warning: "text-warning", destructive: "text-destructive" } as const;

/** A KPI tile: Stat on a card. */
export function StatCard({ className, ...p }: React.ComponentProps<typeof Stat>) {
  return <div className={cn("rounded-[10px] border bg-card px-4 py-3 shadow-sm", className)}><Stat {...p} /></div>;
}

/** Empty / first-use state: what is missing and the one thing to do about it. */
export function EmptyState({ icon, title, children, action, className }: { icon?: React.ReactNode; title: React.ReactNode; children?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 rounded-[10px] border border-dashed px-6 py-10 text-center", className)}>
      {icon && <div className="mb-1 flex size-9 items-center justify-center rounded-lg border bg-raised text-muted-foreground [&_svg]:size-4">{icon}</div>}
      <div className="text-[13px] font-medium">{title}</div>
      {children && <div className="max-w-sm text-xs text-muted-foreground">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** Segmented control (2-5 options). */
export function Segmented<T extends string>({ value, onChange, options, label, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: React.ReactNode; icon?: React.ReactNode }[]; label: string; className?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex h-8 shrink-0 items-center gap-0.5 rounded-md border bg-muted p-0.5", className)}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={cn("flex h-full items-center gap-1.5 rounded-[5px] px-2.5 text-xs font-medium text-muted-foreground outline-none transition-[background-color,color,box-shadow] focus-visible:ring-2 focus-visible:ring-ring/60 [&_svg]:size-3.5",
            value === o.value ? "bg-card text-foreground shadow-sm ring-1 ring-border" : "hover:text-foreground")}>
          {o.icon}{o.label}
        </button>
      ))}
    </div>
  );
}

/** Keyboard key hint. */
export const Kbd = ({ children }: { children: React.ReactNode }) => <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-border-strong bg-raised px-1 font-mono text-[10px] text-muted-foreground">{children}</kbd>;
