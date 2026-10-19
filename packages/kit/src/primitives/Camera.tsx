import React, { createContext, useContext, useMemo } from "react";
import { AbsoluteFill } from "remotion";

export interface CameraContextValue {
  scale: number;
  focus: [number, number];
  rotate: number;
  origin: [number, number];
  toScreen: (worldCoord: [number, number]) => [number, number];
}

const CameraContext = createContext<CameraContextValue>({
  scale: 1,
  focus: [0, 0],
  rotate: 0,
  origin: [960, 540],
  toScreen: ([x, y]) => [x + 960, y + 540],
});

export interface CameraProps {
  scale?: number;
  zoom?: number;
  focus?: [number, number];
  rotate?: number;
  origin?: [number, number];
  children?: React.ReactNode;
}

export const Camera: React.FC<CameraProps> = ({
  scale = 1,
  zoom,
  focus = [0, 0],
  rotate = 0,
  origin = [960, 540],
  children,
}) => {
  const actualScale = zoom ?? scale;
  const [ox, oy] = origin;
  const [fx, fy] = focus;

  const toScreen = useMemo(() => {
    const rotRad = (rotate * Math.PI) / 180;
    const cos = Math.cos(rotRad);
    const sin = Math.sin(rotRad);

    return ([wx, wy]: [number, number]): [number, number] => {
      // 1. Relative to focus
      const dx = wx - fx;
      const dy = wy - fy;
      // 2. Rotate
      const rx = dx * cos - dy * sin;
      const ry = dx * sin + dy * cos;
      // 3. Scale & translate to screen origin
      return [ox + rx * actualScale, oy + ry * actualScale];
    };
  }, [actualScale, fx, fy, rotate, ox, oy]);

  const contextValue = useMemo<CameraContextValue>(
    () => ({ scale: actualScale, focus, rotate, origin, toScreen }),
    [actualScale, focus, rotate, origin, toScreen]
  );

  return (
    <CameraContext.Provider value={contextValue}>
      <AbsoluteFill
        style={{
          transformOrigin: "0 0",
          transform: `translate3d(${ox}px, ${oy}px, 0) scale(${actualScale}) rotate(${rotate}deg) translate3d(${-fx}px, ${-fy}px, 0)`,
          pointerEvents: "none",
        }}
      >
        {children}
      </AbsoluteFill>
    </CameraContext.Provider>
  );
};

export function useCamera(): CameraContextValue {
  return useContext(CameraContext);
}
