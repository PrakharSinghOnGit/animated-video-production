import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export interface Thumb { src: string; t: number }

export function Lightbox({ items, index, onIndex, onClose, onNote }: { items: Thumb[]; index: number; onIndex: (i: number) => void; onClose: () => void; onNote: (t: number) => void }) {
  const x = items[index];
  const step = (n: number) => onIndex((index + n + items.length) % items.length);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); if (e.key === "ArrowLeft") step(-1); if (e.key === "ArrowRight") step(1); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });
  if (!x) return null;
  return (
    <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center gap-3 bg-black/90 p-3" role="dialog" aria-modal onClick={onClose}>
      <img src={x.src} alt="" className="max-h-[78dvh] max-w-full rounded object-contain" onClick={(e) => e.stopPropagation()} />
      <div className="flex flex-wrap items-center justify-center gap-2 text-muted-foreground" onClick={(e) => e.stopPropagation()}>
        <Button size="sm" onClick={() => step(-1)}>←</Button>
        <span className="font-mono text-xs">{x.t.toFixed(2)} s ({index + 1}/{items.length})</span>
        <Button size="sm" onClick={() => onNote(x.t)}>Add note at this time</Button>
        <Button size="sm" onClick={() => step(1)}>→</Button>
        <Button size="sm" onClick={onClose}>Close</Button>
      </div>
    </div>
  );
}
