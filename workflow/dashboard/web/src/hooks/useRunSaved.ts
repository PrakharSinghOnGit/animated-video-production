import { useCallback } from "react";
import { initialValue, toOpts } from "@/components/OptionField";
import { store } from "@/lib/storage";
import { useApp } from "./app";

/** Run an action with the options last set on its card (saved in localStorage), or the defaults. */
export function useRunSaved() {
  const { schema, run } = useApp();
  return useCallback((key: string, act?: string) => {
    const defs = schema[key]?.opts ?? [];
    const saved = store.get<Record<string, unknown>>(`opt.${key}`, {});
    void run(key, act, toOpts(defs, Object.fromEntries(defs.map((o) => [o.key, initialValue(o, saved)]))));
  }, [schema, run]);
}
