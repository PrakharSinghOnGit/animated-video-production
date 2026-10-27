import { Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { RunButton } from "@/components/RunButton";
import { MasterChain } from "@/components/MasterChain";
import { useHighlight } from "@/components/highlight";
import { useApp } from "@/hooks/app";
import { useRunSaved } from "@/hooks/useRunSaved";
import type { ChainLink } from "@/lib/types";

/**
 * The step's single "Run all" button (always top right of the step header) with the chain it covers.
 * Hovering it lights the covered blocks; while it runs the chips show which command is current.
 */
export function RunAll({ action }: { action: string }) {
  const { schema, busy } = useApp();
  const { setHot } = useHighlight();
  const runSaved = useRunSaved();
  const a = schema[action];
  if (!a) return <div className="w-[190px]" />;
  const chain: ChainLink[] = a.chain ?? [{ label: a.label, action }];
  const running = busy?.label === a.label;
  const covered = chain.flatMap((c) => (c.action ? [c.action] : []));
  return (
    <div className="grid w-[190px] shrink-0 justify-items-stretch gap-1.5 max-sm:w-full" onMouseEnter={() => setHot(covered)} onMouseLeave={() => setHot([])} onFocus={() => setHot(covered)} onBlur={() => setHot([])}>
      <RunButton primary={!a.paid} running={running} disabled={!!busy} label={`Run all · ${a.label}`} onClick={() => runSaved(action)} />
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <Badge tone="neutral"><Layers className="size-3" />{a.paid ? `Paid ${a.paid}` : "Free"}</Badge>
        <span>{a.long ?? ""}</span>
      </div>
    </div>
  );
}

/** The chain under the header: "runs: A > B > C" plus progress. */
export function RunAllChain({ action }: { action: string }) {
  const { schema, busy } = useApp();
  const { setHot } = useHighlight();
  const a = schema[action];
  if (!a) return null;
  const chain = a.chain ?? [{ label: a.label, action }];
  const covered = chain.flatMap((c) => (c.action ? [c.action] : []));
  return (
    <div className="-mx-3 px-0" onMouseEnter={() => setHot(covered)} onMouseLeave={() => setHot([])}>
      <MasterChain chain={chain} job={busy?.label === a.label ? busy : null} />
    </div>
  );
}
