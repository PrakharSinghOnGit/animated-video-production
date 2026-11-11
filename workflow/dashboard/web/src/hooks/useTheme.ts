import { useCallback, useEffect, useState } from "react";
import { store } from "@/lib/storage";

const current = () => (document.documentElement.classList.contains("dark") ? "dark" : "light") as "dark" | "light";

/** Dark by default; the choice is remembered (index.html applies it before first paint). Every user of the hook follows a switch. */
export function useTheme(): ["dark" | "light", () => void] {
  const [t, setT] = useState(current);
  useEffect(() => {
    const on = () => setT(current());
    window.addEventListener("wg:theme", on);
    return () => window.removeEventListener("wg:theme", on);
  }, []);
  const toggle = useCallback(() => {
    const n = current() === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", n === "dark");
    store.set("theme", n);
    window.dispatchEvent(new Event("wg:theme"));
  }, []);
  return [t, toggle];
}
