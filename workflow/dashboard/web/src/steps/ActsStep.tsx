import { useApp } from "@/hooks/app";
import { dur, money, cn } from "@/lib/utils";
import { Card, CardHeader, CardSub, CardTitle } from "@/components/ui/card";
import { ActionCard } from "@/components/ActionCard";
import { StatusDot } from "@/components/Status";
import { ActFlow } from "./ActDetail";

/** Act picker (with the "author all" options), then the selected act as a flow. */
export function ActsStep() {
  const { d, route, go } = useApp();
  if (!d) return null;
  const acts = d.acts;
  const a = acts.find((x) => x.id === route.act) ?? acts[0];
  if (!acts.length) return <div className="text-xs text-muted-foreground">Plan the video first.</div>;
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader><CardTitle>Acts</CardTitle><CardSub>{d.acts.filter((x) => x.scene).length}/{acts.length} drawn · Run all authors every act that has no file yet</CardSub></CardHeader>
        <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {acts.map((x) => {
            const rv = x.reviews[0];
            return (
              <button key={x.id} onClick={() => go({ act: x.id })} aria-current={x.id === a?.id}
                className={cn("grid min-h-12 grid-cols-[auto_1fr_auto] items-center gap-2.5 bg-card px-3 py-2 text-left hover:bg-accent", x.id === a?.id && "bg-accent shadow-[inset_2px_0_0_var(--brand)]")}>
                <StatusDot s={x.status} />
                <span className="min-w-0"><span className="block truncate"><span className="font-mono">{x.id}</span> {x.title}</span>
                  <span className="text-[11px] text-muted-foreground">{((x.end - x.start) / 1000).toFixed(0)} s{x.meta ? ` · ${dur(x.meta.totalMs)} · ${money(x.meta.totalCost)}` : ""}</span></span>
                <span className="text-[11px] text-muted-foreground">{rv ? `sync ${rv.sync}/10` : x.critic ? `critic ${x.critic.score}/10` : ""}</span>
              </button>
            );
          })}
        </div>
        <div className="border-t px-1 py-1"><ActionCard bare id="acts.all" /></div>
      </Card>
      {a && <ActFlow key={a.id} a={a} />}
    </div>
  );
}
