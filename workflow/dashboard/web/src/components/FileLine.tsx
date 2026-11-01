import { Markdown } from "@/components/ui/markdown";

export const Empty = ({ children }: { children: React.ReactNode }) => <div className="py-1 text-xs text-muted-foreground">{children}</div>;
export const Note = ({ children, tone = "warning" }: { children: React.ReactNode; tone?: "warning" | "danger" }) => (
  <div className={tone === "danger" ? "rounded-lg border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-[12.5px]" : "rounded-lg border border-warning/40 bg-warning/10 px-3.5 py-2.5 text-[12.5px]"}>{children}</div>
);
/** Markdown text (reviews, notes) rendered, in a scrollable box. */
export const Prose = ({ children }: { children: React.ReactNode }) => (
  <div className="max-h-[480px] overflow-auto">{typeof children === "string" ? <Markdown>{children}</Markdown> : children}</div>
);
