import { useCallback } from "react";
import { initialValue, toOpts } from "@/components/OptionField";
import { store } from "@/lib/storage";
import { useApp } from "./app";

/** Run an action with the options last set on its card (saved in localStorage), or the defaults. */
export function useRunSaved() {
  const run = useRunWith();
  return useCallback((key: string, act?: string) => run(key, act), [run]);
}

/** Same, with some options set for this one run (e.g. the acts picked in a list, a frame time). */
export function useRunWith() {
  const { schema, run } = useApp();
  return useCallback((key: string, act?: string, over: Record<string, unknown> = {}) => {
    const defs = schema[key]?.opts ?? [];
    const saved = store.get<Record<string, unknown>>(`opt.${key}`, {});
    return run(key, act, { ...toOpts(defs, Object.fromEntries(defs.map((o) => [o.key, initialValue(o, saved)]))), ...over });
  }, [schema, run]);
}
