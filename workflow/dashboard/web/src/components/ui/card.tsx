import { cn } from "@/lib/utils";

export const Card = ({ className, ...p }: React.ComponentProps<"div">) => <div className={cn("min-w-0 rounded-lg border bg-card text-card-foreground", className)} {...p} />;
export const CardHeader = ({ className, ...p }: React.ComponentProps<"div">) => <div className={cn("flex min-h-11 items-center gap-2.5 border-b px-3.5 py-2", className)} {...p} />;
export const CardTitle = ({ className, ...p }: React.ComponentProps<"h3">) => <h3 className={cn("m-0 text-[13px] font-semibold", className)} {...p} />;
export const CardSub = ({ className, ...p }: React.ComponentProps<"span">) => <span className={cn("truncate text-xs text-muted-foreground", className)} {...p} />;
export const CardBody = ({ className, ...p }: React.ComponentProps<"div">) => <div className={cn("grid gap-2.5 p-3.5", className)} {...p} />;
