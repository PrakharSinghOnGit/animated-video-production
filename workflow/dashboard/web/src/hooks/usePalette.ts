import { useCallback, useState } from "react";
import { applyPalette, paletteById, type Palette } from "@/theme/channel";
import { store } from "@/lib/storage";

/** Apply the palette this browser picked (or the channel's) once at start; index.html already set the seeds. */
export function initPalette() { applyPalette(paletteById(store.get<string | null>("palette", null))); }

/** The palette picked in Settings → Appearance, per browser. The seeds are stored too, so index.html can paint them first. */
export function usePalette(): [Palette, (id: string) => void] {
  const [p, setP] = useState<Palette>(() => paletteById(store.get<string | null>("palette", null)));
  const set = useCallback((id: string) => {
    const n = paletteById(id);
    applyPalette(n);
    store.set("palette", n.id);
    store.set("palette.seeds", { brand: n.brand, positive: n.positive, negative: n.negative, info: n.info, paper: n.paper });
    setP(n);
  }, []);
  return [p, set];
}
