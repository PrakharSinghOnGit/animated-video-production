import React from "react";
import { UnifiedBackground, type UnifiedBackgroundProps } from "../backgrounds/UnifiedBackground";

export const Backdrop: React.FC<UnifiedBackgroundProps> = (props) => {
  return <UnifiedBackground {...props} />;
};
