import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { AppProvider, useApp } from "@/hooks/app";
import { useMedia, useStored } from "@/lib/storage";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sheet } from "@/components/ui/sheet";
import { Fold } from "@/components/ui/collapsible";
import { TopBar } from "@/components/TopBar";
import { StepBar } from "@/components/StepBar";
import { LeftCollapseButton, LeftPanel } from "@/components/LeftPanel";
import { MonitorBody } from "@/components/RightPanel";
import { LogPanel } from "@/components/LogPanel";
import { WorkspacePage } from "@/pages/WorkspacePage";
import { UsagePage } from "@/pages/UsagePage";
import { MachinePage } from "@/pages/MachinePage";
import { cn } from "@/lib/utils";

function Toasts() {
  const { toasts } = useApp();
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-16 z-[90] flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => <div key={t.id} className="max-w-md rounded-lg border bg-popover px-3.5 py-2 text-[13px] shadow-lg">{t.msg}</div>)}
    </div>
  );
}

function Shell() {
  const { route, d } = useApp();
  const phone = useMedia("(max-width: 767px)");
  const wide = useMedia("(min-width: 1024px)");
  const [collapsed, setCollapsed] = useStored<boolean>("leftCollapsed", false);
  const [sheet, setSheet] = useState(false);
  useEffect(() => { if (!phone) setSheet(false); }, [phone]);

  const page = route.view === "usage" ? <UsagePage /> : route.view === "machine" ? <MachinePage /> : <WorkspacePage />;
  return (
    <div className="flex h-dvh flex-col">
      <TopBar phone={phone} onMenu={() => setSheet(true)} />
      {route.view === "ws" && d && <StepBar />}
      <div className="flex min-h-0 flex-1">
        {!phone && (
          <aside className={cn("flex shrink-0 flex-col border-r bg-card transition-[width] duration-200", collapsed ? "w-14" : "w-64")} aria-label="Videos and views">
            <LeftCollapseButton collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
            <LeftPanel rail={collapsed} onExpand={() => setCollapsed(false)} />
          </aside>
        )}
        <main className="min-w-0 flex-1 overflow-y-auto" id="main">
          {page}
          {!wide && (
            <div className="mx-auto max-w-[1100px] px-3 pb-24 md:px-4">
              <div className="rounded-xl border bg-card px-3.5">
                <Fold title={<span className="flex items-center gap-2 text-[14px] font-semibold text-foreground"><Activity className="size-4" />Machine, activity and performance</span>} trigger="min-h-12">
                  <div className="-mx-3.5 border-t"><MonitorBody /></div>
                </Fold>
              </div>
            </div>
          )}
        </main>
        {wide && <aside className="w-[340px] shrink-0 overflow-y-auto border-l bg-card" aria-label="Activity and performance"><MonitorBody /></aside>}
      </div>
      <LogPanel phone={phone} />
      {phone && <Sheet open={sheet} onOpenChange={setSheet} title="Videos and views"><div className="flex min-h-0 flex-1 flex-col pt-10"><LeftPanel onPick={() => setSheet(false)} /></div></Sheet>}
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
