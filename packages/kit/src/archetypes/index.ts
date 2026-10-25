/**
 * Archetypes: data-driven, full-frame scene templates rendered straight from a
 * storyboard row ({ archetype, props }). Each archetype module registers itself.
 */
export * from "./cues";
export * from "./ArchetypeFrame";
export * from "./registry";

// Archetype modules (side-effect registration). Keep alphabetical.
import "./BarChart";
import "./Diagram";
import "./KineticHeadline";
import "./LineChart";
import "./StatReveal";
import "./Timeline";
import "./WorldMap";
