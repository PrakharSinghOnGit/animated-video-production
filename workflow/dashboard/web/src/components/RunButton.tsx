import { Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RunButton({ onClick, disabled, running, primary, label = "Run" }: { onClick: () => void; disabled?: boolean; running?: boolean; primary?: boolean; label?: string }) {
  return (
    <Button variant={primary ? "default" : "secondary"} onClick={onClick} disabled={disabled || running} className="min-w-20">
      {running ? <Loader2 className="animate-spin" /> : <Play className="fill-current" />}
      {running ? "Running" : label}
    </Button>
  );
}
