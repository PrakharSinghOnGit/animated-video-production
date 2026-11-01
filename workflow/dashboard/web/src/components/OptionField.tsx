import { Checkbox, Input, NativeSelect } from "@/components/ui/fields";
import type { OptDef } from "@/lib/types";

export type OptValue = string | boolean | string[];

export const initialValue = (o: OptDef, saved: Record<string, unknown>): OptValue => {
  const v = o.volatile ? o.def : (saved[o.key] ?? o.def);
  if (o.type === "bool") return !!v;
  if (o.type === "multi") return Array.isArray(v) ? (v as string[]) : [];
  return v == null ? "" : String(v);
};

/** Whether an option applies under the current values (its `when` rule). */
export const visible = (o: OptDef, defs: OptDef[], vals: Record<string, OptValue>) =>
  !o.when || o.when.in.includes(String(vals[o.when.key] ?? defs.find((d) => d.key === o.when!.key)?.def ?? ""));

/** Values in the shape server.ts validates (empty numbers/text and options hidden by `when` are left out). */
export function toOpts(defs: OptDef[], vals: Record<string, OptValue>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const o of defs) {
    if (!visible(o, defs, vals)) continue;
    const v = vals[o.key];
    if (o.type === "number") { if (v !== "" && v != null) out[o.key] = Number(v); }
    else if (o.type === "bool" || o.type === "multi") out[o.key] = v;
    else if (v !== "" && v != null) out[o.key] = v;
  }
  return out;
}

export function OptionField({ o, value, onChange, choices }: { o: OptDef; value: OptValue; onChange: (v: OptValue) => void; choices?: string[] }) {
  const id = `o_${o.key}_${Math.random().toString(36).slice(2, 7)}`;
  const label = (
    <label htmlFor={id} className="min-w-0 text-xs text-foreground/80">
      {o.label}
      {o.help && <small className="block text-[11px] text-muted-foreground">{o.help}</small>}
    </label>
  );
  if (o.type === "multi") {
    const list = choices ?? o.choices ?? [];
    const sel = new Set(value as string[]);
    return (
      <div className="col-span-full grid gap-1">
        {label}
        <div className="flex flex-wrap gap-x-1 gap-y-0.5">
          {list.length === 0 && <span className="text-xs text-muted-foreground">none yet</span>}
          {list.map((c) => (
            <label key={c} className="flex min-h-9 items-center gap-1.5 pr-2 text-xs max-md:min-h-10">
              <Checkbox checked={sel.has(c)} onCheckedChange={(x) => onChange(x ? [...sel, c] : [...sel].filter((y) => y !== c))} />
              {c}
            </label>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
      {label}
      {o.type === "bool" ? (
        <Checkbox id={id} className="size-5" checked={value as boolean} onCheckedChange={(x) => onChange(x === true)} />
      ) : o.type === "select" ? (
        <NativeSelect id={id} className="w-40" value={String(value)} onChange={(e) => onChange(e.target.value)}>
          {(o.choices ?? []).map((c) => <option key={c}>{c}</option>)}
        </NativeSelect>
      ) : o.type === "number" ? (
        <Input id={id} type="number" inputMode="decimal" className="w-24" min={o.min} max={o.max} step={o.step ?? "any"} value={String(value)} placeholder="default" onChange={(e) => onChange(e.target.value)} />
      ) : (
        <Input id={id} type="text" className="w-44" value={String(value)} placeholder="optional" onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}
