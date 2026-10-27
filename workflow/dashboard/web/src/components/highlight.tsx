import { createContext, useContext, useMemo, useState } from "react";

/** Which action cards are lit because the pointer is on a master button that runs them. */
const Ctx = createContext<{ hot: ReadonlySet<string>; setHot: (k: string[]) => void }>({ hot: new Set(), setHot: () => {} });
export const useHighlight = () => useContext(Ctx);

export function HighlightProvider({ children }: { children: React.ReactNode }) {
  const [hot, set] = useState<ReadonlySet<string>>(new Set());
  const value = useMemo(() => ({ hot, setHot: (k: string[]) => set(new Set(k)) }), [hot]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
