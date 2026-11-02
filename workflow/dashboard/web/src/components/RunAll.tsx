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
  const { schema, canRun, jobFor } = useApp();
  const { setHot } = useHighlight();
  const runSaved = useRunSaved();
  const a = schema[action];
  if (!a) return <div className="w-[190px]" />;
  const chain: ChainLink[] = a.chain ?? [{ label: a.label, action }];
  const running = !!jobFor(a.label);
  const covered = chain.flatMap((c) => (c.action ? [c.action] : []));
  return (
    <div className="grid shrink-0 justify-items-end gap-1 self-center max-sm:w-full max-sm:justify-items-stretch" onMouseEnter={() => setHot(covered)} onMouseLeave={() => setHot([])} onFocus={() => setHot(covered)} onBlur={() => setHot([])}>
      <RunButton primary running={running} disabled={!canRun(action)} label={chain.length > 1 ? "Run all" : a.label} onClick={() => runSaved(action)} />
      <div className="flex items-center gap-1.5 text-[11px] text-subtle-foreground">
        {a.paid ? <span>{a.paid}</span> : <span>Free</span>}
        {a.long && <><span aria-hidden>·</span><span>{a.long}</span></>}
      </div>
    </div>
  );
}

/** The chain under the header: "runs: A > B > C" plus progress. */
export function RunAllChain({ action }: { action: string }) {
  const { schema, jobFor } = useApp();
  const { setHot } = useHighlight();
  const a = schema[action];
  if (!a) return null;
  const chain = a.chain ?? [{ label: a.label, action }];
  const covered = chain.flatMap((c) => (c.action ? [c.action] : []));
  return (
    <div className="-mx-3" onMouseEnter={() => setHot(covered)} onMouseLeave={() => setHot([])}>
      <MasterChain chain={chain} job={jobFor(a.label)} />
    </div>
  );
}
