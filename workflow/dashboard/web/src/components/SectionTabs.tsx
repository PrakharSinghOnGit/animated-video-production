import { useApp } from "@/hooks/app";
import type { Section } from "@/hooks/useRoute";
import { videoStatus } from "@/lib/steps";
import { cn, dur, money, STATUS_LABEL } from "@/lib/utils";
import { StatusDot } from "@/components/Status";

/** The three sections of a video project (they share its data but show separately) and the project overview. */
export function SectionTabs() {
  const { d, route, go } = useApp();
  if (!d) return null;
  const st = d.statuses, items = d.shorts.items, exported = items.filter((s) => s.progress.exported).length;
  const m = (k: "shorts" | "publish") => d.meta[k];
  const tabs: { sec: Section | null; label: string; status: string; sub: string }[] = [
    { sec: null, label: "Overview", status: "", sub: d.title ?? d.id },
    { sec: "video", label: "Video", status: videoStatus(st), sub: d.align.durationMs ? `${dur(d.align.durationMs)} narration` : "script to render" },
    { sec: "shorts", label: "Shorts", status: st.shorts ?? "none", sub: items.length ? `${exported}/${items.length} exported` : "none yet" },
    { sec: "packaging", label: "Packaging", status: st.publish ?? "none", sub: m("publish") ? `${dur(m("publish")!.totalMs)} · ${money(m("publish")!.totalCost)}` : "thumbnails, titles" },
  ];
  return (
    <nav aria-label="Project sections" className="flex shrink-0 overflow-x-auto border-b bg-background">
      {tabs.map((t) => {
        const on = route.sec === t.sec;
        return (
          <button key={t.label} onClick={() => go({ sec: t.sec, step: null, act: null, short: null })} aria-current={on ? "page" : undefined}
            className={cn("flex min-h-11 min-w-[112px] flex-1 basis-0 flex-col items-start justify-center border-b-2 border-b-transparent px-3 py-1 text-left text-muted-foreground hover:bg-accent hover:text-foreground sm:flex-none sm:basis-auto sm:min-w-[150px]", on && "border-b-brand text-foreground")}>
            <span className="flex items-center gap-1.5 text-[13px] font-semibold">{t.status && <StatusDot s={t.status} />}{t.label}</span>
            <span className="max-w-[210px] truncate text-[11px] text-muted-foreground" title={t.status ? `${t.label}: ${STATUS_LABEL[t.status] ?? t.status}` : undefined}>{t.sub}</span>
          </button>
        );
      })}
    </nav>
  );
}
