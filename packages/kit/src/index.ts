/**
 * @wealthgap/kit
 * Core primitives, design tokens, charts, and motion helpers for The Wealth Gap.
 */

// Tokens & Design System
export * from "./tokens";
export * from "./motion";
export * from "./layout";
export * from "./fonts";

// Scene Context & Timing
export * from "./scene";

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

// Charts & Primitives
export { BigNumber } from "./charts/BigNumber";
export { BigNumberPropsSchema, type BigNumberProps } from "./charts/BigNumber/schema";
export { BigNumberPreview } from "./charts/BigNumber/preview";

export { BarCompare } from "./charts/BarCompare";
export { BarComparePropsSchema, type BarCompareProps } from "./charts/BarCompare/schema";
export { BarComparePreview } from "./charts/BarCompare/preview";

export { LineDraw } from "./charts/LineDraw";
export { LineDrawPropsSchema, type LineDrawProps } from "./charts/LineDraw/schema";
export { LineDrawPreview } from "./charts/LineDraw/preview";

export { SizeCompare } from "./charts/SizeCompare";
export { SizeComparePropsSchema, type SizeCompareProps } from "./charts/SizeCompare/schema";
export { SizeComparePreview } from "./charts/SizeCompare/preview";

export { IconGrid } from "./charts/IconGrid";
export { IconGridPropsSchema, type IconGridProps } from "./charts/IconGrid/schema";
export { IconGridPreview } from "./charts/IconGrid/preview";

export { MoneyFlow } from "./charts/MoneyFlow";
export { MoneyFlowPropsSchema, type MoneyFlowProps } from "./charts/MoneyFlow/schema";
export { MoneyFlowPreview } from "./charts/MoneyFlow/preview";

// Text Components
export { TitleCard } from "./text/TitleCard";
export { TitleCardPropsSchema, type TitleCardProps } from "./text/TitleCard/schema";
export { TitleCardPreview } from "./text/TitleCard/preview";

export { TermCard } from "./text/TermCard";
export { TermCardPropsSchema, type TermCardProps } from "./text/TermCard/schema";
export { TermCardPreview } from "./text/TermCard/preview";

export { SourceTag } from "./text/SourceTag";
export { SourceTagPropsSchema, type SourceTagProps } from "./text/SourceTag/schema";
export { SourceTagPreview } from "./text/SourceTag/preview";

// Three 3D Components
export { Globe3D } from "./three/Globe3D";
export { Globe3DPropsSchema, type Globe3DProps } from "./three/Globe3D/schema";
export { Globe3DPreview } from "./three/Globe3D/preview";
