import { ActivityPanel } from "@/components/ActivityPanel";
import { PerformancePanel } from "@/components/PerformancePanel";

/** Activity monitoring on top, performance for the selected video below. Used as the right column and inside the phone fold. */
export function MonitorBody() {
  return (
    <div className="divide-y">
      <ActivityPanel />
      <PerformancePanel />
    </div>
  );
}
