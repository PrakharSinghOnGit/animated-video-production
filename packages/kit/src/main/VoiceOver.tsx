import React from "react";
import { Audio, staticFile } from "remotion";

export interface VoiceOverProps {
  src?: string;
  volume?: number;
}

export const VoiceOver: React.FC<VoiceOverProps> = ({ src, volume = 1 }) => {
  if (!src) return null;
  const resolvedSrc = src.startsWith("http") || src.startsWith("/") ? src : staticFile(src);
  return <Audio src={resolvedSrc} volume={volume} />;
};
