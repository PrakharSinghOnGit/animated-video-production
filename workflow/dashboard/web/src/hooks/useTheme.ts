import { useCallback, useState } from "react";
import { store } from "@/lib/storage";

/** Dark by default; the choice is remembered (index.html applies it before first paint). */
export function useTheme(): ["dark" | "light", () => void] {
  const [t, setT] = useState<"dark" | "light">(() => (document.documentElement.classList.contains("dark") ? "dark" : "light"));
  const toggle = useCallback(() => {
    const n = t === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", n === "dark");
    store.set("theme", n);
    setT(n);
  }, [t]);
  return [t, toggle];
}
