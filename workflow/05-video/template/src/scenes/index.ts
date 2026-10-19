import React from "react";
import type { SceneMeta } from "@wealthgap/kit";

export interface SceneRegistryEntry {
  id: string;
  slug: string;
  component: React.ComponentType<any>;
  meta: SceneMeta;
}

/**
 * Scene Registry
 * Populated automatically by 'bun run assemble' based on authored scenes in src/scenes/S*.tsx
 */
export const SCENE_REGISTRY: SceneRegistryEntry[] = [];
