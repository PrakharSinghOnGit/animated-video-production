import React from "react";
import { z } from "zod";

import { BigNumber } from "../components/BigNumber";
import { BigNumberPropsSchema } from "../components/BigNumber/schema";

import { BarCompare } from "../components/BarCompare";
import { BarComparePropsSchema } from "../components/BarCompare/schema";

import { LineDraw } from "../components/LineDraw";
import { LineDrawPropsSchema } from "../components/LineDraw/schema";

import { SizeCompare } from "../components/SizeCompare";
import { SizeComparePropsSchema } from "../components/SizeCompare/schema";

import { IconGrid } from "../components/IconGrid";
import { IconGridPropsSchema } from "../components/IconGrid/schema";

import { MoneyFlow } from "../components/MoneyFlow";
import { MoneyFlowPropsSchema } from "../components/MoneyFlow/schema";

import { TitleCard } from "../components/TitleCard";
import { TitleCardPropsSchema } from "../components/TitleCard/schema";

import { TermCard } from "../components/TermCard";
import { TermCardPropsSchema } from "../components/TermCard/schema";

import { SourceTag } from "../components/SourceTag";
import { SourceTagPropsSchema } from "../components/SourceTag/schema";

export interface ComponentEntry<T extends z.ZodTypeAny = z.ZodTypeAny> {
  component: React.ComponentType<any>;
  schema: T;
  description: string;
}

export const COMPONENT_REGISTRY: Record<string, ComponentEntry> = {
  BigNumber: {
    component: BigNumber,
    schema: BigNumberPropsSchema,
    description: "Hero large number count-up animation landing on spoken word anchor",
  },
  BarCompare: {
    component: BarCompare,
    schema: BarComparePropsSchema,
    description: "Comparative staggered bar chart with numbers and highlight coloring",
  },
  LineDraw: {
    component: LineDraw,
    schema: LineDrawPropsSchema,
    description: "Animated line path chart with gradient area and peak annotation",
  },
  SizeCompare: {
    component: SizeCompare,
    schema: SizeComparePropsSchema,
    description: "Visceral area-proportional geometric shapes for scale differences",
  },
  IconGrid: {
    component: IconGrid,
    schema: IconGridPropsSchema,
    description: "100-icon grid (10x10) displaying wealth/population concentration",
  },
  MoneyFlow: {
    component: MoneyFlow,
    schema: MoneyFlowPropsSchema,
    description: "Nodes and animated moving particle flows across financial institutions",
  },
  TitleCard: {
    component: TitleCard,
    schema: TitleCardPropsSchema,
    description: "Dramatic video/scene title card with optional chapter badge",
  },
  TermCard: {
    component: TermCard,
    schema: TermCardPropsSchema,
    description: "Financial term definition card with rough-notation keyword underline",
  },
  SourceTag: {
    component: SourceTag,
    schema: SourceTagPropsSchema,
    description: "Institutional source citation tag for data credibility",
  },
};

/**
 * Validates props against the registered component's Zod schema.
 */
export function validateComponentProps(componentName: string, props: unknown): {
  success: boolean;
  data?: any;
  error?: string;
} {
  const entry = COMPONENT_REGISTRY[componentName];
  if (!entry) {
    return {
      success: false,
      error: `Component "${componentName}" is not registered in the Component Registry.`,
    };
  }

  const result = entry.schema.safeParse(props);
  if (!result.success) {
    return {
      success: false,
      error: `Props validation failed for "${componentName}": ${result.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    };
  }

  return { success: true, data: result.data };
}
