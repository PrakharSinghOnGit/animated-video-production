import { cn } from "@/lib/utils";

export const ActionGrid = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("grid items-stretch gap-2.5 sm:grid-cols-[repeat(auto-fill,minmax(300px,1fr))]", className)}>{children}</div>
);
export const Cols = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("grid items-start gap-3.5 lg:grid-cols-2", className)}>{children}</div>
);
export const SubHead = ({ children }: { children: React.ReactNode }) => (
  <h3 className="m-0 text-[11px] font-medium uppercase tracking-[0.08em] text-subtle-foreground">{children}</h3>
);
