import React from "react";
import { AbsoluteFill } from "remotion";
import { z } from "zod";
import { COLOR_TOKENS, FONT_TOKENS } from "../tokens";

/**
 * Archetype registry.
 *
 * A storyboard scene with `archetype` + `props` is rendered straight from this
 * registry: no scene .tsx is written. The storyboard author (an LLM) only fills
 * typed JSON, which is validated here before anything renders.
 */

export interface ArchetypeDefinition<S extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  /** One line for the storyboard prompt: when to pick this archetype. */
  useWhen: string;
  schema: S;
  component: React.ComponentType<z.infer<S>>;
  /**
   * Worked examples: the narration the scene plays under, and props whose cues
   * reference words in that narration. Used by the preview harness and as
   * few-shot examples in the storyboard prompt.
   */
  examples: { narration: string; props: z.input<S> }[];
}

const REGISTRY = new Map<string, ArchetypeDefinition>();

export function registerArchetype<S extends z.ZodTypeAny>(def: ArchetypeDefinition<S>): ArchetypeDefinition<S> {
  REGISTRY.set(def.name, def as unknown as ArchetypeDefinition);
  return def;
}

export function getArchetype(name: string): ArchetypeDefinition | undefined {
  return REGISTRY.get(name);
}

export function listArchetypes(): ArchetypeDefinition[] {
  return [...REGISTRY.values()];
}

export interface ArchetypeSpec {
  archetype: string;
  props: unknown;
}

export type ArchetypeValidation =
  | { ok: true; props: unknown }
  | { ok: false; errors: string[] };

export function validateArchetypeSpec(spec: ArchetypeSpec): ArchetypeValidation {
  const def = REGISTRY.get(spec.archetype);
  if (!def) {
    return { ok: false, errors: [`Unknown archetype "${spec.archetype}". Known: ${[...REGISTRY.keys()].join(", ")}`] };
  }
  const parsed = def.schema.safeParse(spec.props ?? {});
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => `${spec.archetype}.props.${i.path.join(".") || "(root)"}: ${i.message}`),
    };
  }
  return { ok: true, props: parsed.data };
}

/** Renders a storyboard archetype spec. Invalid specs render a loud error card (never a quiet placeholder). */
export const ArchetypeScene: React.FC<{ spec: ArchetypeSpec }> = ({ spec }) => {
  const result = validateArchetypeSpec(spec);
  if (!result.ok) {
    return (
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          background: COLOR_TOKENS.negative,
          color: COLOR_TOKENS.bg,
          fontFamily: FONT_TOKENS.mono,
          fontSize: 30,
          padding: 80,
          whiteSpace: "pre-wrap",
        }}
      >
        {`INVALID ARCHETYPE SPEC\n\n${result.errors.join("\n")}`}
      </AbsoluteFill>
    );
  }
  const Component = REGISTRY.get(spec.archetype)!.component;
  return <Component {...(result.props as any)} />;
};

/**
 * Markdown catalog of every registered archetype (when to use it, its JSON schema
 * and a worked example), generated from the registry so prompts never drift.
 */
export function archetypeCatalogMarkdown(): string {
  return listArchetypes()
    .map((def) => {
      const schema = JSON.stringify(z.toJSONSchema(def.schema, { io: "input", unrepresentable: "any" }), null, 1);
      const example = def.examples[0];
      return [
        `### ${def.name}`,
        `**Use when:** ${def.useWhen}`,
        "",
        "Props JSON schema:",
        "```json",
        schema,
        "```",
        example ? `Example (narration: "${example.narration}"):` : "",
        example ? "```json\n" + JSON.stringify({ archetype: def.name, props: example.props }, null, 1) + "\n```" : "",
      ].join("\n");
    })
    .join("\n\n");
}
