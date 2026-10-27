/**
 * @wealthgap/kit
 * Design tokens, backdrop/finish, motion helpers and the Briefing (spy) engine for The Wealth Gap.
 */

// Tokens & Design System
export * from "./tokens";
export * from "./motion";
export * from "./layout";
export * from "./fonts";

// Scene Context & Timing
export * from "./scene";

// Shapes & Geometry
export * from "./shapes";

// Main Composition & Finish
export { Backdrop } from "./main/Backdrop";
export { Finish, type FinishProps } from "./main/Finish";
export { VoiceOver, type VoiceOverProps } from "./main/VoiceOver";

// Backgrounds
export { GridDrift } from "./backgrounds/GridDrift";
export { GlowBlobs } from "./backgrounds/GlowBlobs";
export { Vignette } from "./backgrounds/Vignette";
export { Grain } from "./backgrounds/Grain";
export { UnifiedBackground } from "./backgrounds/UnifiedBackground";

// Lint Rules
export * from "./lint-rules";

export * as paper from "./paper";
export * as spy from "./spy";
