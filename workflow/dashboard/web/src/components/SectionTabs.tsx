import { Clapperboard, Film, LayoutGrid, PackageOpen } from "lucide-react";
import { useApp } from "@/hooks/app";
import type { Section } from "@/hooks/useRoute";
import { videoStatus } from "@/lib/steps";
import { cn, dur, money, STATUS_LABEL } from "@/lib/utils";
import { StatusDot } from "@/components/Status";

/** The sections of a video project (they share its data but show separately) and the project overview. */
export function SectionTabs() {
  const { d, route, go } = useApp();
  if (!d) return null;
  const st = d.statuses, items = d.shorts.items, exported = items.filter((s) => s.progress.exported).length;
  const pub = d.meta.publish;
  const tabs: { sec: Section | null; label: string; icon: typeof Film; status: string; sub: string }[] = [
    { sec: null, label: "Overview", icon: LayoutGrid, status: "", sub: "" },
    { sec: "video", label: "Video", icon: Clapperboard, status: videoStatus(st), sub: d.align.durationMs ? dur(d.align.durationMs) : "" },
    { sec: "shorts", label: "Shorts", icon: Film, status: st.shorts ?? "none", sub: items.length ? `${exported}/${items.length}` : "" },
    { sec: "packaging", label: "Packaging", icon: PackageOpen, status: st.publish ?? "none", sub: pub ? money(pub.totalCost) : "" },
  ];
  return (
    <nav aria-label="Project sections" className="flex h-11 shrink-0 items-stretch gap-1 overflow-x-auto border-b bg-background px-4 max-sm:px-2">
      {tabs.map((t) => {
        const on = route.sec === t.sec, Icon = t.icon;
        return (
          <button key={t.label} onClick={() => go({ sec: t.sec, step: null, act: null, short: null })} aria-current={on ? "page" : undefined}
            title={t.status ? `${t.label}: ${STATUS_LABEL[t.status] ?? t.status}` : undefined}
            className={cn("group relative flex shrink-0 items-center gap-2 px-3 text-[13px] font-medium outline-none transition-colors focus-visible:bg-accent", on ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
            <Icon className={cn("size-[15px]", on ? "text-foreground" : "text-subtle-foreground group-hover:text-muted-foreground")} />
            {t.label}
            {t.status && <StatusDot s={t.status} />}
            {t.sub && <span className="text-[11.5px] font-normal tabular-nums text-subtle-foreground">{t.sub}</span>}
            <span aria-hidden className={cn("absolute inset-x-2 bottom-0 h-[2px] rounded-full", on ? "bg-brand" : "bg-transparent")} />
          </button>
        );
      })}
    </nav>
  );
}
