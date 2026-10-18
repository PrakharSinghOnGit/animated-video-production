import type { VOSection } from "../types";
import { part1Sections } from "./part1";
import { part2Sections } from "./part2";
import { part3Sections } from "./part3";
import { part4Sections } from "./part4";
import { part5Sections } from "./part5";
import { part6Sections } from "./part6";
import { part7Sections } from "./part7";

export const allSections: VOSection[] = [
  ...part1Sections,
  ...part2Sections,
  ...part3Sections,
  ...part4Sections,
  ...part5Sections,
  ...part6Sections,
  ...part7Sections,
];

export function getAllSections(): VOSection[] {
  return allSections;
}

export function getSectionsByPart(part: number): VOSection[] {
  return allSections.filter((s) => s.part === part);
}

export function getSectionById(id: string): VOSection | undefined {
  return allSections.find((s) => s.id.toLowerCase() === id.toLowerCase());
}

export function getAvailableParts(): number[] {
  const parts = new Set(allSections.map((s) => s.part));
  return Array.from(parts).sort((a, b) => a - b);
}

export {
  part1Sections,
  part2Sections,
  part3Sections,
  part4Sections,
  part5Sections,
  part6Sections,
  part7Sections,
};
