import { cn } from "@/lib/utils";

export const Card = ({ className, ...p }: React.ComponentProps<"div">) => <div className={cn("min-w-0 rounded-[10px] border bg-card text-card-foreground shadow-sm", className)} {...p} />;
export const CardHeader = ({ className, ...p }: React.ComponentProps<"div">) => <div className={cn("flex min-h-12 items-center gap-2.5 border-b px-4 py-2.5 max-sm:px-3", className)} {...p} />;
export const CardTitle = ({ className, ...p }: React.ComponentProps<"h3">) => <h3 className={cn("m-0 text-[13px] font-semibold tracking-[-0.01em]", className)} {...p} />;
export const CardSub = ({ className, ...p }: React.ComponentProps<"span">) => <span className={cn("truncate text-xs text-muted-foreground", className)} {...p} />;
export const CardBody = ({ className, ...p }: React.ComponentProps<"div">) => <div className={cn("grid gap-3 p-4 max-sm:p-3", className)} {...p} />;
