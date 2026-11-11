import { useEffect, useState } from "react";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { AppProvider, useApp } from "@/hooks/app";
import { useMedia, useStored } from "@/lib/storage";
import { useResize } from "@/hooks/useResize";
import { TooltipProvider, Tip } from "@/components/ui/tooltip";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { TopBar } from "@/components/TopBar";
import { LeftPanel } from "@/components/LeftPanel";
import { MonitorBody } from "@/components/RightPanel";
import { Terminal } from "@/components/Terminal";
import { WorkspacePage } from "@/pages/WorkspacePage";
import { OverviewPage } from "@/pages/OverviewPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { UsagePage } from "@/pages/UsagePage";
import { MachinePage } from "@/pages/MachinePage";
import { AnalyticsPage } from "@/pages/AnalyticsPage";
import { CommentsPage } from "@/pages/CommentsPage";
import { IdeasPage } from "@/pages/IdeasPage";
import { cn } from "@/lib/utils";

const LEFT = { min: 200, max: 380, def: 260, rail: 52 };
const RIGHT = { min: 280, max: 520, def: 340, rail: 40 };

function Toasts() {
  const { toasts } = useApp();
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-16 z-[90] flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => <div key={t.id} className="max-w-md rounded-lg border border-border-strong bg-popover px-3.5 py-2.5 text-[13px] shadow-md animate-in fade-in-0 slide-in-from-bottom-2 duration-200">{t.msg}</div>)}
    </div>
  );
}

/** Thin drag bar between panels (pointer drag or arrow keys). */
function Handle({ props, label }: { props: ReturnType<typeof useResize>; label: string }) {
  return <div role="separator" aria-orientation="vertical" aria-label={label} tabIndex={0} {...props} className="group relative z-10 w-1 shrink-0 cursor-col-resize touch-none bg-border hover:bg-brand/70 focus-visible:bg-brand" />;
}

function Shell() {
  const { route } = useApp();
  const phone = useMedia("(max-width: 767px)");
  const wide = useMedia("(min-width: 1024px)");
  const [lw, setLw] = useStored<number>("left.w", LEFT.def);
  const [lc, setLc] = useStored<boolean>("leftCollapsed", false);
  const [rw, setRw] = useStored<number>("right.w", RIGHT.def);
  const [rc, setRc] = useStored<boolean>("right.collapsed", false);
  const [leftSheet, setLeftSheet] = useState(false), [rightSheet, setRightSheet] = useState(false);
  useEffect(() => { if (!phone) setLeftSheet(false); }, [phone]);
  useEffect(() => { if (wide) setRightSheet(false); }, [wide]);
  const lres = useResize(lw, setLw, LEFT.min, LEFT.max, 1), rres = useResize(rw, setRw, RIGHT.min, RIGHT.max, -1);

  const page = route.view === "ws" ? <WorkspacePage /> : (
    <div key={route.view} className="wg-enter min-h-0 flex-1 overflow-y-auto">
      {route.view === "analytics" ? <AnalyticsPage /> : route.view === "comments" ? <CommentsPage /> : route.view === "ideas" ? <IdeasPage /> : route.view === "usage" ? <UsagePage /> : route.view === "machine" ? <MachinePage /> : route.view === "settings" ? <SettingsPage /> : <OverviewPage />}
    </div>
  );
  return (
    <div className="flex h-dvh flex-col pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pt-[env(safe-area-inset-top)]">
      <TopBar phone={phone} showStats={!wide} onMenu={() => setLeftSheet(true)} onStats={() => setRightSheet(true)} />
      <div className="flex min-h-0 flex-1">
        {!phone && (
          <>
            <aside className="flex shrink-0 flex-col bg-card" style={{ width: lc ? LEFT.rail : lw }} aria-label="Navigation and videos">
              <LeftPanel rail={lc} onCollapse={() => setLc(true)} onExpand={() => setLc(false)} />
            </aside>
            {lc ? <div className="w-px shrink-0 bg-border" /> : <Handle props={lres} label="Resize left panel" />}
          </>
        )}
        <main className="flex min-w-0 flex-1 flex-col" id="main">
          {page}
          <Terminal phone={phone} />
        </main>
        {wide && (
          <>
            {rc ? <div className="w-px shrink-0 bg-border" /> : <Handle props={rres} label="Resize right panel" />}
            <aside className={cn("flex shrink-0 flex-col bg-card")} style={{ width: rc ? RIGHT.rail : rw }} aria-label="Stats">
              <div className={cn("flex shrink-0 p-1", rc ? "justify-center" : "justify-start")}>
                <Tip label={rc ? "Expand stats" : "Collapse stats"} side="left"><Button variant="ghost" size="icon" className="size-8" onClick={() => setRc(!rc)} aria-label={rc ? "Expand stats panel" : "Collapse stats panel"}>{rc ? <PanelRightOpen /> : <PanelRightClose />}</Button></Tip>
              </div>
              {!rc && <div className="min-h-0 flex-1 overflow-y-auto"><MonitorBody /></div>}
            </aside>
          </>
        )}
      </div>
      {phone && <Sheet open={leftSheet} onOpenChange={setLeftSheet} title="Navigation and videos"><div className="flex min-h-0 flex-1 flex-col pt-10"><LeftPanel onPick={() => setLeftSheet(false)} /></div></Sheet>}
      {!wide && <Sheet open={rightSheet} onOpenChange={setRightSheet} side="right" title="Stats" className="w-[92vw] max-w-md"><div className="min-h-0 flex-1 overflow-y-auto pt-10"><MonitorBody /></div></Sheet>}
      <Toasts />
    </div>
  );
}

export default function App() {
  return (
    <TooltipProvider>
      <AppProvider><Shell /></AppProvider>
    </TooltipProvider>
  );
}
