import { cn } from "@/lib/utils";

/** Compact table in a horizontally scrollable box (works at phone width). */
export function DataTable({ head, children, className, maxH }: { head: { label: React.ReactNode; right?: boolean; className?: string }[]; children: React.ReactNode; className?: string; maxH?: string }) {
  return (
    <div className={cn("overflow-auto", className)} style={maxH ? { maxHeight: maxH } : undefined}>
      <table className="w-full border-collapse text-[12.5px]">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i} className={cn("sticky top-0 z-[1] whitespace-nowrap border-b bg-card px-3 py-2 text-[11px] font-medium text-muted-foreground", h.right ? "text-right" : "text-left", h.className)}>{h.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
export const Td = ({ right, className, ...p }: React.ComponentProps<"td"> & { right?: boolean }) => <td className={cn("border-b border-border/60 px-3 py-2 align-top", right && "text-right", className)} {...p} />;
